import { publish, subscribe, getRoom, getSyncStatus, cloudInit } from "./sync.js";

const target = document.getElementById("target");
const revealBtn = document.getElementById("reveal");
const wrongBtn = document.getElementById("wrong");
const resetBtn = document.getElementById("reset");
const roomEl = document.getElementById("room");
const overlayUrlEl = document.getElementById("overlay-url");
const copyBtn = document.getElementById("copy-url");
const statusEl = document.getElementById("status");
const eventlog = document.getElementById("eventlog");
const preview = document.getElementById("preview");

const room = getRoom();
const overlayUrl = new URL("./overlay.html", location.href);
overlayUrl.search = `?room=${encodeURIComponent(room)}`;

roomEl.textContent = room;
overlayUrlEl.textContent = overlayUrl.href;
preview.src = overlayUrl.href;

function clamp(n) { return Math.max(0, Math.min(100, Math.round(Number(n) || 0))); }

function setStatus(status = getSyncStatus()) {
  statusEl.className = `status ${status.mode}`;
  if (status.cloudConnected) {
    statusEl.textContent = "Cloud sync connected";
  } else if (status.localRelayConnected) {
    statusEl.textContent = "Local OBS relay connected";
  } else if (status.cloudConfigured) {
    statusEl.textContent = "Connecting cloud sync…";
  } else {
    statusEl.textContent = "Browser-only test mode";
  }
  if (status.error) statusEl.textContent = "Cloud sync error — local mode";
}
setStatus();
window.addEventListener("sync-status", e => setStatus(e.detail));

async function reveal() {
  const value = clamp(target.value);
  target.value = value;
  await publish("reveal", { target: value });
}

revealBtn.addEventListener("click", reveal);
wrongBtn.addEventListener("click", () => publish("wrong"));
resetBtn.addEventListener("click", () => publish("reset"));
target.addEventListener("keydown", e => { if (e.key === "Enter") reveal(); });

document.querySelectorAll("[data-score]").forEach(btn => {
  btn.addEventListener("click", () => { target.value = btn.dataset.score; reveal(); });
});

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(overlayUrl.href);
  copyBtn.textContent = "Copied";
  setTimeout(() => copyBtn.textContent = "Copy browser-source URL", 1100);
});

subscribe((cmd, source) => {
  if (source === "self") {
    if (cmd.action === "reveal") {
      eventlog.textContent = `Sent: reveal ${cmd.target} — ${cmd.target} points awarded`;
    } else if (cmd.action === "wrong") {
      eventlog.textContent = "Sent: wrong answer — X = 100 points awarded";
    } else {
      eventlog.textContent = `Sent: ${cmd.action}`;
    }
  }
});

await cloudInit;
setStatus();