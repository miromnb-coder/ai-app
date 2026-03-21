import { mergeMemory } from "./memory";

const store = globalThis.__haloSessionStore || new Map();
globalThis.__haloSessionStore = store;

function normalizeMemory(list = []) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

export function getSessionState(sessionId) {
  const key = String(sessionId || "").trim();

  if (!key) {
    return {
      memory: [],
      visionContext: "",
      lastReply: "",
      mode: "ask",
      batterySaver: false,
      updatedAt: Date.now(),
    };
  }

  if (!store.has(key)) {
    store.set(key, {
      memory: [],
      visionContext: "",
      lastReply: "",
      mode: "ask",
      batterySaver: false,
      updatedAt: Date.now(),
    });
  }

  return store.get(key);
}

export function updateSessionState(sessionId, patch = {}) {
  const key = String(sessionId || "").trim();
  if (!key) return null;

  const current = getSessionState(key);

  const next = {
    ...current,
    ...patch,
    memory: mergeMemory(current.memory, patch.memory),
    visionContext:
      patch.visionContext !== undefined
        ? String(patch.visionContext || "")
        : current.visionContext,
    lastReply:
      patch.lastReply !== undefined
        ? String(patch.lastReply || "")
        : current.lastReply,
    mode: patch.mode !== undefined ? String(patch.mode || "ask") : current.mode,
    batterySaver:
      patch.batterySaver !== undefined ? Boolean(patch.batterySaver) : current.batterySaver,
    updatedAt: Date.now(),
  };

  store.set(key, next);
  return next;
}

export function mergeSessionMemory(...lists) {
  const seen = new Set();
  const merged = [];

  for (const list of lists) {
    for (const item of normalizeMemory(list)) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  return merged.slice(-40);
}
