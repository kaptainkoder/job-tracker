-- 0001_init.sql — Job Tracker initial schema.
--
-- Single-user-now / multi-user-ready: every table is user-scoped and RLS-locked from
-- day one (the "flip-on-signups" decision), so adding users later is a config change,
-- not a rearchitecture. Mirrors src/shared/types/index.ts — keep the two in sync.
--
-- Apply: Supabase Dashboard → SQL Editor → paste this file → Run
--   (or `supabase db push` if the project gets CLI-linked). See docs/RUNBOOK.md.

-- gen_random_uuid() lives in pgcrypto (preinstalled on Supabase, but be explicit).
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at auto-bump trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profile — exactly one row per auth user (the PK *is* the user id)
-- ---------------------------------------------------------------------------
create table public.profile (
  id               uuid primary key references auth.users (id) on delete cascade,
  full_name        text,
  email            text,
  phone            text,
  current_title    text,
  current_company  text,
  linkedin_url     text,
  github_url       text,
  resume_path      text,           -- path within the 'resumes' storage bucket
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger profile_set_updated_at
  before update on public.profile
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- applications — same company + 2 roles = 2 rows (no uniqueness on company)
-- ---------------------------------------------------------------------------
create table public.applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  company          text not null,
  role             text not null,
  stage            text not null default 'lead'
                     check (stage in ('lead','applied','interviewing','offer','rejected')),
  priority         text not null default 'medium'
                     check (priority in ('low','medium','high')),
  source           text,           -- 'paste-jd' | 'inmail' | 'lead-form' | ...
  job_url          text,
  jd_text          text,
  job_location     text,
  work_mode        text check (work_mode in ('remote','hybrid','onsite')),
  employment_type  text,           -- 'full-time'|'part-time'|'contract'|'internship' (free text)
  -- Salary is nullable on purpose: null renders "unspecified", never a guess.
  salary_min       numeric,
  salary_max       numeric,
  salary_currency  text,
  salary_period    text check (salary_period in ('year','month','hour')),
  contact_name     text,
  contact_email    text,
  date_applied     date,           -- set when stage first reaches 'applied'
  deadline         date,           -- application deadline, if known
  next_action_date date,           -- drives follow-up reminders (web-push, later)
  notes            text,
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now()  -- drives stale-but-active surfacing
);
create index applications_user_id_idx    on public.applications (user_id);
create index applications_user_stage_idx on public.applications (user_id, stage);

-- ---------------------------------------------------------------------------
-- interview_events — store scheduled_at in UTC; render in `timezone`
-- ---------------------------------------------------------------------------
create table public.interview_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  scheduled_at   timestamptz not null,
  timezone       text not null,    -- IANA tz, e.g. 'Asia/Kolkata'
  kind           text,             -- 'phone' | 'onsite' | 'technical' | ...
  notes          text,
  created_at     timestamptz not null default now()
);
create index interview_events_application_id_idx on public.interview_events (application_id);
create index interview_events_user_id_idx        on public.interview_events (user_id);

-- ---------------------------------------------------------------------------
-- outcomes — outcome-loop log (artifact_id wired in Wave B)
-- ---------------------------------------------------------------------------
create table public.outcomes (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  kind           text not null
                   check (kind in ('callback','rejected','offer','ghosted','withdrew')),
  artifact_id    uuid,             -- links to the sent resume/cover letter (Wave B); nullable
  occurred_at    timestamptz not null default now(),
  notes          text,
  created_at     timestamptz not null default now()
);
create index outcomes_application_id_idx on public.outcomes (application_id);
create index outcomes_user_id_idx        on public.outcomes (user_id);

-- ---------------------------------------------------------------------------
-- privacy_log — outbound-call ledger shell (manifest + hash, NOT the payload).
-- Empty until Wave B; columns exist now so the screen has a table to read.
-- ---------------------------------------------------------------------------
create table public.privacy_log (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  application_id   uuid references public.applications (id) on delete set null,
  target           text not null check (target in ('openrouter','enhancecv')),
  action           text not null,   -- 'tailor-resume' | 'cover-letter' | 'prep-questions' | ...
  sent_manifest    text[] not null default '{}',  -- plain-English categories sent
  withheld_manifest text[] not null default '{}', -- categories deliberately withheld
  payload_sha256   text not null,   -- integrity proof; the payload itself is never stored
  cost_usd         numeric,
  created_at       timestamptz not null default now()
);
create index privacy_log_user_id_idx on public.privacy_log (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — owner-only, every table, every command.
-- profile keys on id (= auth user id); all others key on user_id.
-- ---------------------------------------------------------------------------
alter table public.profile          enable row level security;
alter table public.applications     enable row level security;
alter table public.interview_events enable row level security;
alter table public.outcomes         enable row level security;
alter table public.privacy_log      enable row level security;

create policy "own profile" on public.profile
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "own applications" on public.applications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own interview_events" on public.interview_events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own outcomes" on public.outcomes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own privacy_log" on public.privacy_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Resume storage bucket — private; each user can touch only files under a
-- top-level folder named by their uid, e.g. `<uid>/base-resume.pdf`.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('resumes', 'resumes', false)
  on conflict (id) do nothing;

create policy "own resumes read" on storage.objects
  for select using (
    bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own resumes insert" on storage.objects
  for insert with check (
    bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own resumes update" on storage.objects
  for update using (
    bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own resumes delete" on storage.objects
  for delete using (
    bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text
  );
