

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `
Olet Halo mode AI-agentti.

Toimi näin:
- vastaa selkeästi ja hyödyllisesti
- jos käyttäjä kirjoittaa suomeksi, vastaa suomeksi
- jos lasku auttaa, käytä calculator-työkalua
- jos aika auttaa, käytä time-työkalua
- älä keksi muita työkaluja

Palauta AINA vain JSON:

Jos tarvitset työkalun:
{
  "action": "tool",
  "tool": "calculator",
  "input": "2+2"
}

Jos voit vastata suoraan:
{
  "action": "final",
  "answer": "vastaus tähän",
  "autoSpeak": true
}

Ei mitään muuta tekstiä kuin JSON.
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

export async function runAgent(chatMessages) {
  const recentMessages = chatMessages.slice(-10);

  const planMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...recentMessages,
    {
      role: "user",
      content: "Tee päätös: tarvitsetko työkalua vai voitko vastata suoraan?",
    },
  ];

  const planRaw = await callGroq(planMessages);
  const plan = extractJson(planRaw);

  if (plan?.action === "tool" && plan?.tool) {
    const toolResult = runTool(plan.tool, plan.input);

    const finalMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...recentMessages,
      {
        role: "assistant",
        content: `Työkalun tulos: ${toolResult}`,
      },
      {
        role: "user",
        content:
          "Muotoile tästä käyttäjälle luonnollinen, lyhyt ja hyödyllinen vastaus.",
      },
    ];

    const finalRaw = await callGroq(finalMessages);
    const finalJson = extractJson(finalRaw);

    if (finalJson?.action === "final" && finalJson?.answer) {
      return {
        reply: finalJson.answer,
        autoSpeak: Boolean(finalJson.autoSpeak),
      };
    }

    return {
      reply: finalRaw || String(toolResult),
      autoSpeak: true,
    };
  }

  if (plan?.action === "final" && plan?.answer) {
    return {
      reply: plan.answer,
      autoSpeak: Boolean(plan.autoSpeak),
    };
  }

  return {
    reply: planRaw || "En saanut vastausta mallilta.",
    autoSpeak: true,
  };
}
