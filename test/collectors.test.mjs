import assert from "node:assert/strict";
import test from "node:test";
import { providerFromClaudeStatus } from "../collector/claude-transform.mjs";
import { providerFromCodexData } from "../collector/codex.mjs";

test("maps Claude status-line quota and context fields", () => {
  const provider = providerFromClaudeStatus({
    model: { display_name: "Sonnet" },
    rate_limits: {
      five_hour: { used_percentage: 24, resets_at: 1783742000 },
      seven_day: { used_percentage: 41, resets_at: 1784300000 }
    },
    context_window: { context_window_size: 200000, used_percentage: 35 }
  });
  assert.equal(provider.metrics[0].usedPercent, 24);
  assert.equal(provider.metrics[2].used, 70000);
  assert.match(provider.source, /Sonnet/);
});

test("maps Codex app-server limits and local context", () => {
  const provider = providerFromCodexData({
    rpcSnapshot: {
      account: { planType: "pro" },
      rateLimits: {
        primary: { usedPercent: 71, windowDurationMins: 300, resetsAt: 1783742000 },
        secondary: { usedPercent: 11, windowDurationMins: 10080, resetsAt: 1784300000 }
      }
    },
    tokenEvent: {
      timestamp: "2026-07-11T03:00:00.000Z",
      payload: { info: { last_token_usage: { total_tokens: 120000 }, model_context_window: 353400 } }
    }
  });
  assert.equal(provider.metrics[0].label, "5-hour window");
  assert.equal(provider.metrics[1].label, "Weekly · all models");
  assert.equal(provider.metrics[2].limit, 353400);
  assert.match(provider.source, /Pro/);
});
