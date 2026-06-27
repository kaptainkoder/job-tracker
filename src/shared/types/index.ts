// Environment-neutral domain types shared by the browser app and api/ functions.
// Mirrors the Supabase schema (supabase/migrations). Keep in sync with the DB.

export type Stage = 'lead' | 'applied' | 'interviewing' | 'offer' | 'rejected';

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
  updated_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  company: string;
  role: string;
  stage: Stage;
  source: string | null; // e.g. 'paste-jd', 'inmail', 'lead-form'
  job_url: string | null;
  jd_text: string | null;
  // Salary is nullable on purpose: null renders as "unspecified", never a guess.
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
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

export interface PrivacyLogEntry {
  id: string;
  user_id: string;
  application_id: string | null;
  target: 'openrouter' | 'enhancecv';
  action: string; // 'tailor-resume' | 'cover-letter' | 'prep-questions' | ...
  // What categories of data were sent + what was withheld (plain-English manifest).
  sent_manifest: string[];
  withheld_manifest: string[];
  // Hash of the exact payload (integrity proof) — we do NOT store the payload itself.
  payload_sha256: string;
  cost_usd: number | null;
  created_at: string;
}
