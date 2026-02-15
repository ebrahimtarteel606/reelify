import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getAdminSecret } from "../../../../lib/supabase";

async function authorized(request: NextRequest): Promise<boolean> {
  const secret = await getAdminSecret();
  if (!secret) return false;
  const header = request.headers.get("x-admin-secret");
  return header === secret;
}

// GET /api/admin/users – list all users with aggregated usage
export async function GET(request: NextRequest) {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // Fetch all users
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  // Fetch aggregated usage per user
  const { data: usage, error: usageError } = await supabase
    .from("usage_events")
    .select("user_id, source_duration_minutes, credits_charged, created_at");

  if (usageError) {
    return NextResponse.json({ error: usageError.message }, { status: 500 });
  }

  // Aggregate usage per user
  const usageMap: Record<
    string,
    {
      total_credits_used: number;
      total_duration: number;
      request_count: number;
      last_used: string | null;
    }
  > = {};

  for (const event of usage ?? []) {
    if (!usageMap[event.user_id]) {
      usageMap[event.user_id] = {
        total_credits_used: 0,
        total_duration: 0,
        request_count: 0,
        last_used: null,
      };
    }
    const entry = usageMap[event.user_id];
    entry.total_credits_used += event.credits_charged;
    entry.total_duration += event.source_duration_minutes;
    entry.request_count += 1;
    if (!entry.last_used || event.created_at > entry.last_used) {
      entry.last_used = event.created_at;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = (users ?? []).map((u: any) => ({
    ...u,
    usage: usageMap[u.id] ?? {
      total_credits_used: 0,
      total_duration: 0,
      request_count: 0,
      last_used: null,
    },
  }));

  return NextResponse.json({ users: enriched });
}

// POST /api/admin/users – create a new user
export async function POST(request: NextRequest) {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    display_name,
    email,
    phone,
    credits_remaining,
    title,
    company,
    notes,
    priority,
    source,
  } = body;

  if (!display_name || typeof display_name !== "string") {
    return NextResponse.json({ error: "display_name is required" }, { status: 400 });
  }
  if (!email || typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (!phone || typeof phone !== "string" || !phone.trim()) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const insert: Record<string, unknown> = {
    display_name,
    email: email.trim(),
    phone: phone.trim(),
    credits_remaining: credits_remaining ?? 180,
  };
  if (title !== undefined && typeof title === "string") insert.title = title.trim() || null;
  if (company !== undefined && typeof company === "string") insert.company = company.trim() || null;
  if (notes !== undefined && typeof notes === "string") insert.notes = notes.trim() || null;
  if (priority !== undefined && typeof priority === "string") insert.priority = priority.trim() || null;
  if (source !== undefined && typeof source === "string") insert.source = source.trim() || null;

  const { data, error } = await supabase
    .from("users")
    .insert(insert)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data }, { status: 201 });
}

// PATCH /api/admin/users – update a user
export async function PATCH(request: NextRequest) {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Only allow updating specific fields
  const allowed: Record<string, unknown> = {};
  if (updates.display_name !== undefined) allowed.display_name = updates.display_name;
  if (updates.email !== undefined) {
    const v = String(updates.email).trim();
    if (!v) {
      return NextResponse.json({ error: "email cannot be empty" }, { status: 400 });
    }
    allowed.email = v;
  }
  if (updates.phone !== undefined) {
    const v = String(updates.phone).trim();
    if (!v) {
      return NextResponse.json({ error: "phone cannot be empty" }, { status: 400 });
    }
    allowed.phone = v;
  }
  if (updates.credits_remaining !== undefined)
    allowed.credits_remaining = updates.credits_remaining;
  if (updates.title !== undefined) allowed.title = updates.title === "" ? null : String(updates.title).trim();
  if (updates.company !== undefined) allowed.company = updates.company === "" ? null : String(updates.company).trim();
  if (updates.notes !== undefined) allowed.notes = updates.notes === "" ? null : String(updates.notes).trim();
  if (updates.priority !== undefined) allowed.priority = updates.priority === "" ? null : String(updates.priority).trim();
  if (updates.source !== undefined) allowed.source = updates.source === "" ? null : String(updates.source).trim();

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .update(allowed)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}

// DELETE /api/admin/users – delete a user
export async function DELETE(request: NextRequest) {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("users").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
