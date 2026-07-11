import { collectClaude } from "./claude.mjs";
import { collectCodex } from "./codex.mjs";

const once = process.argv.includes("--once");
const url = process.env.QUOTA_DECK_URL || "http://localhost:4173";
const secret = process.env.QUOTA_DECK_SECRET;
const intervalMs = Math.max(10_000, Number(process.env.COLLECTOR_INTERVAL_MS || 30_000));

if (!secret) {
  console.error("Collector requires QUOTA_DECK_SECRET.");
  process.exit(1);
}

async function cycle() {
  const providers = await Promise.all([collectClaude(), collectCodex()]);
  for (const provider of providers) {
    try {
      const response = await fetch(`${url}/api/status`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify(provider)
      });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      console.log(`[collector] ${provider.name}: ${provider.state} · ${provider.source}`);
    } catch (error) {
      console.error(`[collector] ${provider.name}: publish failed · ${error.message}`);
    }
  }
}

await cycle();
if (!once) {
  const timer = setInterval(cycle, intervalMs);
  process.on("SIGINT", () => { clearInterval(timer); process.exit(0); });
  process.on("SIGTERM", () => { clearInterval(timer); process.exit(0); });
}
