import { randomBytes, randomInt } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CONFIG_VERSION = 1;

export async function loadRuntimeConfig({
  configPath = process.env.QUOTA_DECK_CONFIG || defaultConfigPath()
} = {}) {
  let stored;
  try {
    stored = JSON.parse(await readFile(configPath, "utf8"));
    validateStoredConfig(stored);
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error(`Quota Deck config is invalid: ${error.message}`);
    stored = {
      version: CONFIG_VERSION,
      dashboardSecret: createSecret(),
      viewSecret: createSecret(),
      createdAt: new Date().toISOString()
    };
    await writeConfig(configPath, stored);
  }

  return {
    ...stored,
    configPath,
    pairingCode: String(randomInt(0, 1_000_000)).padStart(6, "0")
  };
}

export function defaultConfigPath() {
  const base = process.env.LOCALAPPDATA
    || process.env.XDG_CONFIG_HOME
    || join(process.env.HOME || process.env.USERPROFILE || ".", ".config");
  return join(base, "QuotaDeck", "config.json");
}

function createSecret() {
  return randomBytes(32).toString("base64url");
}

function validateStoredConfig(value) {
  if (value?.version !== CONFIG_VERSION) throw new Error("unsupported config version");
  if (!validSecret(value.dashboardSecret) || !validSecret(value.viewSecret)) {
    throw new Error("stored secrets are missing or malformed");
  }
}

function validSecret(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{40,}$/.test(value);
}

async function writeConfig(configPath, value) {
  await mkdir(dirname(configPath), { recursive: true });
  const temporary = `${configPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, configPath);
}