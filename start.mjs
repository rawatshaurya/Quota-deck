import { spawn } from "node:child_process";
import { unlinkSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { loadRuntimeConfig } from "./lib/runtime-config.mjs";

const runtime = await loadRuntimeConfig();
const pidPath = join(dirname(runtime.configPath), "quota-deck.pid");
await writeFile(pidPath, String(process.pid), "utf8");
const dashboardSecret = process.env.DASHBOARD_SECRET || runtime.dashboardSecret;
const viewSecret = process.env.QUOTA_DECK_VIEW_SECRET || runtime.viewSecret;
const pairingCode = process.env.QUOTA_DECK_PAIRING_CODE || runtime.pairingCode;
const port = process.env.PORT || "4173";
const protocol = process.env.TLS_CERT && process.env.TLS_KEY ? "https" : "http";
const lanUrls = discoverLanUrls(protocol, port);
const children = [];

const sharedEnv = {
  ...process.env,
  DASHBOARD_SECRET: dashboardSecret,
  QUOTA_DECK_VIEW_SECRET: viewSecret,
  QUOTA_DECK_PAIRING_CODE: pairingCode,
  QUOTA_DECK_LAN_URLS: JSON.stringify(lanUrls)
};

const server = spawn(process.execPath, ["server.mjs"], {
  stdio: "inherit",
  windowsHide: true,
  env: { ...sharedEnv, DEMO_MODE: process.env.DEMO_MODE ?? "false" }
});
children.push(server);

if (process.env.LOCAL_COLLECTORS !== "false") {
  const collector = spawn(process.execPath, ["collector/run.mjs"], {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...sharedEnv,
      QUOTA_DECK_SECRET: dashboardSecret,
      QUOTA_DECK_URL: process.env.QUOTA_DECK_URL || `${protocol}://localhost:${port}`
    }
  });
  children.push(collector);
}

console.log("\nQuota Deck phone pairing");
console.log(`  Code: ${pairingCode}`);
for (const url of lanUrls) console.log(`  Open: ${url}`);
console.log(`  Persistent config: ${runtime.configPath}\n`);

for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) console.error(`Quota Deck child process exited with code ${code}.`);
  });
  child.on("error", (error) => console.error(`Quota Deck could not start a child process: ${error.message}`));
}

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  try { unlinkSync(pidPath); } catch {}
  for (const child of children) child.kill();
  setTimeout(() => process.exit(0), 250).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => { try { unlinkSync(pidPath); } catch {} });

function discoverLanUrls(scheme, selectedPort) {
  const urls = new Set();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.internal || entry.family !== "IPv4") continue;
      urls.add(`${scheme}://${entry.address}:${selectedPort}`);
    }
  }
  return [...urls];
}