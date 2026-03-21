import { runTool } from "./tools";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `
Olet Agent Level 3.

Tavoite:
- Ole hyödyllinen, lyhyt ja selkeä.
- Vastaa suomeksi, jos käyttäjä kirjoittaa suomeksi.
- Käytä tarvittaessa työkaluja.
- Hyödynnä käyttäjän muisti.
- Jos käyttäjä pyytää muistin käyttöä, etsi siitä.
- Jos käyttäjä pyytää laskua, käytä calculator-työkalua.
- Jos käyttäjä pyytää aikaa, käytä time-työkalua.
- Jos käyttäjä kysyy jotakin muistista, käytä memory_search-työkalua.

Työkalut:
1) calculator
   - input: matemaattinen lauseke, esim. "48*17"

2) time
   - input: voi olla mikä tahansa tai tyhjä

3) memory_search
   - input: hakusana tai lyhyt kysely

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

async function callGroq(messages) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY puuttuu ympäristömuuttujista.");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 900,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq-virhe: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

export async function runAgent(chatMessages, memory = []) {
  const recentMessages = Array.isArray(chatMessages) ? chatMessages.slice(-12) : [];
  const memoryText =
    Array.isArray(memory) && memory.length
      ? memory.map((item, index) => `${index + 1}. ${item}`).join("\n")
      : "Ei tallennettua muistia.";

  const planMessages = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\nKäyttäjän muisti:\n${memoryText}`,
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
        content: `${SYSTEM_PROMPT}\n\nKäyttäjän muisti:\n${memoryText}`,
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
