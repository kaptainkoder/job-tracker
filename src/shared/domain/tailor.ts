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

// Explicit .js specifiers are required when this module is emitted into Vercel's Node ESM
// function bundle. TypeScript maps them back to the .ts sources during local builds.
import type { ChatMessage } from './llm.js';
import type { PrivacyCategory } from './privacy.js';
import { skillLabel, type SkillId } from './gap.js';
import type { StructuredResume } from './resume.js';

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

function renderProfile(profile: TailorProfile, includeContactInfo: boolean): string {
  const lines: string[] = [];
  const add = (label: string, v: string | null | undefined) => {
    if (v && v.trim()) lines.push(`${label}: ${v.trim()}`);
  };
  add('Name', profile.fullName);
  add('Current title', profile.currentTitle);
  add('Current company', profile.currentCompany);
  if (includeContactInfo) {
    add('Email', profile.email);
    add('Phone', profile.phone);
    add('LinkedIn', profile.linkedinUrl);
    add('GitHub', profile.githubUrl);
  }
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
    renderProfile(ctx.profile, ctx.action === 'cover'),
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

// ================================================================================================
// B6.2 — Structured, format-faithful tailoring (additive; the prose path above stays live for the
// B3.6 flow + for cover/prep until B6.4 wires this in).
//
// The B6 content-vs-format split (resume.ts) means the tailored *content* is the LLM's domain while
// the *layout* is the deterministic renderer (resumePdf.ts). This section is the content half of
// the `tailor` action: the LLM is fed the StructuredResume and must return a small JSON PATCH that
// only rewords/reorders. Structural facts (employers, titles, dates, locations, awards, education,
// skills, contact) are NEVER taken from the model — `applyTailoredResume` re-stitches them from the
// source, so the model cannot fabricate a role, award, skill, or date even if it tries. The reword
// license covers exactly the summary, experience bullets, and the optional scope line.
// ================================================================================================

// One reworded experience entry. `ref` is the 0-based index into source.experience identifying WHICH
// real role this belongs to — the renderer's structural fields come from that source entry, never
// from the model. `bullets`/`scope` carry the reworded (still-truthful) text.
export interface TailoredExperience {
  ref: number;
  scope?: string;
  bullets: string[];
}

// The model's tailored output: a patch over the structured résumé, not a whole new résumé.
// Only the rewordable surfaces appear; everything omitted stays verbatim from the source.
export interface TailoredResumePatch {
  /** Reworded professional summary (optional — falls back to the source summary). */
  summary?: string;
  /** A reordering of source experience indices to surface JD-relevant roles first. */
  experienceOrder?: number[];
  /** Per-role reworded bullets/scope, keyed by `ref` into source.experience. */
  experience: TailoredExperience[];
}

export interface TailorResumeContext {
  company: string;
  role: string;
  jdText: string;
  /** The confirmed structured résumé — the ONLY truthful source for the tailored output. */
  resume: StructuredResume;
}

// Hard contract for the structured `tailor` action: reword/reorder only, JSON only, no new facts.
const STRUCTURED_TAILOR_SYSTEM = [
  NO_FABRICATION_SYSTEM,
  '',
  'You are given the candidate’s résumé as structured JSON — the ONLY truthful source.',
  'Your job is to REWORD and REORDER existing material toward the target job, in the job’s',
  'vocabulary, WITHOUT adding any fact, skill, employer, title, date, metric, or credential that is',
  'not already present in the source bullet you are rewording. You may rephrase the summary and the',
  'experience bullets, tighten a scope line, drop a bullet that is irrelevant to the job, and reorder',
  'bullets within a role and roles relative to each other to surface the most JD-relevant first.',
  'You may NOT invent a role, award, school, skill, or number. Do not drop a role entirely.',
  '',
  'Return ONLY a single JSON object (no prose, no Markdown, no code fence) of this exact shape:',
  '{',
  '  "summary": "<reworded summary, optional>",',
  '  "experienceOrder": [<source experience indices, most relevant first, optional>],',
  '  "experience": [',
  '    { "ref": <0-based index of a source experience>, "scope": "<reworded scope, optional>",',
  '      "bullets": ["<reworded bullet>", "..."] }',
  '  ]',
  '}',
  'Do NOT include contact, awards, education, projects, or skills — those are kept verbatim from the',
  'source. "ref" must be the index of an existing source experience entry.',
].join('\n');

// Serialize only the rewordable surfaces (summary + indexed experience) so the model knows the refs
// and never sees layout. Contact/awards/education/skills are intentionally withheld — they are
// locked, so there is nothing for the model to do with them.
function renderResumeForTailoring(resume: StructuredResume): string {
  const lines: string[] = [];
  lines.push('Summary:');
  lines.push(resume.summary?.trim() || '(none)');
  lines.push('');
  lines.push('Experience entries (reword by their index; keep every entry):');
  resume.experience.forEach((exp, i) => {
    const dates = [exp.start, exp.end].filter((d) => d && d.trim()).join('–');
    const header = [exp.org, exp.title].filter((v) => v && v.trim()).join(' — ');
    lines.push(`[${i}] ${header}${dates ? ` (${dates})` : ''}`);
    if (exp.scope && exp.scope.trim()) lines.push(`    scope: ${exp.scope.trim()}`);
    for (const bullet of exp.bullets) {
      if (bullet && bullet.trim()) lines.push(`    - ${bullet.trim()}`);
    }
  });
  return lines.join('\n');
}

// Assemble the OpenRouter chat messages for the STRUCTURED tailor action. Mirrors the manifest of
// the prose path (JD + profile/work/skills, no contact-info) but asks for a JSON reword/reorder
// patch instead of free Markdown.
export function buildTailorResumeMessages(ctx: TailorResumeContext): ChatMessage[] {
  const userContent = [
    `Company: ${ctx.company || '(unspecified)'}`,
    `Role: ${ctx.role || '(unspecified)'}`,
    '',
    'Job description:',
    ctx.jdText?.trim() || '(not provided)',
    '',
    'Candidate résumé (structured, the ONLY truthful source — reword/reorder, never go beyond it):',
    renderResumeForTailoring(ctx.resume),
    '',
    'Return the JSON patch described in the system message. Reword toward this job; invent nothing.',
  ].join('\n');

  return [
    { role: 'system', content: STRUCTURED_TAILOR_SYSTEM },
    { role: 'user', content: userContent },
  ];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

// Parse the model's JSON patch tolerantly: strip an optional ```json fence, JSON.parse, and validate
// the shape. Returns null on any malformed input so the caller can fall back to the un-tailored
// source résumé rather than render garbage. Out-of-shape fields are dropped, not coerced.
export function parseTailoredResumePatch(raw: string): TailoredResumePatch | null {
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  if (!text) return null;
  // Strip a Markdown code fence if the model wrapped the JSON despite the instruction.
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fence) text = fence[1].trim();
  // If there is leading/trailing prose, isolate the outermost JSON object.
  if (!text.startsWith('{')) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    text = text.slice(start, end + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.experience)) return null;
  const experience: TailoredExperience[] = [];
  for (const item of obj.experience) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    if (typeof e.ref !== 'number' || !Number.isInteger(e.ref) || e.ref < 0) continue;
    if (!isStringArray(e.bullets)) continue;
    const entry: TailoredExperience = { ref: e.ref, bullets: e.bullets };
    if (typeof e.scope === 'string') entry.scope = e.scope;
    experience.push(entry);
  }

  const patch: TailoredResumePatch = { experience };
  if (typeof obj.summary === 'string') patch.summary = obj.summary;
  if (Array.isArray(obj.experienceOrder) && obj.experienceOrder.every((n) => typeof n === 'number' && Number.isInteger(n))) {
    patch.experienceOrder = obj.experienceOrder as number[];
  }
  return patch;
}

