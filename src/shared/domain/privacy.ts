// Privacy core (Wave B · B1). Pure, environment-neutral domain shared by the browser pre-flight
// gate and the api/llm audit write. No network, no Supabase — just the egress contract:
//   1. buildManifest        — what categories of data a call WILL send vs. deliberately withhold.
//   2. payloadHash          — a deterministic SHA-256 of the exact payload (integrity proof).
//   3. requiresPreflight    — when the approve-before-send gate must fire.
//   4. buildPrivacyLogRow   — shape one privacy_log audit row (the payload itself is never stored).
//
// The locked posture (see brainstorm Wave B): no external call ships un-gated, and none un-logged.

export type PrivacyTarget = 'openrouter' | 'enhancecv';

// The fixed vocabulary of data categories we reason about. Ordering here is canonical — manifests
// render in this order so SENT / WITHHELD lists are stable and comparable across calls.
export const PRIVACY_CATEGORIES = [
  'job-description',
  'profile-summary',
  'work-history',
  'skills',
  'education',
  'resume',
  'contact-info',
  'salary',
] as const;

export type PrivacyCategory = (typeof PRIVACY_CATEGORIES)[number];

// Plain-English labels for the UI + the persisted audit row (so the Privacy Log reads like prose).
export const PRIVACY_CATEGORY_LABEL: Record<PrivacyCategory, string> = {
  'job-description': 'Job description',
  'profile-summary': 'Profile summary',
  'work-history': 'Work history',
  skills: 'Skills',
  education: 'Education',
  resume: 'Résumé content',
  'contact-info': 'Contact details',
  salary: 'Salary expectations',
};

// Categories that, when sent, make a call "full-PII / resume-bearing" — these always re-trigger the
// pre-flight gate, even on a repeat of an already-approved (target, action) pair.
const FULL_PII_CATEGORIES: readonly PrivacyCategory[] = ['resume', 'contact-info'];

export interface PrivacyManifest {
  sent: PrivacyCategory[];
  withheld: PrivacyCategory[];
}

// Build the sent/withheld manifest. `included` is what the assembled payload actually carries;
// everything in the canonical vocabulary that is NOT included is reported as explicitly withheld,
// so the "what is NOT sent" list is always complete (never an empty reassurance).
export function buildManifest(included: readonly PrivacyCategory[]): PrivacyManifest {
  const includedSet = new Set(included);
  const sent = PRIVACY_CATEGORIES.filter((category) => includedSet.has(category));
  const withheld = PRIVACY_CATEGORIES.filter((category) => !includedSet.has(category));
  return { sent, withheld };
}

// Stable key for an outbound call type. First-of-type gating is per (target, action) pair.
export function preflightKey(target: PrivacyTarget, action: string): string {
  return `${target}:${action}`;
}

export interface PreflightInput {
  target: PrivacyTarget;
  action: string;
  manifest: PrivacyManifest;
  /** (target, action) pairs already approved this session, via preflightKey(). */
  approvedKeys: readonly string[];
}

// The gate fires when the call is the FIRST of its (target, action) type this session, OR whenever
// it carries full-PII / résumé content (those re-prompt every time, regardless of prior approval).
export function requiresPreflight(input: PreflightInput): boolean {
  const carriesFullPII = input.manifest.sent.some((category) =>
    FULL_PII_CATEGORIES.includes(category),
  );
  if (carriesFullPII) return true;
  return !input.approvedKeys.includes(preflightKey(input.target, input.action));
}

// --- Payload hashing -------------------------------------------------------------------------
// We never store the payload; we store a SHA-256 of it as an integrity proof. The hash must be
// deterministic and independent of object key order, so we canonicalize first (sort object keys
// recursively; arrays keep their order since order is meaningful in a message list).

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortDeep((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

// SHA-256 hex of the canonical payload. Uses Web Crypto (available in the browser and Node ≥18),
// so this stays environment-neutral. Async because crypto.subtle.digest is async.
export async function payloadHash(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- Audit row -------------------------------------------------------------------------------
// Shape (but do not persist) one privacy_log row. Manifests are stored as plain-English labels so
// the Privacy Log screen reads without a lookup table. id/created_at are DB-generated.

export interface AuditInput {
  userId: string;
  applicationId?: string | null;
  target: PrivacyTarget;
  action: string;
  model: string | null;
  manifest: PrivacyManifest;
  payloadSha256: string;
  costUsd?: number | null;
}

export interface PrivacyLogInsert {
  user_id: string;
  application_id: string | null;
  target: PrivacyTarget;
  action: string;
  model: string | null;
  sent_manifest: string[];
  withheld_manifest: string[];
  payload_sha256: string;
  cost_usd: number | null;
}

export function buildPrivacyLogRow(input: AuditInput): PrivacyLogInsert {
  return {
    user_id: input.userId,
    application_id: input.applicationId ?? null,
    target: input.target,
    action: input.action,
    model: input.model,
    sent_manifest: input.manifest.sent.map((category) => PRIVACY_CATEGORY_LABEL[category]),
    withheld_manifest: input.manifest.withheld.map((category) => PRIVACY_CATEGORY_LABEL[category]),
    payload_sha256: input.payloadSha256,
    cost_usd: input.costUsd ?? null,
  };
}
