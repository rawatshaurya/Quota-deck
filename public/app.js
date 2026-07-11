const elements = {
  grid: document.querySelector("#provider-grid"),
  modePill: document.querySelector("#mode-pill"),
  heroCountdown: document.querySelector("[data-hero-countdown]"),
  heroCaption: document.querySelector("#hero-caption"),
  heroRemaining: document.querySelector("#hero-remaining"),
  updatedLabel: document.querySelector("#updated-label"),
  connectionDot: document.querySelector("#connection-dot"),
  connectionLabel: document.querySelector("#connection-label"),
  fullscreenButton: document.querySelector("#fullscreen-button"),
  wakeButton: document.querySelector("#wake-button"),
  installButton: document.querySelector("#install-button"),
  pairButton: document.querySelector("#pair-button"),
  pairingGate: document.querySelector("#pairing-gate"),
  pairingForm: document.querySelector("#pairing-form"),
  pairingCode: document.querySelector("#pairing-code"),
  pairingError: document.querySelector("#pairing-error"),
  setupPanel: document.querySelector("#setup-panel"),
  setupClose: document.querySelector("#setup-close"),
  setupCode: document.querySelector("#setup-code"),
  setupUrls: document.querySelector("#setup-urls"),
  setupSecurityNote: document.querySelector("#setup-security-note"),
  toast: document.querySelector("#toast")
};

const state = {
  snapshot: restoreSnapshot(),
  connected: false,
  lastReceived: null,
  wakeLock: null,
  installPrompt: null,
  events: null,
  setup: null
};

if (state.snapshot) render(state.snapshot);
bootstrap();
updateCountdowns();

setInterval(updateCountdowns, 1000);
setInterval(updateFreshness, 10_000);
setInterval(applyBurnInDrift, 120_000);

elements.fullscreenButton.addEventListener("click", toggleFullscreen);
elements.wakeButton.addEventListener("click", toggleWakeLock);
elements.installButton.addEventListener("click", installApp);
elements.pairButton.addEventListener("click", showSetupPanel);
elements.setupClose.addEventListener("click", hideSetupPanel);
elements.setupPanel.addEventListener("click", (event) => {
  if (event.target === elements.setupPanel) hideSetupPanel();
});
elements.pairingForm.addEventListener("submit", submitPairing);
elements.pairingCode.addEventListener("input", () => {
  elements.pairingCode.value = elements.pairingCode.value.replace(/\D/g, "").slice(0, 6);
  elements.pairingError.textContent = "";
});
document.addEventListener("visibilitychange", restoreWakeLock);
window.addEventListener("online", fetchStatus);
window.addEventListener("offline", () => setConnection(false, "Offline · cached data"));
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
  elements.installButton.classList.remove("hidden");
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

async function bootstrap() {
  const authenticated = await fetchStatus();
  if (authenticated) connectEvents();
  await loadSetup();
}

async function fetchStatus() {
  try {
    const response = await fetch("/api/status", { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401) {
      showPairing();
      setConnection(false, "Pairing required");
      return false;
    }
    if (!response.ok) throw new Error(`Status request failed: ${response.status}`);
    receive(await response.json());
    hidePairing();
    return true;
  } catch {
    if (!state.snapshot) renderEmpty();
    setConnection(false, navigator.onLine ? "Reconnecting" : "Offline · cached data");
    return false;
  }
}

function connectEvents() {
  if (state.events) return;
  const events = new EventSource("/api/events", { withCredentials: true });
  state.events = events;
  events.addEventListener("open", () => setConnection(true, "Live connection"));
  events.addEventListener("status", (event) => receive(JSON.parse(event.data)));
  events.addEventListener("error", () => setConnection(false, "Reconnecting"));
}

async function loadSetup() {
  try {
    const response = await fetch("/api/setup", { cache: "no-store" });
    if (!response.ok) return;
    state.setup = await response.json();
    elements.pairButton.classList.remove("hidden");
  } catch {}
}

async function submitPairing(event) {
  event.preventDefault();
  const button = elements.pairingForm.querySelector("button");
  button.disabled = true;
  elements.pairingError.textContent = "";
  try {
    const response = await fetch("/api/pair", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: elements.pairingCode.value })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Pairing failed.");
    hidePairing();
    if (await fetchStatus()) connectEvents();
  } catch (error) {
    elements.pairingError.textContent = error.message;
    elements.pairingCode.select();
  } finally {
    button.disabled = false;
  }
}

function showPairing() {
  elements.pairingGate.classList.remove("hidden");
  queueMicrotask(() => elements.pairingCode.focus());
}

function hidePairing() {
  elements.pairingGate.classList.add("hidden");
  elements.pairingError.textContent = "";
}

