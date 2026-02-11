import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getAdminSecret } from "../../../../lib/supabase";

async function authorized(request: NextRequest): Promise<boolean> {
  const secret = await getAdminSecret();
  if (!secret) return false;
  const header = request.headers.get("x-admin-secret");
  return header === secret;
}

// GET /api/admin/demo-requests – list all demo requests
export async function GET(request: NextRequest) {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("demo_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ demo_requests: data ?? [] });
}

// PATCH /api/admin/demo-requests – update status of a demo request
export async function PATCH(request: NextRequest) {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, status } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const validStatuses = ["pending", "contacted", "converted", "dismissed"];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("demo_requests")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ demo_request: data });
}

// DELETE /api/admin/demo-requests – delete a demo request
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
  const { error } = await supabase.from("demo_requests").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
