import { NextResponse } from "next/server";
import { analyzeVisionFrame } from "../../../lib/vision";
import {
  getSessionState,
  mergeMemory,
  updateSessionState,
} from "../../../lib/sessionStore";

export async function POST(req) {
  try {
    const body = await req.json();
    const sessionId = String(body.sessionId || "").trim();
    const image = String(body.image || "");
    const clientMemory = Array.isArray(body.memory) ? body.memory : [];
    const visionContext = String(body.visionContext || "");

    if (!image) {
      return NextResponse.json({ error: "Kuva puuttuu" }, { status: 400 });
    }

    const serverState = getSessionState(sessionId);
    const memory = mergeMemory(serverState.memory, clientMemory);
    const effectiveVisionContext = visionContext.trim() || serverState.visionContext || "";

    const reply = await analyzeVisionFrame({
      image,
      memory,
      visionContext: effectiveVisionContext,
    });

    updateSessionState(sessionId, {
      memory,
      visionContext: reply,
    });

    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Vision-virhe" },
      { status: 500 }
    );
  }
}
