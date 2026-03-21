import { NextResponse } from "next/server";
import { runAgent } from "../../../lib/agent";

export async function POST(req) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const memory = Array.isArray(body.memory) ? body.memory : [];
    const autoSpeak = Boolean(body.autoSpeak ?? true);

    if (!messages.length) {
      return NextResponse.json({ error: "Messages puuttuu" }, { status: 400 });
    }

    const result = await runAgent(messages, memory);

    return NextResponse.json({
      reply: result.reply,
      autoSpeak: result.autoSpeak ?? autoSpeak,
      toolUsed: result.toolUsed ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Virhe tapahtui" },
      { status: 500 }
    );
  }
}
