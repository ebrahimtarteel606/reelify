import { NextRequest, NextResponse } from "next/server";
import { getUserById } from "@/lib/supabase";

const USER_ID_COOKIE = "reelify_user_id";

/**
 * GET /api/me
 * Returns the current user's profile (credits, display name) using the session cookie.
 * Returns 401 if not logged in.
 */
export async function GET(request: NextRequest) {
  const userId = request.cookies.get(USER_ID_COOKIE)?.value;
  if (!userId) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: user.id,
    display_name: user.display_name,
    credits_remaining: user.credits_remaining,
  });
}
