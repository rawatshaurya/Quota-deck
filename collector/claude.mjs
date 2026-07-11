import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { collectClaudeDesktop } from "./claude-desktop.mjs";

export const DEFAULT_CLAUDE_STATE = fileURLToPath(new URL("../data/claude-status.json", import.meta.url));

export async function collectClaude({ statePath = process.env.QUOTA_DECK_CLAUDE_STATE || DEFAULT_CLAUDE_STATE } = {}) {
  try {
    const desktop = await collectClaudeDesktop();
    if (desktop) return desktop;
  } catch {}

  try {
    const provider = JSON.parse(await readFile(statePath, "utf8"));
    for (const metric of provider.metrics ?? []) {
      if (metric.kind === "allowance" && metric.resetAt && new Date(metric.resetAt).getTime() <= Date.now()) {
        metric.usedPercent = 0;
        metric.resetAt = null;
      }
    }
    return provider;
  } catch {
    return {
      id: "claude",
      name: "Claude",
      monogram: "C",
      accent: "#d97757",
      state: "disconnected",
      source: "Waiting for Claude Desktop or Code",
      lastUpdated: new Date().toISOString(),
      metrics: [
        {
          id: "collector-status",
          label: "Collector status",
          kind: "value",
          value: "Waiting",
          detail: "Open Claude Desktop or complete one Claude Code response"
        }
      ]
    };
  }
}
