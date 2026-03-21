import OpenAI from "openai";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const client = new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

function memoryToText(memory = []) {
  if (!Array.isArray(memory) || !memory.length) return "Ei tallennettua muistia.";
  return memory.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function taskInstructions(visionTask, instruction) {
  switch (String(visionTask || "describe")) {
    case "read_text":
      return "Lue kuvassa näkyvä teksti mahdollisimman tarkasti ja lyhyesti.";
    case "translate":
      return "Lue kuvassa näkyvä teksti ja käännä se suomeksi. Jos tekstiä ei ole, kerro mitä näet.";
    case "question":
      return instruction?.trim()
        ? `Vastaa käyttäjän kysymykseen kuvan perusteella: ${instruction.trim()}`
        : "Vastaa käyttäjän kysymykseen kuvan perusteella.";
    case "describe":
    default:
      return "Kerro lyhyesti ja hyödyllisesti mitä kuvassa näkyy.";
  }
}

export async function analyzeVisionFrame({
  image,
  memory = [],
  visionContext = "",
  visionTask = "describe",
  instruction = "",
}) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY puuttuu ympäristömuuttujista.");
  }

  const prompt = `
Sinä olet älylasien näköagentti.

Tehtävä:
- ${taskInstructions(visionTask, instruction)}
- Jos kuvassa on turvallisuusriski, sano se lyhyesti.
- Vastaus suomeksi.
- Pidä vastaus lyhyenä, jotta se sopii lasinäyttöön.

Käyttäjän muisti:
${memoryToText(memory)}

Viimeisin kamerakonteksti:
${visionContext?.trim() || "Ei aiempaa kamerakontekstia."}
`.trim();

  const response = await client.responses.create({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt,
          },
          {
            type: "input_image",
            detail: "auto",
            image_url: image,
          },
        ],
      },
    ],
  });

  return response.output_text?.trim() || "";
}
