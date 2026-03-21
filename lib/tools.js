export function calculator(expression) {
  const input = String(expression || "").trim();

  if (!input) return "Tyhjä lasku.";

  if (!/^[0-9+\-*/().,\s%^]+$/.test(input)) {
    return "Laskussa oli merkkejä, joita en hyväksy.";
  }

  try {
    const js = input.replace(/\^/g, "**");
    const result = Function(`"use strict"; return (${js});`)();

    if (typeof result === "number" && Number.isFinite(result)) {
      return String(result);
    }

    return String(result);
  } catch {
    return "En pystynyt laskemaan tuota.";
  }
}

export function summarizeText(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();

  if (!normalized) return "Ei tiivistettävää.";
  if (normalized.length <= 220) return normalized;

  const cut = normalized.slice(0, 220);
  return `${cut.replace(/\s+\S*$/, "").trim()}…`;
}

export function getLocalTime() {
  return new Date().toLocaleString("fi-FI", {
    dateStyle: "full",
    timeStyle: "medium",
  });
}

export function searchMemory(memory, query) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return [];

  return memory
    .filter((item) => String(item).toLowerCase().includes(q))
    .slice(-5);
}

export function runTool(name, input, memory = []) {
  switch (name) {
    case "calculator":
      return calculator(input);
    case "time":
      return getLocalTime();
    case "memory_search":
      return searchMemory(memory, input).join("\n");
    case "summarize":
      return summarizeText(input);
    default:
      return `Tuntematon työkalu: ${name}`;
  }
}
