-- 0005_artifacts.sql — Wave B (B3): the home for generated tailor output.
--
-- One row per generated document (tailored résumé / cover letter / interview prep), owner-scoped
-- and linked to an application. The deferred `outcomes.artifact_id` (from 0001) is wired to this
-- table now that it exists, so a logged outcome can point at the exact document that was sent.
--
-- The server never writes here — generation streams through api/llm.ts, and the browser persists
-- the finished artifact via RLS (CRUD stays client-side). The privacy_log already records the
-- manifest + hash + cost of the call; this table stores the produced content.
--
-- Apply: programmatically via SUPABASE_DB_URL (docs/RUNBOOK.md §5b) or SQL Editor paste.
-- Idempotent: safe to re-run.

create table if not exists public.artifacts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  kind           text not null check (kind in ('tailored-resume','cover-letter','prep')),
  content        text not null,
  model          text,
  created_at     timestamptz not null default now()
);

create index if not exists artifacts_application_id_idx on public.artifacts (application_id);
create index if not exists artifacts_user_id_idx        on public.artifacts (user_id);

alter table public.artifacts enable row level security;

-- Owner-only, every command (mirrors the 0001 policy pattern). Drop-then-create keeps it idempotent.
drop policy if exists "own artifacts" on public.artifacts;
create policy "own artifacts" on public.artifacts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Wire the deferred FK from outcomes.artifact_id now that artifacts exists. `add constraint if not
-- exists` is not valid Postgres, so guard on pg_constraint to stay idempotent.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'outcomes_artifact_id_fkey'
  ) then
    alter table public.outcomes
      add constraint outcomes_artifact_id_fkey
      foreign key (artifact_id) references public.artifacts (id) on delete set null;
  end if;
end $$;
