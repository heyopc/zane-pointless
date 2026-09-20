import { firebaseConfig } from "./firebase-config.js";

const params = new URLSearchParams(location.search);
let room = params.get("room");

if (!room) {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  room = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  params.set("room", room);
  history.replaceState(null, "", `${location.pathname}?${params.toString()}${location.hash}`);
}

const channelName = `pointless-overlay:${room}`;
const bc = "BroadcastChannel" in window ? new BroadcastChannel(channelName) : null;
const storageKey = `${channelName}:command`;
const listeners = new Set();
let firebaseReady = false;
let dbRef = null;
let dbSet = null;
let unsubscribeFirebase = null;
let localRelayReady = false;
let localPollTimer = null;
let localLastId = null;

const isLocalHttp = ["localhost", "127.0.0.1", "::1"].includes(location.hostname) && /^https?:$/.test(location.protocol);

function emit(command, source = "local") {
  if (!command || typeof command !== "object") return;
  for (const fn of listeners) fn(command, source);
}

if (bc) bc.addEventListener("message", e => emit(e.data, "broadcast"));
window.addEventListener("storage", e => {
  if (e.key !== storageKey || !e.newValue) return;
  try { emit(JSON.parse(e.newValue), "storage"); } catch (_) {}
});

function hasFirebaseConfig() {
  return Boolean(
    firebaseConfig &&
    firebaseConfig.apiKey &&
    firebaseConfig.databaseURL &&
    !firebaseConfig.apiKey.includes("PASTE_") &&
    !firebaseConfig.databaseURL.includes("PASTE_")
  );
}

async function initLocalRelay() {
  if (!isLocalHttp) return false;
  try {
    const res = await fetch(`/api/ping`, { cache: "no-store" });
    if (!res.ok) return false;
    localRelayReady = true;
    window.dispatchEvent(new CustomEvent("sync-status", { detail: getSyncStatus() }));

    const poll = async () => {
      try {
        const r = await fetch(`/api/command?room=${encodeURIComponent(room)}`, { cache: "no-store" });
        if (r.ok) {
          const cmd = await r.json();
          if (cmd && cmd.id && cmd.id !== localLastId) {
            localLastId = cmd.id;
            emit(cmd, "local-relay");
          }
        }
      } catch (_) {}
      localPollTimer = setTimeout(poll, 80);
    };
    poll();
    return true;
  } catch (_) {
    localRelayReady = false;
    return false;
  }
}

async function initFirebase() {
  if (!hasFirebaseConfig()) return false;
  try {
    const [{ initializeApp }, { getDatabase, ref, set, onValue }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js")
    ]);
    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    dbRef = ref(db, `rooms/${room}/command`);
    dbSet = set;
    unsubscribeFirebase = onValue(dbRef, snapshot => {
      if (snapshot.exists()) emit(snapshot.val(), "firebase");
    });
    firebaseReady = true;
    window.dispatchEvent(new CustomEvent("sync-status", { detail: getSyncStatus() }));
    return true;
  } catch (err) {
    console.error("Firebase init failed:", err);
    window.dispatchEvent(new CustomEvent("sync-status", { detail: getSyncStatus(err) }));
    return false;
  }
}

export function getRoom() { return room; }

export function getSyncStatus(error = null) {
  const mode = firebaseReady ? "cloud" : (localRelayReady ? "relay" : "local");
  return {
    room,
    cloudConfigured: hasFirebaseConfig(),
    cloudConnected: firebaseReady,
    localRelayConnected: localRelayReady,
    mode,
    error: error ? String(error?.message || error) : null
  };
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function publish(action, payload = {}) {
  const command = {
    action,
    ...payload,
    room,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    sentAt: Date.now()
  };

  try { localStorage.setItem(storageKey, JSON.stringify(command)); } catch (_) {}
  if (bc) bc.postMessage(command);
  emit(command, "self");

  if (localRelayReady) {
    try {
      await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
        cache: "no-store"
      });
      localLastId = command.id;
    } catch (err) {
      console.warn("Local relay publish failed:", err);
    }
  }

  if (firebaseReady && dbRef && dbSet) {
    await dbSet(dbRef, command);
  }
  return command;
}

export const cloudInit = Promise.all([initLocalRelay(), initFirebase()]);

window.addEventListener("beforeunload", () => {
  if (typeof unsubscribeFirebase === "function") unsubscribeFirebase();
  if (bc) bc.close();
  if (localPollTimer) clearTimeout(localPollTimer);
});
