import { NextRequest, NextResponse } from "next/server";
import { getUserById } from "../../../../lib/supabase";

// POST /api/admin/validate-user – check if a user_id exists (no secret required)
export async function POST(request: NextRequest) {
  try {
    const { user_id } = await request.json();

    if (!user_id || typeof user_id !== "string") {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const user = await getUserById(user_id.trim());
    if (!user) {
      return NextResponse.json(
        { error: "User not found. Please check your ID and try again." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, display_name: user.display_name });
  } catch {
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
}
