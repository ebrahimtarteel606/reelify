import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service-role key.
 * NEVER expose this in client bundles.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variables",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// ── Type helpers ──────────────────────────────────────────────

export interface CreditUser {
  id: string;
  display_name: string;
  email: string;
  phone: string;
  credits_remaining: number;
  created_at: string;
}

/** Fetch the admin dashboard secret from the database. Returns null if not set. */
export async function getAdminSecret(): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("admin_config")
    .select("value")
    .eq("key", "dashboard_secret")
    .single();
  if (error || !data?.value) return null;
  return data.value as string;
}

export interface UsageEvent {
  id: string;
  user_id: string;
  source_duration_minutes: number;
  credits_charged: number;
  created_at: string;
}

// ── Credit helpers ────────────────────────────────────────────

/** Fetch a single user by ID. Returns null if not found. */
export async function getUserById(
  userId: string,
): Promise<CreditUser | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
  return data as CreditUser;
}

/**
 * Atomically check limits + deduct credits via the DB function.
 * Accepts duration in **seconds** (from the client) and converts
 * to minutes (rounded up) before calling the DB.
 * Returns { ok: true } or { ok: false, error: string }.
 */
export async function chargeCredits(
  userId: string,
  durationSeconds: number,
): Promise<{ ok: boolean; error?: string }> {
  const durationMinutes = Math.ceil(durationSeconds / 60);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("charge_credits", {
    p_user_id: userId,
    p_duration_minutes: durationMinutes,
  });

  if (error) {
    console.error("[Credits] RPC error:", error);
    return { ok: false, error: error.message };
  }

  return data as { ok: boolean; error?: string };
}
