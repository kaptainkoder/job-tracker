-- 0006_structured_resume.sql — Wave B (B6.3): the structured résumé source of truth.
--
-- The LLM parses the base PDF once into a StructuredResume (src/shared/domain/resume.ts); Karan
-- reviews/corrects it on the Résumé screen, then saves it here as the confirmed content the tailor
-- engine rewords/reorders over. One row per owner (PK = user_id), so capture is one-time and
-- re-runnable (a new parse overwrites it). `content` is the StructuredResume JSON; `source_filename`
-- records which upload it came from (honesty copy on the review banner); `parsed_at` marks the parse
-- and `confirmed_at` marks the save (null = parsed-but-not-yet-confirmed draft, though the app only
-- writes here on confirm today).
--
-- The server never writes here — parsing streams JSON through api/llm.ts (parse-resume action,
-- no-log + audited), and the browser persists the confirmed StructuredResume via RLS (CRUD stays
-- client-side, like profile + artifacts). The privacy_log already records the parse call's manifest
-- + hash; this table stores only owner-confirmed content.
--
-- Apply: programmatically via SUPABASE_DB_URL (docs/RUNBOOK.md §5b) or SQL Editor paste.
-- Idempotent: safe to re-run.

create table if not exists public.resume_structured (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  content         jsonb not null,
  source_filename text,
  parsed_at       timestamptz not null default now(),
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.resume_structured enable row level security;

-- Owner-only, every command (mirrors the 0001/0005 policy pattern). Drop-then-create stays idempotent.
drop policy if exists "own resume_structured" on public.resume_structured;
create policy "own resume_structured" on public.resume_structured
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Keep updated_at honest on every write (reuse the shared trigger fn from 0001 if present; define a
-- local one otherwise so this migration is self-contained).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists resume_structured_set_updated_at on public.resume_structured;
create trigger resume_structured_set_updated_at
  before update on public.resume_structured
  for each row execute function public.set_updated_at();
