import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";

test("server protects viewing and pairs a device", async (t) => {
  const port = await availablePort();
  const dashboardSecret = "collector-secret-for-server-test";
  const viewSecret = "viewer-secret-for-server-test";
  const pairingCode = "482913";
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      DEMO_MODE: "true",
      DASHBOARD_SECRET: dashboardSecret,
      QUOTA_DECK_VIEW_SECRET: viewSecret,
      QUOTA_DECK_PAIRING_CODE: pairingCode,
      QUOTA_DECK_TRUST_LOOPBACK: "false",
      QUOTA_DECK_LAN_URLS: "[]"
    }
  });
  t.after(() => child.kill());
  await waitForServer(child);

  const base = "http://127.0.0.1:" + port;
  const health = await fetch(base + "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.match(health.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const appAsset = await fetch(base + "/app.js?v=release-test");
  assert.equal(appAsset.status, 200);
  assert.equal(appAsset.headers.get("cache-control"), "no-cache");

  const unauthorized = await fetch(base + "/api/status");
  assert.equal(unauthorized.status, 401);

  const setup = await fetch(base + "/api/setup");
  assert.equal(setup.status, 403);

  const wrong = await fetch(base + "/api/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "000000" })
  });
  assert.equal(wrong.status, 401);

  const paired = await fetch(base + "/api/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: pairingCode })
  });
  assert.equal(paired.status, 200);
  const cookie = paired.headers.get("set-cookie").split(";")[0];
  assert.match(paired.headers.get("set-cookie"), /HttpOnly/);
  assert.match(paired.headers.get("set-cookie"), /SameSite=Strict/);

  const status = await fetch(base + "/api/status", { headers: { Cookie: cookie } });
  assert.equal(status.status, 200);
  const snapshot = await status.json();
  assert.equal(snapshot.providers.length, 2);

  const provider = {
    id: "test-provider",
    name: "Test Provider",
    state: "connected",
    metrics: [{ id: "window", label: "Usage", kind: "allowance", usedPercent: 25 }]
  };
  const rejectedPublish = await fetch(base + "/api/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(provider)
  });
  assert.equal(rejectedPublish.status, 401);

  const acceptedPublish = await fetch(base + "/api/status", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + dashboardSecret,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(provider)
  });
  assert.equal(acceptedPublish.status, 200);
});

async function availablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Server did not start. " + output)), 8000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("Quota Deck is running")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error("Server exited with code " + code + ". " + output));
    });
  });
}
