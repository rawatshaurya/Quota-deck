const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const isoAfter = (milliseconds) => new Date(Date.now() + milliseconds).toISOString();

export function createDemoProviders() {
  return [
    {
      id: "claude",
      name: "Claude",
      monogram: "C",
      accent: "#d97757",
      state: "connected",
      source: "Demo feed",
      lastUpdated: new Date().toISOString(),
      metrics: [
        {
          id: "five-hour",
          label: "5-hour window",
          kind: "allowance",
          usedPercent: 38,
          resetAt: isoAfter(2 * 60 * 60 * 1000 + 18 * 60 * 1000)
        },
        {
          id: "weekly-all",
          label: "Weekly · all models",
          kind: "allowance",
          usedPercent: 72,
          resetAt: isoAfter(3 * 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000)
        },
        {
          id: "context",
          label: "Current context",
          kind: "tokens",
          used: 142300,
          limit: 200000
        }
      ]
    },
    {
      id: "codex",
      name: "Codex",
      monogram: "X",
      accent: "#5b8cff",
      state: "connected",
      source: "Demo feed",
      lastUpdated: new Date().toISOString(),
      metrics: [
        {
          id: "five-hour",
          label: "5-hour window",
          kind: "allowance",
          usedPercent: 79,
          resetAt: isoAfter(26 * 60 * 1000)
        },
        {
          id: "weekly-all",
          label: "Weekly · all models",
          kind: "allowance",
          usedPercent: 16,
          resetAt: isoAfter(5 * 24 * 60 * 60 * 1000 + 11 * 60 * 60 * 1000)
        },
        {
          id: "context",
          label: "Context window",
          kind: "tokens",
          used: 247800,
          limit: 1000000
        }
      ]
    }
  ];
}

export function normalizeProvider(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("provider must be an object");
  }

  const id = String(input.id ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim();
  if (!/^[a-z0-9-]{1,32}$/.test(id)) {
    throw new TypeError("provider.id must contain only lowercase letters, numbers, or hyphens");
  }
  if (!name || name.length > 48) {
    throw new TypeError("provider.name is required and must be 48 characters or fewer");
  }
  if (!Array.isArray(input.metrics) || input.metrics.length === 0 || input.metrics.length > 12) {
    throw new TypeError("provider.metrics must contain between 1 and 12 metrics");
  }

  const metrics = input.metrics.map((metric, index) => normalizeMetric(metric, index));
  const accent = /^#[0-9a-f]{6}$/i.test(input.accent ?? "") ? input.accent : "#5b8cff";
  const state = ["connected", "stale", "disconnected", "error"].includes(input.state)
    ? input.state
    : "connected";

  return {
    id,
    name,
    monogram: String(input.monogram ?? name[0]).slice(0, 2).toUpperCase(),
    accent,
    state,
    source: String(input.source ?? "Collector").slice(0, 80),
    lastUpdated: validDate(input.lastUpdated) ?? new Date().toISOString(),
    metrics
  };
}

function normalizeMetric(metric, index) {
  if (!metric || typeof metric !== "object") {
    throw new TypeError(`metric ${index} must be an object`);
  }

  const id = String(metric.id ?? `metric-${index}`).trim().toLowerCase();
  const label = String(metric.label ?? "").trim();
  const kind = metric.kind;
  if (!/^[a-z0-9-]{1,40}$/.test(id) || !label || label.length > 64) {
    throw new TypeError(`metric ${index} has an invalid id or label`);
  }

  if (kind === "allowance") {
    const usedPercent = Number(metric.usedPercent);
    if (!Number.isFinite(usedPercent)) {
      throw new TypeError(`metric ${index}.usedPercent must be a number`);
    }
    return {
      id,
      label,
      kind,
      usedPercent: clamp(usedPercent),
      resetAt: validDate(metric.resetAt),
      detail: optionalText(metric.detail, 80)
    };
  }

  if (kind === "tokens") {
    const used = Number(metric.used);
    const limit = Number(metric.limit);
    if (!Number.isFinite(used) || !Number.isFinite(limit) || used < 0 || limit <= 0) {
      throw new TypeError(`metric ${index} token values must be valid positive numbers`);
    }
    return {
      id,
      label,
      kind,
      used: Math.round(used),
      limit: Math.round(limit),
      detail: optionalText(metric.detail, 80)
    };
  }

  if (kind === "value") {
    return {
      id,
      label,
      kind,
      value: String(metric.value ?? "—").slice(0, 32),
      detail: optionalText(metric.detail, 80)
    };
  }

  throw new TypeError(`metric ${index}.kind must be allowance, tokens, or value`);
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function optionalText(value, max) {
  return value == null ? undefined : String(value).slice(0, max);
}

export class StatusStore {
  #providers;
  #mode;

  constructor({ demo = true } = {}) {
    this.#mode = demo ? "demo" : "live";
    this.#providers = demo ? createDemoProviders() : [];
  }

  snapshot() {
    return {
      generatedAt: new Date().toISOString(),
      mode: this.#mode,
      providers: structuredClone(this.#providers)
    };
  }

  upsert(input) {
    const provider = normalizeProvider(input);
    const index = this.#providers.findIndex((item) => item.id === provider.id);
    if (index === -1) this.#providers.push(provider);
    else this.#providers[index] = provider;
    this.#mode = "live";
    return structuredClone(provider);
  }

  advanceDemo() {
    if (this.#mode !== "demo") return;
    for (const provider of this.#providers) {
      provider.lastUpdated = new Date().toISOString();
      for (const metric of provider.metrics) {
        if (metric.kind === "allowance") {
          metric.usedPercent = clamp(metric.usedPercent + 0.08);
        }
        if (metric.kind === "tokens") {
          metric.used = Math.min(metric.limit, metric.used + Math.max(1, Math.round(metric.limit * 0.00015)));
        }
      }
    }
  }
}
