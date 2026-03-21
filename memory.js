const globalMemoryStore = globalThis.__haloMemoryStore || new Map();
globalThis.__haloMemoryStore = globalMemoryStore;

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function createMemoryItem(text, type = "fact", source = "manual") {
  const clean = normalizeText(text);
  if (!clean) return null;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: clean,
    type,
    source,
    createdAt: new Date().toISOString(),
  };
}

export function normalizeMemory(list = []) {
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => {
      if (typeof item === "string") {
        return createMemoryItem(item, "fact", "legacy");
      }

      const text = normalizeText(item?.text);
      if (!text) return null;

      return {
        id: item?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        type: item?.type || "fact",
        source: item?.source || "manual",
        createdAt: item?.createdAt || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

function dedupeMemory(items) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = item.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out.slice(-50);
}

export function mergeMemory(...lists) {
  const merged = [];
  for (const list of lists) {
    merged.push(...normalizeMemory(list));
  }
  return dedupeMemory(merged);
}

export function addMemory(sessionId, item) {
  const key = String(sessionId || "").trim();
  if (!key || !item?.text) return [];

  const current = getMemory(sessionId);
  const next = dedupeMemory([...current, item]);
  globalMemoryStore.set(key, next);
  return next;
}

export function removeMemory(sessionId, idOrText) {
  const key = String(sessionId || "").trim();
  if (!key) return [];

  const current = getMemory(sessionId);
  const target = normalizeText(idOrText).toLowerCase();

  const next = current.filter((item) => {
    const matchesId = String(item.id) === String(idOrText);
    const matchesText = item.text.toLowerCase() === target;
    return !(matchesId || matchesText);
  });

  globalMemoryStore.set(key, next);
  return next;
}

export function clearMemory(sessionId) {
  const key = String(sessionId || "").trim();
  if (!key) return [];
  globalMemoryStore.set(key, []);
  return [];
}

export function getMemory(sessionId) {
  const key = String(sessionId || "").trim();
  if (!key) return [];

  if (!globalMemoryStore.has(key)) {
    globalMemoryStore.set(key, []);
  }

  return normalizeMemory(globalMemoryStore.get(key));
}

export function memoryToText(memory = []) {
  const items = normalizeMemory(memory);
  if (!items.length) return "Ei tallennettuja muistoja.";

  return items
    .map((item, index) => `${index + 1}. ${item.text} [${item.type}]`)
    .join("\n");
}

export function extractMemoryCandidates(text) {
  const clean = normalizeText(text);
  if (!clean) return [];

  const lower = clean.toLowerCase();
  const result = [];

  const explicit = clean.match(/^(muista tämä|remember this)\s*:\s*(.+)$/i);
  if (explicit?.[2]) {
    result.push(createMemoryItem(explicit[2], "fact", "explicit"));
    return result;
  }

  const forget = clean.match(/^(unohda tämä|forget this)\s*:\s*(.+)$/i);
  if (forget?.[2]) {
    return [];
  }

  const patterns = [
    /^tykkään\s+(.+)$/i,
    /^pidän\s+(.+)$/i,
    /^en tykkää\s+(.+)$/i,
    /^olen\s+(.+)$/i,
    /^minun nimeni on\s+(.+)$/i,
    /^mun nimi on\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match?.[1]) {
      result.push(createMemoryItem(match[1], "preference", "auto"));
      break;
    }
  }

  if (/muista/i.test(lower) && result.length === 0) {
    const afterColon = clean.split(":").slice(1).join(":").trim();
    if (afterColon) result.push(createMemoryItem(afterColon, "fact", "explicit"));
  }

  return result;
}
