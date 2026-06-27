-- 0002_privacy_log_model.sql — record which LLM model each outbound call used.
--
-- Additive and safe: a single nullable column on privacy_log. Existing rows (there are
-- none until Wave B) get NULL. Mirrors src/shared/types/index.ts (PrivacyLogEntry.model).
--
-- Apply: Supabase Dashboard → SQL Editor → paste → Run (or `supabase db push` if linked).

alter table public.privacy_log
  add column if not exists model text;  -- e.g. 'anthropic/claude-sonnet-4-6'
