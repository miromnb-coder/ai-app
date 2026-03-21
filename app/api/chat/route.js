import { NextResponse } from "next/server";
import { runAgent } from "../../../lib/agent";
import { getSessionState, mergeMemory, updateSessionState } from "../../../lib/sessionStore";

export async function POST(req) {
  try {
    const body = await req.json();
    const sessionId = String(body.sessionId || "").trim();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const clientMemory = Array.isArray(body.memory) ? body.memory : [];
    const visionContext = String(body.visionContext || "");
    const mode = String(body.mode || "ask");
    const autoSpeak = Boolean(body.autoSpeak ?? true);

    if (!messages.length) {
      return NextResponse.json({ error: "Messages puuttuu" }, { status: 400 });
    }

    const serverState = getSessionState(sessionId);
    const memory = mergeMemory(serverState.memory, clientMemory);
    const effectiveVisionContext = visionContext.trim() || serverState.visionContext || "";

    const result = await runAgent(messages, memory, effectiveVisionContext, mode);

    updateSessionState(sessionId, {
      memory,
      visionContext: effectiveVisionContext,
      lastReply: result.reply,
    });

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
