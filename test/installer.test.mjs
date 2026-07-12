import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Windows installer treats a slow first launch as nonfatal", async () => {
  const installer = await readFile("installer/Install-QuotaDeck.ps1", "utf8");

  assert.match(installer, /attempt -lt 120/);
  assert.match(installer, /Write-Warning/);
  assert.match(installer, /taking longer than expected to start/);
  assert.doesNotMatch(installer, /throw "Quota Deck was installed but did not start/);
  assert.match(installer, /elseif \(-not \$NoLaunch\)/);
});
