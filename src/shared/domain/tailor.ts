// Tailor engine core (Wave B · B3). Pure, environment-neutral domain shared by the browser tailor
// flow and the api/llm function. No network, no Supabase — just:
//   1. action vocabulary  — the three generated outputs + their privacy-log action slugs.
//   2. tailorIncludedCategories — which privacy categories a payload carries (drives B1 gate/audit).
//   3. buildTailorMessages — assemble the OpenRouter chat messages with a hard no-fabrication
//      contract: only the profile + B2-confirmed truthful additions may be claimed; declined gaps
//      are passed as "do NOT claim" growth notes, never as experience.
//
// The posture (locked decision "No fabrication = gap-interview" + the privacy posture): nothing is
// invented, and the manifest of what leaves the device is always derivable from the context.

import type { ChatMessage } from './llm';
import type { PrivacyCategory } from './privacy';
import { skillLabel, type SkillId } from './gap';

export type TailorAction = 'tailor' | 'cover' | 'prep';
export const TAILOR_ACTIONS: readonly TailorAction[] = ['tailor', 'cover', 'prep'];

// Human labels for the UI.
export const TAILOR_ACTION_LABEL: Record<TailorAction, string> = {
  tailor: 'Tailored résumé',
  cover: 'Cover letter',
  prep: 'Interview prep',
};

// The privacy_log `action` slug per tailor action (matches the PrivacyLogEntry comment vocabulary).
export const TAILOR_PRIVACY_ACTION: Record<TailorAction, string> = {
  tailor: 'tailor-resume',
  cover: 'cover-letter',
  prep: 'prep-questions',
};

export function isTailorAction(value: unknown): value is TailorAction {
  return typeof value === 'string' && (TAILOR_ACTIONS as readonly string[]).includes(value);
}

// The profile substance the tailor may use. Kept to what `profile` actually holds — B3 does NOT
// pull the base-résumé file text (see plan "Out of scope"), so `resume`/`education`/`salary` are
// not sent. All fields optional; null/empty stays unspecified, never guessed.
export interface TailorProfile {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  currentTitle?: string | null;
  currentCompany?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  /** Truthful, user-evidenced skills (raw surface strings from the profile editor). */
  skills: readonly string[];
}

export interface TailorContext {
  action: TailorAction;
  company: string;
  role: string;
  jdText: string;
  profile: TailorProfile;
  /** B2 foldResolutions().truthfulAdditions — confirmed + evidenced gaps; safe to claim. */
  truthfulAdditions?: readonly { skill: SkillId; evidence: string }[];
  /** B2 foldResolutions().futureSuggestions — declined/unbacked gaps; NEVER claim, growth-only. */
  futureSuggestions?: readonly SkillId[];
}

// Which canonical privacy categories a tailor payload carries → drives the B1 pre-flight manifest
// and the audit row. Cover letters carry contact details (name/email/phone in the letterhead), so
// they add `contact-info` — which makes every cover call re-trigger the gate (full-PII), as locked.
export function tailorIncludedCategories(ctx: TailorContext): PrivacyCategory[] {
  const categories: PrivacyCategory[] = ['job-description', 'profile-summary', 'work-history', 'skills'];
  if (ctx.action === 'cover') categories.push('contact-info');
  return categories;
}

const NO_FABRICATION_SYSTEM = [
  'You are a careful résumé and job-application writer for a single candidate.',
  'Absolute rule: never invent, embellish, or claim any skill, role, employer, title, date, metric,',
  'or credential that is not present in the candidate profile or the explicitly-confirmed truthful',
  'additions below. If the job wants something the candidate cannot evidence, do NOT claim it — at',
  'most note it honestly as a future-growth area. Unknown details stay "unspecified"; never guess.',
  'Write in plain, concrete, honest language.',
].join(' ');

const TAILOR_TASK: Record<TailorAction, string> = {
  tailor:
    'Task: produce a tailored résumé in clean Markdown, reordering and emphasising the candidate’s ' +
    'real experience and skills toward this role. Use only truthful material above. Do not fabricate.',
  cover:
    'Task: write a concise, specific cover letter (3–4 short paragraphs) connecting the candidate’s ' +
    'real experience to this role. Honest and warm, no clichés, no invented achievements.',
  prep:
    'Task: produce interview prep — the most likely questions for this role and honest talking ' +
    'points grounded only in the candidate’s real experience. Flag genuine gaps as areas to study, ' +
    'never as things to claim.',
};

function renderProfile(profile: TailorProfile): string {
  const lines: string[] = [];
  const add = (label: string, v: string | null | undefined) => {
    if (v && v.trim()) lines.push(`${label}: ${v.trim()}`);
  };
  add('Name', profile.fullName);
  add('Current title', profile.currentTitle);
  add('Current company', profile.currentCompany);
  add('Email', profile.email);
  add('Phone', profile.phone);
  add('LinkedIn', profile.linkedinUrl);
  add('GitHub', profile.githubUrl);
  const skills = profile.skills.map((s) => s.trim()).filter(Boolean);
  lines.push(`Skills (evidenced): ${skills.length ? skills.join(', ') : '(none listed)'}`);
  return lines.join('\n');
}

// Assemble the OpenRouter chat messages for a tailor/cover/prep call. The system message carries the
// no-fabrication contract; the user message carries JD + profile + the two B2 resolution buckets,
// with future-suggestions explicitly fenced under a "do NOT claim" heading.
export function buildTailorMessages(ctx: TailorContext): ChatMessage[] {
  const additions =
    (ctx.truthfulAdditions ?? [])
      .map((a) => `- ${skillLabel(a.skill)}: ${a.evidence}`)
      .join('\n') || '(none)';
  const suggestions =
    (ctx.futureSuggestions ?? []).map((s) => skillLabel(s)).join(', ') || '(none)';

  const userContent = [
    `Company: ${ctx.company || '(unspecified)'}`,
    `Role: ${ctx.role || '(unspecified)'}`,
    '',
    'Job description:',
    ctx.jdText?.trim() || '(not provided)',
    '',
    'Candidate profile (the ONLY truthful source — do not go beyond it):',
    renderProfile(ctx.profile),
    '',
    'Confirmed truthful additions (backed by the candidate’s own evidence — safe to use):',
    additions,
    '',
    'Do NOT claim these — the candidate could not evidence them; mention only as honest future growth, never as experience:',
    suggestions,
    '',
    TAILOR_TASK[ctx.action],
  ].join('\n');

  return [
    { role: 'system', content: NO_FABRICATION_SYSTEM },
    { role: 'user', content: userContent },
  ];
}
