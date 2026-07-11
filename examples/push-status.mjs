const url = process.env.QUOTA_DECK_URL || "http://localhost:4173";
const secret = process.env.QUOTA_DECK_SECRET;

if (!secret) {
  console.error("Set QUOTA_DECK_SECRET before publishing status.");
  process.exit(1);
}

const after = (milliseconds) => new Date(Date.now() + milliseconds).toISOString();
const updated = new Date().toISOString();

const providers = [
  {
    id: "claude",
    name: "Claude",
    monogram: "C",
    accent: "#d97757",
    state: "connected",
    source: "Example collector",
    lastUpdated: updated,
    metrics: [
      { id: "five-hour", label: "5-hour window", kind: "allowance", usedPercent: 46, resetAt: after(2 * 60 * 60 * 1000) },
      { id: "weekly-all", label: "Weekly · all models", kind: "allowance", usedPercent: 33, resetAt: after(4 * 24 * 60 * 60 * 1000) },
      { id: "context", label: "Current context", kind: "tokens", used: 78000, limit: 200000 }
    ]
  },
  {
    id: "codex",
    name: "Codex",
    monogram: "X",
    accent: "#5b8cff",
    state: "connected",
    source: "Example collector",
    lastUpdated: updated,
    metrics: [
      { id: "five-hour", label: "5-hour window", kind: "allowance", usedPercent: 64, resetAt: after(48 * 60 * 1000) },
      { id: "weekly-all", label: "Weekly · all models", kind: "allowance", usedPercent: 19, resetAt: after(5 * 24 * 60 * 60 * 1000) },
      { id: "context", label: "Context window", kind: "tokens", used: 247800, limit: 1000000 }
    ]
  }
];

for (const provider of providers) {
  const response = await fetch(`${url}/api/status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(provider)
  });

  if (!response.ok) {
    console.error(`Could not publish ${provider.name}: ${response.status} ${await response.text()}`);
    process.exitCode = 1;
    continue;
  }
  console.log(`Published ${provider.name} status.`);
}
