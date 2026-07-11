import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("public shell includes pairing bootstrap and release icons", async () => {
  const [app, index, manifestText, serviceWorker] = await Promise.all([
    readFile("public/app.js", "utf8"),
    readFile("public/index.html", "utf8"),
    readFile("public/manifest.webmanifest", "utf8"),
    readFile("public/sw.js", "utf8")
  ]);
  const manifest = JSON.parse(manifestText);

  assert.match(app, /bootstrap\(\);/);
  assert.doesNotMatch(app, /fetchStatus\(\);\s*connectEvents\(\);/);
  assert.match(app, /replace\(\/\\D\/g/);
  assert.match(index, /id="pairing-gate"/);
  assert.match(index, /id="setup-panel"/);
  assert.match(index, /app\.js\?v=0\.2\.0-r2/);
  assert.match(serviceWorker, /quota-deck-v4/);
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ["192x192", "512x512", "512x512"]);

  await Promise.all([
    access("public/icon-180.png"),
    access("public/icon-192.png"),
    access("public/icon-512.png"),
    access("public/icon-512-maskable.png")
  ]);
});
