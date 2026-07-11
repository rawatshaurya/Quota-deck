import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { StatusStore } from "./lib/status-store.mjs";

const root = fileURLToPath(new URL("./public/", import.meta.url));
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 4173);
const dashboardSecret = process.env.DASHBOARD_SECRET || "";
const viewSecret = process.env.QUOTA_DECK_VIEW_SECRET || "";
const pairingCode = process.env.QUOTA_DECK_PAIRING_CODE || "";
const lanUrls = parseLanUrls(process.env.QUOTA_DECK_LAN_URLS);
const demo = process.env.DEMO_MODE !== "false";
const tlsCert = process.env.TLS_CERT;
const tlsKey = process.env.TLS_KEY;
const secureTransport = Boolean(tlsCert && tlsKey);
const trustLoopback = process.env.QUOTA_DECK_TRUST_LOOPBACK !== "false";
const store = new StatusStore({ demo });
const eventClients = new Map();
const pairingAttempts = new Map();

if (Boolean(tlsCert) !== Boolean(tlsKey)) {
  throw new Error("TLS_CERT and TLS_KEY must be provided together.");
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};

const requestHandler = async (request, response) => {
  applySecurityHeaders(response);
  let url;
  try {
    url = new URL(request.url, `${secureTransport ? "https" : "http"}://${request.headers.host || "localhost"}`);
  } catch {
    return json(response, 400, { error: "Invalid request URL." });
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    return json(response, 200, { ok: true, secure: secureTransport });
  }

  if (request.method === "POST" && url.pathname === "/api/pair") {
    return pairDevice(request, response);
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    response.setHeader("Set-Cookie", sessionCookie("", { expired: true }));
    return json(response, 200, { ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/setup") {
    if (!trustLoopback || !isLoopback(request.socket.remoteAddress)) return json(response, 403, { error: "Setup is available on this computer only." });
    return json(response, 200, {
      pairingCode,
      urls: lanUrls,
      secure: secureTransport
    });
  }

  if (request.method === "GET" && url.pathname === "/api/status") {
    if (!canView(request)) return json(response, 401, { error: "Pair this device to view usage." });
    return json(response, 200, store.snapshot());
  }

  if (request.method === "GET" && url.pathname === "/api/events") {
    if (!canView(request)) return json(response, 401, { error: "Pair this device to view usage." });
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.write(`event: status\ndata: ${JSON.stringify(store.snapshot())}\n\n`);
    const heartbeat = setInterval(() => response.write(": keep-alive\n\n"), 25_000);
    heartbeat.unref();
    eventClients.set(response, heartbeat);
    request.on("close", () => removeEventClient(response));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/status") {
    if (!dashboardSecret) {
      return json(response, 503, { error: "Live updates are disabled until DASHBOARD_SECRET is set." });
    }
    if (!safeEqual(bearerToken(request), dashboardSecret)) {
      return json(response, 401, { error: "Invalid collector credentials." });
    }
    try {
      const body = await readJson(request);
      const provider = store.upsert(body.provider ?? body);
      broadcast();
      return json(response, 200, { ok: true, provider });
    } catch (error) {
      const statusCode = error.code === "BODY_TOO_LARGE" ? 413 : 400;
      return json(response, statusCode, { error: error.message });
    }
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return json(response, 405, { error: "Method not allowed" });
  }

  await serveStatic(url.pathname, request, response);
};

const server = secureTransport
  ? createHttpsServer({ cert: await readFile(tlsCert), key: await readFile(tlsKey) }, requestHandler)
  : createHttpServer(requestHandler);

server.listen(port, host, () => {
  const protocol = secureTransport ? "https" : "http";
  console.log(`Quota Deck is running at ${protocol}://localhost:${port}`);
  console.log(demo ? "Demo feed is active." : "Waiting for collector updates.");
  if (!dashboardSecret) console.log("Set DASHBOARD_SECRET to enable POST /api/status.");
  if (!viewSecret || !pairingCode) console.log("Phone pairing is disabled until view credentials are configured.");
});

server.on("close", () => {
  for (const response of eventClients.keys()) removeEventClient(response);
});

async function pairDevice(request, response) {
  if (!viewSecret || !pairingCode) return json(response, 503, { error: "Phone pairing is not configured." });
  const client = request.socket.remoteAddress || "unknown";
  const attempt = pairingAttempts.get(client);
  if (attempt?.blockedUntil > Date.now()) {
    response.setHeader("Retry-After", String(Math.ceil((attempt.blockedUntil - Date.now()) / 1000)));
    return json(response, 429, { error: "Too many attempts. Try again in a few minutes." });
  }

  try {
    const body = await readJson(request);
    if (!safeEqual(String(body.code || "").trim(), pairingCode)) {
      recordFailedPairing(client);
      return json(response, 401, { error: "That pairing code is not correct." });
    }
    pairingAttempts.delete(client);
    response.setHeader("Set-Cookie", sessionCookie(viewSecret));
    return json(response, 200, { ok: true });
  } catch (error) {
    const statusCode = error.code === "BODY_TOO_LARGE" ? 413 : 400;
    return json(response, statusCode, { error: error.message });
  }
}

async function serveStatic(pathname, request, response) {
  let requested;
  try {
    requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  } catch {
    return json(response, 400, { error: "Invalid path." });
  }
  const safePath = normalize(requested).replace(/^(\.\.(\\|\/|$))+/, "");
  let filePath = join(root, safePath);

  if (!filePath.startsWith(root)) return json(response, 404, { error: "Not found" });

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, "index.html");
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": /\.(png|svg)$/.test(filePath) ? "public, max-age=86400" : "no-cache"
    });
    if (request.method === "HEAD") return response.end();
    createReadStream(filePath).pipe(response);
  } catch {
    json(response, 404, { error: "Not found" });
  }
}

