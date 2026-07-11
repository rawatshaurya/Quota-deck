import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const home = process.env.USERPROFILE || process.env.HOME;
const settingsPath = join(home, ".claude", "settings.json");
const scriptPath = fileURLToPath(new URL("./claude-statusline.mjs", import.meta.url));
await mkdir(dirname(settingsPath), { recursive: true });

let settings = {};
try { settings = JSON.parse(await readFile(settingsPath, "utf8")); } catch {}

if (settings.statusLine && !String(settings.statusLine.command || "").includes("claude-statusline.mjs")) {
  throw new Error("Claude already has a custom status line. Merge Quota Deck manually to avoid replacing it.");
}

try { await copyFile(settingsPath, `${settingsPath}.quota-deck.bak`, 1); } catch {}
settings.statusLine = {
  type: "command",
  command: `node "${scriptPath}"`,
  refreshInterval: 30
};

const temporary = `${settingsPath}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
await rename(temporary, settingsPath);
console.log(`Claude status-line bridge installed in ${settingsPath}`);
console.log("Complete one Claude Code response to populate live usage.");
