import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getAdminSecret } from "../../../../lib/supabase";

async function authorized(request: NextRequest): Promise<boolean> {
  const secret = await getAdminSecret();
  if (!secret) return false;
  const header = request.headers.get("x-admin-secret");
  return header === secret;
}

// GET /api/admin/usage?user_id=xxx – list usage events (optionally filtered)
export async function GET(request: NextRequest) {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("usage_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}
