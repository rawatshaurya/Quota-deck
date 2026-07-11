import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync, zstdDecompressSync } from "node:zlib";

const CLAUDE_COLOR = "#d97757";
const CACHE_HEADER_SIZE = 8192;
const ENTRY_BLOCK_SIZE = 256;

export async function collectClaudeDesktop({
  cacheRoot = process.env.CLAUDE_DESKTOP_CACHE || defaultCacheRoot()
} = {}) {
  if (!cacheRoot) return null;
  const usage = await readClaudeDesktopUsage(cacheRoot);
  return usage ? providerFromClaudeDesktopUsage(usage) : null;
}

export function providerFromClaudeDesktopUsage(usage) {
  const metrics = [];
  if (Array.isArray(usage?.limits)) {
    for (const item of usage.limits) {
      if (!item || typeof item.percent !== "number") continue;
      const label = desktopLimitLabel(item);
      if (!label) continue;
      metrics.push({
        id: desktopLimitId(item),
        label,
        kind: "allowance",
        usedPercent: item.percent,
        resetAt: validIso(item.resets_at)
      });
    }
  }

  if (!metrics.some((metric) => metric.id === "five-hour") && usage?.five_hour) {
    metrics.unshift(legacyMetric("five-hour", "5-hour window", usage.five_hour));
  }
  if (!metrics.some((metric) => metric.id === "weekly-all") && usage?.seven_day) {
    metrics.push(legacyMetric("weekly-all", "Weekly - all models", usage.seven_day));
  }
  if (!metrics.length) return null;

  return {
    id: "claude",
    name: "Claude",
    monogram: "C",
    accent: CLAUDE_COLOR,
    state: "connected",
    source: "Claude Desktop",
    lastUpdated: new Date().toISOString(),
    metrics
  };
}

export async function readClaudeDesktopUsage(cacheRoot) {
  const entries = await readFile(join(cacheRoot, "data_1"));
  const needle = Buffer.from("https://claude.ai/api/organizations/");
  const candidates = [];
  let searchOffset = 0;

  while ((searchOffset = entries.indexOf(needle, searchOffset)) !== -1) {
    const keyOffset = searchOffset;
    const keyEnd = entries.indexOf(0, keyOffset);
    if (keyEnd === -1) break;
    const key = entries.subarray(keyOffset, keyEnd).toString("utf8");
    searchOffset = keyEnd + 1;
    if (!key.endsWith("/usage")) continue;

    const entryStart = CACHE_HEADER_SIZE + Math.floor((keyOffset - CACHE_HEADER_SIZE) / ENTRY_BLOCK_SIZE) * ENTRY_BLOCK_SIZE;
    if (entryStart < CACHE_HEADER_SIZE || entryStart + 64 > entries.length) continue;
    const bodySize = entries.readUInt32LE(entryStart + 44);
    const bodyAddress = entries.readUInt32LE(entryStart + 60);
    // Chromium's key-length field can differ from the full key stored inline.
    if (bodySize <= 0 || bodySize > 2_000_000) continue;

    try {
      const body = await readCacheAddress(cacheRoot, bodyAddress, bodySize);
      const parsed = decodeUsageBody(body);
      if (parsed) candidates.push({ created: entries.readBigInt64LE(entryStart + 24), parsed });
    } catch {}
  }

  candidates.sort((a, b) => a.created > b.created ? -1 : a.created < b.created ? 1 : 0);
  return candidates[0]?.parsed ?? null;
}

async function readCacheAddress(cacheRoot, address, size) {
  if ((address & 0x80000000) === 0) throw new Error("Uninitialized cache address");
  const type = (address >>> 28) & 0x7;
  if (type === 0) {
    const fileNumber = address & 0x0fffffff;
    const file = await readFile(join(cacheRoot, `f_${fileNumber.toString(16).padStart(6, "0")}`));
    return file.subarray(0, size);
  }

  const blockSize = { 2: 256, 3: 1024, 4: 4096 }[type];
  if (!blockSize) throw new Error(`Unsupported cache block type ${type}`);
  const fileNumber = (address >>> 16) & 0xff;
  const blockNumber = address & 0xffff;
  const file = await readFile(join(cacheRoot, `data_${fileNumber}`));
  const start = CACHE_HEADER_SIZE + blockNumber * blockSize;
  if (start + size > file.length) throw new Error("Cache body is out of bounds");
  return file.subarray(start, start + size);
}

function decodeUsageBody(body) {
  const decoders = [value => value, zstdDecompressSync, gunzipSync, brotliDecompressSync];
  for (const decode of decoders) {
    try {
      const value = JSON.parse(decode(body).toString("utf8"));
      if (value && (value.five_hour || value.seven_day || Array.isArray(value.limits))) return value;
    } catch {}
  }
  return null;
}

function desktopLimitLabel(item) {
  if (item.kind === "session") return "5-hour window";
  if (item.kind === "weekly_all") return "Weekly - all models";
  if (item.group === "weekly") {
    const name = item.scope?.model?.display_name || item.scope?.surface?.display_name;
    return name ? `Weekly - ${name}` : "Weekly allowance";
  }
  return null;
}

function desktopLimitId(item) {
  if (item.kind === "session") return "five-hour";
  if (item.kind === "weekly_all") return "weekly-all";
  const name = item.scope?.model?.display_name || item.scope?.surface?.display_name || item.kind;
  return `weekly-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function legacyMetric(id, label, value) {
  return { id, label, kind: "allowance", usedPercent: Number(value.utilization) || 0, resetAt: validIso(value.resets_at) };
}

function validIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function defaultCacheRoot() {
  return process.env.APPDATA ? join(process.env.APPDATA, "Claude", "Cache", "Cache_Data") : null;
}
