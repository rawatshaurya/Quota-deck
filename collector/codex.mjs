import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const CODEX_COLOR = "#5b8cff";

export async function collectCodex({ timeoutMs = 12_000 } = {}) {
  let rpcSnapshot = null;
  let rpcError = null;
  let tokenEvent = null;

  try {
    const executable = await findCodexExecutable();
    rpcSnapshot = await readCodexRateLimits(executable, timeoutMs);
  } catch (error) {
    rpcError = error;
  }

  try {
    tokenEvent = await readLatestCodexTokenEvent();
  } catch {}

  return providerFromCodexData({ rpcSnapshot, tokenEvent, rpcError });
}

export function providerFromCodexData({ rpcSnapshot, tokenEvent, rpcError = null }) {
  const eventLimits = tokenEvent?.payload?.rate_limits;
  const limits = rpcSnapshot?.rateLimits ?? convertEventLimits(eventLimits);
  const plan = rpcSnapshot?.account?.planType ?? eventLimits?.plan_type;
  const metrics = rateLimitMetrics(limits);
  const context = tokenEvent?.payload?.info;

  if (context?.last_token_usage?.total_tokens && context?.model_context_window) {
    metrics.push({
      id: "context",
      label: "Current context",
      kind: "tokens",
      used: Math.min(context.last_token_usage.total_tokens, context.model_context_window),
      limit: context.model_context_window
    });
  }

  if (!metrics.length) {
    metrics.push({
      id: "collector-status",
      label: "Collector status",
      kind: "value",
      value: "Waiting",
      detail: rpcError?.message ?? "Open Codex and complete a turn"
    });
  }

  const eventTime = tokenEvent?.timestamp ? new Date(tokenEvent.timestamp) : null;
  const eventIsFresh = eventTime && Date.now() - eventTime.getTime() < 30 * 60 * 1000;
  const source = rpcSnapshot
    ? `Codex app-server${plan ? ` · ${capitalize(plan)}` : ""}`
    : tokenEvent
      ? "Codex session cache"
      : "Codex collector";

  return {
    id: "codex",
    name: "Codex",
    monogram: "X",
    accent: CODEX_COLOR,
    state: rpcSnapshot || eventIsFresh ? "connected" : tokenEvent ? "stale" : "disconnected",
    source,
    lastUpdated: rpcSnapshot ? new Date().toISOString() : tokenEvent?.timestamp ?? new Date().toISOString(),
    metrics
  };
}

export async function findCodexExecutable() {
  if (process.env.CODEX_PATH) return process.env.CODEX_PATH;

  const candidates = [];
  const localRoot = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "OpenAI", "Codex", "bin")
    : null;

  if (localRoot) {
    try {
      for (const entry of await readdir(localRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const path = join(localRoot, entry.name, process.platform === "win32" ? "codex.exe" : "codex");
        try {
          const info = await stat(path);
          candidates.push({ path, modified: info.mtimeMs });
        } catch {}
      }
    } catch {}
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.modified - a.modified);
    return candidates[0].path;
  }

  return process.platform === "win32" ? "codex.exe" : "codex";
}

export async function readCodexRateLimits(executable, timeoutMs = 12_000) {
  const client = new JsonLineRpcProcess(executable, ["app-server"], timeoutMs);
  try {
    await client.start();
    await client.request("initialize", {
      clientInfo: { name: "quota_deck", title: "Quota Deck", version: "0.2.0" },
      capabilities: {}
    });
    client.notify("initialized");
    const [rateLimitResult, accountResult] = await Promise.all([
      client.request("account/rateLimits/read"),
      client.request("account/read", { refreshToken: false })
    ]);
    return {
      rateLimits: rateLimitResult?.rateLimits ?? null,
      account: accountResult?.account ?? null
    };
  } finally {
    client.close();
  }
}

export async function readLatestCodexTokenEvent() {
  const codexHome = process.env.CODEX_HOME || join(process.env.USERPROFILE || process.env.HOME, ".codex");
  const database = new DatabaseSync(join(codexHome, "state_5.sqlite"), { readOnly: true });
  let thread;
  try {
    thread = database.prepare(`
      SELECT rollout_path
      FROM threads
      WHERE rollout_path IS NOT NULL AND rollout_path != ''
      ORDER BY updated_at_ms DESC
      LIMIT 1
    `).get();
  } finally {
    database.close();
  }
  if (!thread?.rollout_path) return null;

  const lines = (await readFile(thread.rollout_path, "utf8")).trim().split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const event = JSON.parse(lines[index]);
      if (event?.type === "event_msg" && event?.payload?.type === "token_count") return event;
    } catch {}
  }
  return null;
}

function rateLimitMetrics(limits) {
  if (!limits) return [];
  const windows = [limits.primary, limits.secondary].filter(Boolean);
  return windows.map((window, index) => {
    const minutes = Number(window.windowDurationMins);
    return {
      id: index === 0 ? "primary-window" : "secondary-window",
      label: windowLabel(minutes, index),
      kind: "allowance",
      usedPercent: Number(window.usedPercent) || 0,
      resetAt: epochToIso(window.resetsAt)
    };
  });
}

function convertEventLimits(value) {
  if (!value) return null;
  const convert = (window) => window ? {
    usedPercent: window.used_percent,
    windowDurationMins: window.window_minutes,
    resetsAt: window.resets_at
  } : null;
  return { primary: convert(value.primary), secondary: convert(value.secondary) };
}

function windowLabel(minutes, index) {
  if (minutes === 300) return "5-hour window";
  if (minutes === 10080) return "Weekly · all models";
  if (Number.isFinite(minutes) && minutes < 1440) return `${Math.round(minutes / 60)}-hour window`;
  if (Number.isFinite(minutes)) return `${Math.round(minutes / 1440)}-day window`;
  return index === 0 ? "Primary allowance" : "Secondary allowance";
}

function epochToIso(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? new Date(number * 1000).toISOString() : null;
}

function capitalize(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

class JsonLineRpcProcess {
  constructor(executable, args, timeoutMs) {
    this.executable = executable;
    this.args = args;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.stderr = "";
  }

  start() {
    return new Promise((resolve, reject) => {
      this.child = spawn(this.executable, this.args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: {
          ...process.env,
          CODEX_HOME: process.env.CODEX_HOME || join(process.env.USERPROFILE || process.env.HOME, ".codex"),
          RUST_LOG: process.env.RUST_LOG || "error"
        }
      });
      this.child.once("spawn", resolve);
      this.child.once("error", reject);
      this.child.stdout.setEncoding("utf8");
      this.child.stderr.setEncoding("utf8");
      this.child.stdout.on("data", (chunk) => this.onData(chunk));
      this.child.stderr.on("data", (chunk) => { this.stderr = (this.stderr + chunk).slice(-2000); });
      this.child.on("exit", (code) => {
        for (const pending of this.pending.values()) {
          pending.reject(new Error(`Codex app-server exited with code ${code}. ${this.stderr}`.trim()));
        }
        this.pending.clear();
      });
    });
  }

  request(method, params) {
    const id = this.nextId++;
    const payload = { method, id };
    if (params !== undefined) payload.params = params;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server timed out during ${method}.`));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      this.send(payload);
    });
  }

  notify(method, params) {
    const payload = { method };
    if (params !== undefined) payload.params = params;
    this.send(payload);
  }

  send(payload) {
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  onData(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const message = JSON.parse(line);
        if (message.id == null || !this.pending.has(message.id)) continue;
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
        else pending.resolve(message.result);
      } catch {}
    }
  }

  close() {
    if (!this.child) return;
    this.child.stdin.end();
    this.child.kill();
  }
}
