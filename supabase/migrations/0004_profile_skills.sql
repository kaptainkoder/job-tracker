-- 0004_profile_skills.sql — Wave B (B2): the gap-interview evidence source.
--
-- The profile gains a user-editable `skills` list — the truthful set of skills the user can back.
-- It's the "evidenced" side of the B2 gap diff (JD-required skills minus profile-evidenced skills).
-- Stored as the user's raw surface strings (e.g. 'XGBoost', '5 yrs Python'); the lexicon in
-- src/shared/domain/gap.ts normalizes + implication-expands them at diff time, so a line on
-- 'XGBoost' counts as evidence of Python + machine-learning without the DB knowing anything.
--
-- Additive + non-null with a default so every existing row is valid immediately. RLS already
-- covers `profile` from 0001 (own-row policy); no new policy needed.
--
-- Apply: programmatically via SUPABASE_DB_URL (docs/RUNBOOK.md §5b) or SQL Editor paste.
-- Idempotent: safe to re-run.

alter table public.profile
  add column if not exists skills text[] not null default '{}';
