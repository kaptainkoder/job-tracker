// Environment-neutral domain types shared by the browser app and api/ functions.
// Mirrors the Supabase schema (supabase/migrations). Keep in sync with the DB.

export type Stage = 'lead' | 'applied' | 'interviewing' | 'offer' | 'rejected';
export type Priority = 'low' | 'medium' | 'high';
export type WorkMode = 'remote' | 'hybrid' | 'onsite';
export type SalaryPeriod = 'year' | 'month' | 'hour';

export interface Profile {
  id: string; // = auth user id
  full_name: string | null;
  email: string | null;
  phone: string | null;
  current_title: string | null;
  current_company: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  resume_path: string | null; // Supabase storage path to the base resume
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  company: string;
  role: string;
  stage: Stage;
  priority: Priority; // default 'medium'
  source: string | null; // e.g. 'paste-jd', 'inmail', 'lead-form'
  job_url: string | null;
  jd_text: string | null;
  job_location: string | null;
  work_mode: WorkMode | null;
  employment_type: string | null; // 'full-time' | 'part-time' | 'contract' | 'internship'
  // Salary is nullable on purpose: null renders as "unspecified", never a guess.
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: SalaryPeriod | null;
  contact_name: string | null;
  contact_email: string | null;
  date_applied: string | null; // set when stage first reaches 'applied'
  deadline: string | null; // application deadline, if known
  next_action_date: string | null; // drives follow-up reminders (web-push, later)
  notes: string | null;
  created_at: string;
  last_activity_at: string; // drives the stale-but-active surfacing
}

export interface InterviewEvent {
  id: string;
  application_id: string;
  user_id: string;
  scheduled_at: string; // ISO timestamp (store UTC; render in local tz)
  timezone: string; // IANA tz the interview is in, e.g. "Asia/Kolkata"
  kind: string | null; // 'phone' | 'onsite' | 'technical' | ...
  notes: string | null;
}

export type OutcomeKind = 'callback' | 'rejected' | 'offer' | 'ghosted' | 'withdrew';

export interface Outcome {
  id: string;
  application_id: string;
  user_id: string;
  kind: OutcomeKind;
  // artifact_id links to the sent resume/cover letter — populated from Wave B.
  artifact_id: string | null;
  occurred_at: string;
  notes: string | null;
}

export interface UserSettings {
  user_id: string; // = auth user id (PK)
  model: string; // OpenRouter model id, e.g. 'anthropic/claude-sonnet-4-6' (user-swappable)
  no_log: boolean; // request zero-retention / no-log provider routing (default true)
  created_at: string;
  updated_at: string;
}

export interface PrivacyLogEntry {
  id: string;
  user_id: string;
  application_id: string | null;
  target: 'openrouter' | 'enhancecv';
  action: string; // 'tailor-resume' | 'cover-letter' | 'prep-questions' | ...
  model: string | null; // LLM model used (e.g. 'anthropic/claude-sonnet-4-6'); added in 0002
  // What categories of data were sent + what was withheld (plain-English manifest).
  sent_manifest: string[];
  withheld_manifest: string[];
  // Hash of the exact payload (integrity proof) — we do NOT store the payload itself.
  payload_sha256: string;
  cost_usd: number | null;
  created_at: string;
}
