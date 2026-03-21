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

export function getLocalTime() {
  return new Date().toLocaleString("fi-FI", {
    dateStyle: "full",
    timeStyle: "medium",
  });
}

export function searchMemory(memory, query) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return [];

  return memory.filter((item) => String(item).toLowerCase().includes(q)).slice(-5);
}

export function runTool(name, input, memory = []) {
  switch (name) {
    case "calculator":
      return calculator(input);
    case "time":
      return getLocalTime();
    case "memory_search":
      return searchMemory(memory, input).join("\n");
    default:
      return `Tuntematon työkalu: ${name}`;
  }
}
