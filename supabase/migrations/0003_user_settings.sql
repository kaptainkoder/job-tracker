-- 0003_user_settings.sql — Wave B (B0): per-user LLM + privacy settings.
--
-- Exactly one row per auth user (the PK *is* the user id, like `profile`). Holds the
-- user-swappable model choice and the no-log / zero-retention provider preference. The
-- OpenRouter *key* is deliberately NOT stored here — it stays a server-side env secret
-- (single-user posture; flip to encrypted per-user only if multi-user ever lands).
-- Mirrors src/shared/types/index.ts (UserSettings). Additive + RLS-locked from creation.
--
-- (Wave B's `artifacts` table lands in its own migration with B3, when generated output
-- needs a home — kept out of B0 so each migration ships with the chunk that needs it.)
--
-- Apply: programmatically via SUPABASE_DB_URL (docs/RUNBOOK.md §5b) or SQL Editor paste.
-- Idempotent: safe to re-run.

create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  model      text not null default 'anthropic/claude-sonnet-4-6',
  no_log     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reuse the set_updated_at() trigger function created in 0001.
drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;

drop policy if exists "own user_settings" on public.user_settings;
create policy "own user_settings" on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
