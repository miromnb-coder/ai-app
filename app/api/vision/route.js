import { NextResponse } from "next/server";
import { runAgent } from "../../../lib/agent";
import { getSessionState, mergeSessionMemory, updateSessionState } from "../../../lib/sessionStore";

function cleanMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: String(m.content || "").trim(),
    }))
    .filter((m) => m.content.length > 0);
}

export async function POST(req) {
  try {
    const body = await req.json();
    const sessionId = String(body.sessionId || "").trim();
    const messages = cleanMessages(body.messages);
    const clientMemory = Array.isArray(body.memory) ? body.memory : [];
    const visionContext = String(body.visionContext || "");
    const mode = String(body.mode || "ask");
    const batterySaver = Boolean(body.batterySaver ?? false);
    const autoSpeak = Boolean(body.autoSpeak ?? true);

    if (!messages.length) {
      return NextResponse.json({ error: "Messages puuttuu" }, { status: 400 });
    }

    const serverState = getSessionState(sessionId);
    const memory = mergeSessionMemory(serverState.memory, clientMemory);
    const effectiveVisionContext = visionContext.trim() || serverState.visionContext || "";

    const result = await runAgent(messages, memory, effectiveVisionContext, mode, batterySaver);

    updateSessionState(sessionId, {
      memory,
      visionContext: effectiveVisionContext,
      lastReply: result.reply,
      mode,
      batterySaver,
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
