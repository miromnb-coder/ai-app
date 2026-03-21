import OpenAI from "openai";
import { runTool } from "./tools";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const client = new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const SYSTEM_PROMPT = `
Olet älylasimodeen suunniteltu superagentti.

Tavoite:
- Ole hyödyllinen, nopea ja selkeä.
- Vastaa suomeksi, jos käyttäjä kirjoittaa suomeksi.
- Pidä vastaukset lyhyinä, ellei käyttäjä pyydä enemmän.
- Käytä tarvittaessa työkaluja.
- Hyödynnä käyttäjän muistia.
- Hyödynnä viimeisin kamerakonteksti, jos se on annettu.
- Jos tila on translate, käännä näkyvä teksti tai käyttäjän viesti.
- Jos tila on vision, kuvaile kameraa ja vastaa havainnon perusteella.
- Jos tila on memory, korosta muistamista ja muistista hakemista.
- Jos käyttäjä pyytää muistin käyttöä, käytä memory_search-työkalua.
- Jos käyttäjä pyytää laskua, käytä calculator-työkalua.
- Jos käyttäjä pyytää aikaa, käytä time-työkalua.
- Jos käyttäjä pyytää tiivistystä, käytä summarize-työkalua.

Työkalut:
1) calculator
   - input: matemaattinen lauseke, esim. "48*17"

2) time
   - input: voi olla mikä tahansa tai tyhjä

3) memory_search
   - input: hakusana tai lyhyt kysely

4) summarize
   - input: tiivistettävä teksti

Palauta AINA vain JSON.

Jos tarvitset työkalun:
{
  "action": "tool",
  "tool": "calculator",
  "input": "48*17"
}

Jos voit vastata suoraan:
{
  "action": "final",
  "answer": "vastaus tähän",
  "autoSpeak": true
}

Älä kirjoita mitään muuta kuin JSON.
`.trim();

function extractJson(text) {
  const trimmed = String(text || "").trim();

  try {
    return JSON.parse(trimmed);
  } catch {}

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {}
  }

  return null;
}

function cleanMessages(chatMessages) {
  return (Array.isArray(chatMessages) ? chatMessages : [])
    .map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: String(m.content || ""),
    }))
    .filter((m) => m.content.trim().length > 0);
}

async function callGroq(messages) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY puuttuu ympäristömuuttujista.");
  }

  const response = await client.chat.completions.create({
    model: GROQ_MODEL,
    messages,
    temperature: 0.3,
    max_tokens: 900,
  });

  return response?.choices?.[0]?.message?.content?.trim() || "";
}

function modeHint(mode) {
  switch (String(mode || "ask")) {
    case "vision":
      return "Tila on vision. Vastaa kamerakontekstin perusteella mahdollisimman lyhyesti ja hyödyllisesti.";
    case "translate":
      return "Tila on translate. Käännä käyttäjän viesti tai kamerassa näkyvä teksti suomeksi. Älä selitä turhaan.";
    case "memory":
      return "Tila on memory. Muista tärkeät asiat ja käytä tarvittaessa muistia.";
    case "readout":
      return "Tila on readout. Pidä vastaus lyhyenä ja selkeänä puheelle sopivaksi.";
    default:
      return "Tila on ask. Vastaa normaalisti ja hyödyllisesti.";
  }
}

export async function runAgent(chatMessages, memory = [], visionContext = "", mode = "ask") {
  const recentMessages = cleanMessages(chatMessages).slice(-12);
  const memoryText =
    Array.isArray(memory) && memory.length
      ? memory.map((item, index) => `${index + 1}. ${item}`).join("\n")
      : "Ei tallennettua muistia.";

  const visionText = visionContext?.trim()
    ? `\n\nViimeisin kamerakonteksti:\n${visionContext.trim()}`
    : "";

  const planMessages = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\n${modeHint(mode)}\n\nKäyttäjän muisti:\n${memoryText}${visionText}`,
    },
    ...recentMessages,
    {
      role: "user",
      content: "Päätä tarvitsetko työkalun. Palauta vain JSON.",
    },
  ];

  const planRaw = await callGroq(planMessages);
  const plan = extractJson(planRaw);

  if (plan?.action === "tool" && plan?.tool) {
    const toolResult = runTool(plan.tool, plan.input, memory);

    const finalMessages = [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\n\n${modeHint(mode)}\n\nKäyttäjän muisti:\n${memoryText}${visionText}`,
      },
      ...recentMessages,
      {
        role: "assistant",
        content: `Käytin työkalua ${plan.tool}. Tulos: ${toolResult}`,
      },
      {
        role: "user",
        content: "Muotoile tästä käyttäjälle hyvä vastaus. Palauta vain JSON.",
      },
    ];

    const finalRaw = await callGroq(finalMessages);
    const finalJson = extractJson(finalRaw);

    if (finalJson?.action === "final" && finalJson?.answer) {
      return {
        reply: finalJson.answer,
        autoSpeak: Boolean(finalJson.autoSpeak ?? true),
        toolUsed: plan.tool,
      };
    }

    return {
      reply: finalRaw || String(toolResult),
      autoSpeak: true,
      toolUsed: plan.tool,
    };
  }

  if (plan?.action === "final" && plan?.answer) {
    return {
      reply: plan.answer,
      autoSpeak: Boolean(plan.autoSpeak ?? true),
      toolUsed: null,
    };
  }

  return {
    reply: planRaw || "En saanut vastausta.",
    autoSpeak: true,
    toolUsed: null,
  };
}
