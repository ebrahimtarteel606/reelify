import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, phone, help_text, locale } = body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!email || typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  if (!phone || typeof phone !== "string" || !phone.trim()) {
    return NextResponse.json({ error: "Phone is required" }, { status: 400 });
  }
  if (!help_text || typeof help_text !== "string" || !help_text.trim()) {
    return NextResponse.json({ error: "Help text is required" }, { status: 400 });
  }

  const emailValue = email.trim();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
  if (!isValidEmail) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("demo_requests").insert({
    name: name.trim(),
    email: emailValue,
    phone: phone.trim(),
    help_text: help_text.trim(),
    locale: typeof locale === "string" ? locale : null,
    status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