function canView(request) {
  if (trustLoopback && isLoopback(request.socket.remoteAddress)) return true;
  if (!viewSecret) return false;
  const session = parseCookies(request.headers.cookie || "").quota_deck_session;
  return safeEqual(session, viewSecret);
}

function bearerToken(request) {
  const authorization = request.headers.authorization || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function parseCookies(header) {
  const cookies = {};
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) cookies[key] = value;
  }
  return cookies;
}

function sessionCookie(value, { expired = false } = {}) {
  const parts = [
    `quota_deck_session=${value}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    expired ? "Max-Age=0" : "Max-Age=31536000"
  ];
  if (secureTransport) parts.push("Secure");
  return parts.join("; ");
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || !left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isLoopback(address = "") {
  return address === "127.0.0.1"
    || address === "::1"
    || address === "::ffff:127.0.0.1";
}

function recordFailedPairing(client) {
  const now = Date.now();
  const previous = pairingAttempts.get(client);
  const recent = previous && now - previous.startedAt < 10 * 60_000
    ? previous
    : { count: 0, startedAt: now, blockedUntil: 0 };
  recent.count += 1;
  if (recent.count >= 5) recent.blockedUntil = now + 10 * 60_000;
  pairingAttempts.set(client, recent);
}

function applySecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let settled = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (settled) return;
      raw += chunk;
      if (raw.length > 64_000) {
        settled = true;
        const error = new Error("Request body must be 64 KB or smaller.");
        error.code = "BODY_TOO_LARGE";
        reject(error);
        request.destroy();
      }
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function broadcast() {
  const message = `event: status\ndata: ${JSON.stringify(store.snapshot())}\n\n`;
  for (const response of eventClients.keys()) response.write(message);
}

function removeEventClient(response) {
  const heartbeat = eventClients.get(response);
  if (heartbeat) clearInterval(heartbeat);
  eventClients.delete(response);
}

function parseLanUrls(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

setInterval(() => {
  store.advanceDemo();
  broadcast();
}, 10_000).unref();