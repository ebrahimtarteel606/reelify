import { NextResponse } from "next/server";
import { loadPreferences, savePreferences } from "../../../lib/qaStore";

export const runtime = "nodejs";

export async function GET() {
  const preferences = await loadPreferences();
  return NextResponse.json({ preferences });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const preferences = await savePreferences(payload ?? {});
    return NextResponse.json({ preferences });
  } catch {
    return NextResponse.json({ error: "Invalid preferences payload" }, { status: 400 });
  }
}