function showSetupPanel() {
  if (!state.setup) return;
  elements.setupCode.textContent = state.setup.pairingCode || "------";
  const urls = Array.isArray(state.setup.urls) ? state.setup.urls : [];
  elements.setupUrls.innerHTML = urls.length
    ? urls.map((url) => `<code>${escapeHtml(url)}</code>`).join("")
    : "<span>No local-network address was detected.</span>";
  elements.setupSecurityNote.textContent = state.setup.secure
    ? "This connection is encrypted. The pairing code changes whenever Quota Deck restarts."
    : "Use only on a trusted private network. The pairing code changes whenever Quota Deck restarts.";
  elements.setupPanel.classList.remove("hidden");
}

function hideSetupPanel() {
  elements.setupPanel.classList.add("hidden");
}
function receive(snapshot) {
  state.snapshot = snapshot;
  state.lastReceived = new Date();
  localStorage.setItem("quota-deck:last-status", JSON.stringify(snapshot));
  render(snapshot);
  setConnection(true, "Live connection");
}

function render(snapshot) {
  const providers = (Array.isArray(snapshot.providers) ? snapshot.providers : [])
    .filter((provider) => provider?.state !== "disconnected");
  elements.modePill.textContent = snapshot.mode === "live" ? "Live feed" : "Demo feed";
  elements.modePill.classList.toggle("live", snapshot.mode === "live");
  elements.grid.classList.toggle("single-provider", providers.length === 1);

  if (!providers.length) {
    renderEmpty();
    renderHero([]);
    return;
  }

  elements.grid.innerHTML = providers.map(providerCard).join("");
  renderHero(providers);
  updateFreshness();
  updateCountdowns();
}

function renderEmpty() {
  elements.grid.classList.remove("single-provider");
  elements.grid.innerHTML = '<div class="empty-state">No supported AI service detected yet.</div>';
}

function providerCard(provider) {
  const accent = safeColor(provider.accent);
  const metrics = Array.isArray(provider.metrics) ? provider.metrics : [];
  return `
    <article class="provider-card" style="--accent: ${accent}">
      <header class="provider-head">
        <div class="provider-identity">
          <div class="provider-icon" aria-hidden="true">${escapeHtml(provider.monogram || provider.name?.[0] || "AI")}</div>
          <div>
            <h3 class="provider-name">${escapeHtml(provider.name || "Provider")}</h3>
            <p class="provider-source">${escapeHtml(provider.source || "Collector")}</p>
          </div>
        </div>
        <span class="provider-state ${escapeHtml(provider.state || "connected")}" title="${escapeHtml(provider.state || "connected")}"></span>
      </header>
      <div class="metrics">
        ${metrics.map((metric) => metricMarkup(metric)).join("")}
      </div>
    </article>`;
}

function metricMarkup(metric) {
  if (metric.kind === "allowance") {
    const used = clamp(Number(metric.usedPercent) || 0);
    const remaining = Math.max(0, 100 - used);
    return `
      <div class="metric">
        <div class="metric-top">
          <span class="metric-label">${escapeHtml(metric.label)}</span>
          <span class="metric-used">${formatPercent(used)} used</span>
        </div>
        <div class="metric-value">${formatPercent(remaining)}<small>remaining</small></div>
        <div class="progress-track" role="progressbar" aria-label="${escapeHtml(metric.label)} used" aria-valuenow="${Math.round(used)}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-fill" style="--progress: ${used}%"></div>
        </div>
        <div class="metric-meta">
          <span>${metric.resetAt ? "Resets" : escapeHtml(metric.detail || "Allowance")}</span>
          <strong ${metric.resetAt ? `data-countdown="${escapeHtml(metric.resetAt)}"` : ""}>${metric.resetAt ? formatCountdown(metric.resetAt) : "—"}</strong>
        </div>
      </div>`;
  }

  if (metric.kind === "tokens") {
    const used = Math.max(0, Number(metric.used) || 0);
    const limit = Math.max(1, Number(metric.limit) || 1);
    const remaining = Math.max(0, limit - used);
    const percent = clamp((used / limit) * 100);
    return `
      <div class="metric">
        <div class="metric-top">
          <span class="metric-label">${escapeHtml(metric.label)}</span>
          <span class="metric-used">${formatPercent(percent)} full</span>
        </div>
        <div class="token-stats">
          <div class="token-main">${formatTokens(used)} <span>/ ${formatTokens(limit)}</span></div>
          <div class="token-left"><strong>${formatTokens(remaining)}</strong>tokens left</div>
        </div>
        <div class="progress-track" role="progressbar" aria-label="${escapeHtml(metric.label)} used" aria-valuenow="${Math.round(percent)}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-fill" style="--progress: ${percent}%"></div>
        </div>
      </div>`;
  }

  return `
    <div class="metric">
      <div class="metric-top"><span class="metric-label">${escapeHtml(metric.label)}</span></div>
      <div class="metric-value">${escapeHtml(metric.value || "—")}</div>
    </div>`;
}