// Re-stitch a tailored patch onto the structured source, producing a new StructuredResume that the
// deterministic renderer (createStructuredResumePdf) can draw. The truthfulness guarantee lives
// HERE, not in the prompt: every structural fact (contact, awards, projects, education, skills, and
// each experience entry's org/orgDetail/location/title/start/end) comes from `source`; the model can
// only influence the summary text, each role's bullet wording/order, the scope line, and the order
// of roles. An out-of-range `ref` or a non-permutation `experienceOrder` is ignored, and no role is
// ever dropped (a role with no reworded bullets keeps its source bullets).
export function applyTailoredResume(source: StructuredResume, patch: TailoredResumePatch): StructuredResume {
  const total = source.experience.length;

  // Last write wins for a given ref; ignore refs outside the source range.
  const byRef = new Map<number, TailoredExperience>();
  for (const e of patch.experience) {
    if (e.ref >= 0 && e.ref < total) byRef.set(e.ref, e);
  }

  // Build the final order: take valid, unique, in-range indices from experienceOrder, then append
  // any source roles the model omitted (so a role is never silently dropped) in their original order.
  const order: number[] = [];
  const seen = new Set<number>();
  for (const idx of patch.experienceOrder ?? []) {
    if (Number.isInteger(idx) && idx >= 0 && idx < total && !seen.has(idx)) {
      order.push(idx);
      seen.add(idx);
    }
  }
  for (let i = 0; i < total; i++) {
    if (!seen.has(i)) order.push(i);
  }

  const experience = order.map((i) => {
    const src = source.experience[i];
    const reworded = byRef.get(i);
    const bullets = reworded
      ? reworded.bullets.map((b) => b.trim()).filter(Boolean)
      : src.bullets;
    return {
      ...src,
      // Reword license: bullets, scope (only when provided + non-empty). Structure stays from source.
      bullets: bullets.length ? bullets : src.bullets,
      scope:
        reworded && typeof reworded.scope === 'string' && reworded.scope.trim()
          ? reworded.scope.trim()
          : src.scope,
    };
  });

  const summary =
    typeof patch.summary === 'string' && patch.summary.trim() ? patch.summary.trim() : source.summary;

  // Everything except summary + experience is locked verbatim from the source.
  return {
    contact: source.contact,
    summary,
    awards: source.awards,
    experience,
    projects: source.projects,
    education: source.education,
    skills: source.skills,
  };
}

// Convenience: parse the model's raw output and apply it, falling back to the un-tailored source
// when the patch is unusable. Always returns a renderable StructuredResume (createStructuredResumePdf
// input), so the format-faithful download path never breaks on a bad model response.
export function tailorStructuredResume(source: StructuredResume, raw: string): StructuredResume {
  const patch = parseTailoredResumePatch(raw);
  return patch ? applyTailoredResume(source, patch) : source;
}
