import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DEFAULT_CLAUDE_STATE } from "./claude.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

try {
  const status = JSON.parse(raw);
  const provider = providerFromClaudeStatus(status);
  const target = process.env.QUOTA_DECK_CLAUDE_STATE || DEFAULT_CLAUDE_STATE;
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(provider, null, 2), "utf8");
  await rename(temporary, target);
  console.log(statusLineText(provider));
} catch {
  console.log("Quota Deck · waiting for usage data");
}

export function providerFromClaudeStatus(status) {
  const metrics = [];
  const fiveHour = status?.rate_limits?.five_hour;
  const sevenDay = status?.rate_limits?.seven_day;
  if (fiveHour) metrics.push(allowance("five-hour", "5-hour window", fiveHour));
  if (sevenDay) metrics.push(allowance("seven-day", "Weekly · all models", sevenDay));

  const context = status?.context_window;
  const contextLimit = Number(context?.context_window_size);
  const usedPercentage = Number(context?.used_percentage);
  if (Number.isFinite(contextLimit) && contextLimit > 0 && Number.isFinite(usedPercentage)) {
    metrics.push({
      id: "context",
      label: "Current context",
      kind: "tokens",
      used: Math.round(contextLimit * Math.min(100, Math.max(0, usedPercentage)) / 100),
      limit: Math.round(contextLimit)
    });
  }

  if (!metrics.length) {
    metrics.push({ id: "collector-status", label: "Collector status", kind: "value", value: "Connected" });
  }

  return {
    id: "claude",
    name: "Claude",
    monogram: "C",
    accent: "#d97757",
    state: "connected",
    source: status?.model?.display_name ? `Claude Code · ${status.model.display_name}` : "Claude Code status line",
    lastUpdated: new Date().toISOString(),
    metrics
  };
}

function allowance(id, label, value) {
  const epoch = Number(value.resets_at);
  return {
    id,
    label,
    kind: "allowance",
    usedPercent: Number(value.used_percentage) || 0,
    resetAt: Number.isFinite(epoch) && epoch > 0 ? new Date(epoch * 1000).toISOString() : null
  };
}

function statusLineText(provider) {
  const parts = ["Quota Deck"];
  for (const metric of provider.metrics) {
    if (metric.kind === "allowance") parts.push(`${metric.label.startsWith("5") ? "5h" : "7d"} ${Math.round(100 - metric.usedPercent)}% left`);
    if (metric.kind === "tokens") parts.push(`ctx ${Math.round(metric.used / metric.limit * 100)}%`);
  }
  return parts.join(" · ");
}
