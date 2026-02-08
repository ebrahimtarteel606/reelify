import { NextResponse } from "next/server";
import { getUserById } from "../../../../lib/supabase";

/**
 * POST /api/credits/check
 * Body: { user_id: string, duration_seconds: number }
 * Returns { ok: true } or { ok: false, error: string }
 * Does not charge credits; only validates that the user has enough.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = typeof body?.user_id === "string" ? body.user_id : null;
    const durationSeconds =
      typeof body?.duration_seconds === "number" && body.duration_seconds > 0
        ? Math.ceil(body.duration_seconds)
        : 0;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Missing user_id" },
        { status: 400 }
      );
    }
    if (!durationSeconds) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid duration_seconds" },
        { status: 400 }
      );
    }

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 403 }
      );
    }

    const durationMinutes = Math.ceil(durationSeconds / 60);
    if (user.credits_remaining < durationMinutes) {
      return NextResponse.json({
        ok: false,
        error: `Insufficient credits: need ${durationMinutes} min but only ${user.credits_remaining} min remaining`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}
