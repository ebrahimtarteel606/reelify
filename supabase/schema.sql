-- =============================================
-- Reelify Credit System Schema  (unit = minutes)
-- =============================================
-- Run this against your Supabase project SQL editor.
--
-- If you already have a users table without email/phone, run first:
--   alter table users add column if not exists email text default '';
--   alter table users add column if not exists phone text default '';
--   update users set email = 'unknown@localhost', phone = '—' where email = '' or phone = '';
--   alter table users alter column email set not null, alter column phone set not null;

-- Users table: managed by admin, holds credits (all in minutes)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  email text not null,
  phone text not null,
  credits_remaining integer not null default 180,  -- total minutes (3 hours default)
  created_at timestamptz not null default now()
);

-- Admin config: dashboard password stored in DB (set via Supabase dashboard or SQL)
create table if not exists admin_config (
  key text primary key,
  value text not null
);

-- Insert default admin secret; change this value in Supabase after first run
insert into admin_config (key, value) values ('dashboard_secret', 'change-me')
  on conflict (key) do nothing;

-- Usage events: one row per processing request (all in minutes)
create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source_duration_minutes integer not null,
  credits_charged integer not null,
  created_at timestamptz not null default now()
);

-- Index for fast per-user lookups
create index if not exists idx_usage_events_user_id on usage_events(user_id);
create index if not exists idx_usage_events_created_at on usage_events(created_at desc);

-- RPC: atomically check credits, charge, and log usage.
-- p_duration_minutes is the video length rounded up to the next whole minute.
-- Max video duration (2 hours) is enforced at the API layer, not here.
-- Returns JSON: { "ok": true } or { "ok": false, "error": "..." }
create or replace function charge_credits(
  p_user_id uuid,
  p_duration_minutes integer
) returns jsonb
language plpgsql
as $$
declare
  v_user users%rowtype;
begin
  -- Lock the user row to prevent race conditions
  select * into v_user from users where id = p_user_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'User not found');
  end if;

  if v_user.credits_remaining < p_duration_minutes then
    return jsonb_build_object(
      'ok', false,
      'error', format('Insufficient credits: need %s min but only %s min remaining', p_duration_minutes, v_user.credits_remaining)
    );
  end if;

  -- Deduct credits
  update users
    set credits_remaining = credits_remaining - p_duration_minutes
    where id = p_user_id;

  -- Log usage event
  insert into usage_events (user_id, source_duration_minutes, credits_charged)
    values (p_user_id, p_duration_minutes, p_duration_minutes);

  return jsonb_build_object('ok', true);
end;
$$;
