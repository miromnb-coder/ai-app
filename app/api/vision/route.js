import { NextResponse } from "next/server";
import { analyzeVisionFrame } from "../../../lib/vision";

export async function POST(req) {
  try {
    const body = await req.json();
    const image = String(body.image || "");
    const memory = Array.isArray(body.memory) ? body.memory : [];
    const visionContext = String(body.visionContext || "");

    if (!image) {
      return NextResponse.json({ error: "Kuva puuttuu" }, { status: 400 });
    }

    const reply = await analyzeVisionFrame({
      image,
      memory,
      visionContext,
    });

    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Vision-virhe" },
      { status: 500 }
    );
  }
}
