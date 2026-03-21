import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export async function POST(req) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (!messages.length) {
      return NextResponse.json({ error: "Messages puuttuu" }, { status: 400 });
    }

    const result = await runAgent(messages);

    return NextResponse.json({
      reply: result.reply,
      autoSpeak: result.autoSpeak || false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Virhe" },
      { status: 500 }
    );
  }
}
