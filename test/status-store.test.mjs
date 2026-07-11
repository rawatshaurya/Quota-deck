import assert from "node:assert/strict";
import test from "node:test";
import { StatusStore, normalizeProvider } from "../lib/status-store.mjs";

const validProvider = {
  id: "claude",
  name: "Claude",
  accent: "#d97757",
  metrics: [
    {
      id: "five-hour",
      label: "5-hour window",
      kind: "allowance",
      usedPercent: 41,
      resetAt: "2026-07-11T04:00:00.000Z"
    },
    {
      id: "context",
      label: "Context",
      kind: "tokens",
      used: 1000,
      limit: 2000
    }
  ]
};

test("normalizes a provider payload", () => {
  const provider = normalizeProvider(validProvider);
  assert.equal(provider.id, "claude");
  assert.equal(provider.metrics[0].usedPercent, 41);
  assert.equal(provider.metrics[1].limit, 2000);
  assert.equal(provider.state, "connected");
});

test("clamps allowance percentages", () => {
  const provider = normalizeProvider({
    ...validProvider,
    metrics: [{ ...validProvider.metrics[0], usedPercent: 140 }]
  });
  assert.equal(provider.metrics[0].usedPercent, 100);
});

test("rejects malformed provider IDs", () => {
  assert.throws(() => normalizeProvider({ ...validProvider, id: "Claude Account" }), /provider.id/);
});

test("a live update replaces a demo provider and switches mode", () => {
  const store = new StatusStore({ demo: true });
  store.upsert(validProvider);
  const snapshot = store.snapshot();
  assert.equal(snapshot.mode, "live");
  assert.equal(snapshot.providers.find((item) => item.id === "claude").source, "Collector");
});
