import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 400 });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );

  if (!response.ok) {
    const details = await response.text();
    return NextResponse.json({ error: "Failed to fetch Gemini models", details }, { status: 500 });
  }

  const data = await response.json();
  const models = Array.isArray(data?.models) ? data.models : [];
  const filtered = models.filter((model: any) =>
    Array.isArray(model?.supportedGenerationMethods)
      ? model.supportedGenerationMethods.includes("generateContent")
      : false
  );

  return NextResponse.json({
    models: filtered.map((model: any) => ({
      name: model.name,
      displayName: model.displayName,
    })),
  });
}
