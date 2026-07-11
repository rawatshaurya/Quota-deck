import assert from "node:assert/strict";
import test from "node:test";
import { providerFromClaudeDesktopUsage } from "../collector/claude-desktop.mjs";

test("maps Claude Desktop plan usage and scoped weekly limits", () => {
  const provider = providerFromClaudeDesktopUsage({
    limits: [
      { kind: "session", group: "session", percent: 2, resets_at: "2026-07-11T09:30:00Z" },
      { kind: "weekly_all", group: "weekly", percent: 8, resets_at: "2026-07-18T00:00:00Z" },
      { kind: "weekly_scoped", group: "weekly", percent: 4, resets_at: null, scope: { model: { display_name: "Fable" } } }
    ]
  });
  assert.equal(provider.source, "Claude Desktop");
  assert.equal(provider.metrics[0].label, "5-hour window");
  assert.equal(provider.metrics[1].usedPercent, 8);
  assert.equal(provider.metrics[2].label, "Weekly - Fable");
});
