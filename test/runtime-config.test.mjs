import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadRuntimeConfig } from "../lib/runtime-config.mjs";

test("runtime config persists secrets and rotates the pairing code", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "quota-deck-config-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = join(directory, "config.json");

  const first = await loadRuntimeConfig({ configPath });
  const second = await loadRuntimeConfig({ configPath });
  const stored = JSON.parse(await readFile(configPath, "utf8"));

  assert.equal(first.dashboardSecret, second.dashboardSecret);
  assert.equal(first.viewSecret, second.viewSecret);
  assert.match(first.dashboardSecret, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(first.viewSecret, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(first.pairingCode, /^\d{6}$/);
  assert.match(second.pairingCode, /^\d{6}$/);
  assert.equal(stored.version, 1);
});