function renderHero(providers) {
  const candidates = providers.flatMap((provider) =>
    (provider.metrics || [])
      .filter((metric) => metric.kind === "allowance" && metric.resetAt && new Date(metric.resetAt) > new Date())
      .map((metric) => ({ provider, metric }))
  );
  candidates.sort((a, b) => new Date(a.metric.resetAt) - new Date(b.metric.resetAt));
  const next = candidates[0];

  if (!next) {
    elements.heroCountdown.textContent = "--:--:--";
    delete elements.heroCountdown.dataset.resetAt;
    elements.heroCaption.textContent = "No upcoming reset reported";
    elements.heroRemaining.textContent = "—";
    return;
  }

  elements.heroCountdown.dataset.resetAt = next.metric.resetAt;
  elements.heroCountdown.textContent = formatCountdown(next.metric.resetAt, true);
  elements.heroCaption.textContent = `${next.provider.name} · ${next.metric.label} · ${formatClock(next.metric.resetAt)}`;
  elements.heroRemaining.textContent = `${formatPercent(100 - Number(next.metric.usedPercent || 0))}`;
}

function updateCountdowns() {
  document.querySelectorAll("[data-countdown]").forEach((element) => {
    element.textContent = formatCountdown(element.dataset.countdown);
  });
  if (elements.heroCountdown.dataset.resetAt) {
    elements.heroCountdown.textContent = formatCountdown(elements.heroCountdown.dataset.resetAt, true);
  }
}

function updateFreshness() {
  if (!state.lastReceived) {
    elements.updatedLabel.textContent = state.snapshot ? "Showing cached data" : "Connecting…";
    return;
  }
  const seconds = Math.max(0, Math.round((Date.now() - state.lastReceived.getTime()) / 1000));
  elements.updatedLabel.textContent = seconds < 5 ? "Updated just now" : `Updated ${seconds}s ago`;
}

function setConnection(connected, label) {
  state.connected = connected;
  elements.connectionLabel.textContent = label;
  elements.connectionDot.classList.toggle("online", connected);
  elements.connectionDot.classList.toggle("offline", !connected && !navigator.onLine);
}

function formatCountdown(value, clockOnly = false) {
  const milliseconds = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(milliseconds)) return "—";
  if (milliseconds <= 0) return clockOnly ? "00:00:00" : "now";

  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (clockOnly) {
    const totalHours = Math.floor(totalSeconds / 3600);
    return [totalHours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  }
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function formatTokens(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${trimZero((number / 1_000_000).toFixed(1))}M`;
  if (number >= 1_000) return `${trimZero((number / 1_000).toFixed(1))}k`;
  return Math.round(number).toLocaleString();
}

function trimZero(value) {
  return value.replace(/\.0$/, "");
}

function formatPercent(value) {
  const number = clamp(Number(value) || 0);
  return `${number < 10 && number % 1 ? number.toFixed(1) : Math.round(number)}%`;
}

function formatClock(value) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#5b8cff";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function restoreSnapshot() {
  try {
    return JSON.parse(localStorage.getItem("quota-deck:last-status"));
  } catch {
    return null;
  }
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    showToast("Fullscreen is not available in this browser. Install the app for a borderless display.");
  }
}

async function toggleWakeLock() {
  if (!("wakeLock" in navigator)) {
    showToast("Screen wake lock is not supported here. Use your device display settings instead.");
    return;
  }
  try {
    if (state.wakeLock) {
      await state.wakeLock.release();
      state.wakeLock = null;
      elements.wakeButton.classList.remove("active");
      elements.wakeButton.lastChild.textContent = " Keep awake";
    } else {
      state.wakeLock = await navigator.wakeLock.request("screen");
      elements.wakeButton.classList.add("active");
      elements.wakeButton.lastChild.textContent = " Staying awake";
      state.wakeLock.addEventListener("release", () => {
        state.wakeLock = null;
        elements.wakeButton.classList.remove("active");
      });
    }
  } catch {
    showToast("The device did not allow the screen to stay awake.");
  }
}

async function restoreWakeLock() {
  if (document.visibilityState === "visible" && elements.wakeButton.classList.contains("active") && !state.wakeLock) {
    try { state.wakeLock = await navigator.wakeLock.request("screen"); } catch {}
  }
}

async function installApp() {
  if (!state.installPrompt) return;
  await state.installPrompt.prompt();
  state.installPrompt = null;
  elements.installButton.classList.add("hidden");
}

function applyBurnInDrift() {
  const x = Math.round(Math.random() * 4 - 2);
  const y = Math.round(Math.random() * 4 - 2);
  document.documentElement.style.setProperty("--drift-x", `${x}px`);
  document.documentElement.style.setProperty("--drift-y", `${y}px`);
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 4200);
}
