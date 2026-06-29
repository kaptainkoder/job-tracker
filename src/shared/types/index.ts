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
  // Truthful, user-editable skill lines — the "evidenced" side of the B2 gap-interview diff.
  // Stored as the user's raw surface strings; gap.ts normalizes + implication-expands at diff time.
  skills: string[];
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

// Generated tailor output (Wave B · B3). One row per generated document; linked to an application
// and (via outcomes.artifact_id) optionally to the outcome it was sent with. Mirrors 0005_artifacts.sql.
export type ArtifactKind = 'tailored-resume' | 'cover-letter' | 'prep';

export interface Artifact {
  id: string;
  user_id: string;
  application_id: string;
  kind: ArtifactKind;
  content: string; // generated markdown / text
  model: string | null; // OpenRouter model that produced it
  created_at: string;
}

// The structured résumé source of truth (Wave B · B6.3). One row per owner (PK = user_id); mirrors
// 0006_structured_resume.sql. `content` is a StructuredResume (src/shared/domain/resume.ts) parsed
// once from the base PDF, reviewed/corrected by the owner, then saved here for the tailor engine to
// reword/reorder over. confirmed_at is set when the owner saves (vs. a parsed-but-unconfirmed draft).
export interface ResumeStructuredRecord {
  user_id: string; // = auth user id (PK)
  content: import('../domain/resume').StructuredResume;
  source_filename: string | null; // upload the parse came from, e.g. 'base-resume.pdf'
  parsed_at: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
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
