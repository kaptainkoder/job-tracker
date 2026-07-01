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
import { skillLabel, type GapResult, type SkillId } from './gap.js';
import {
  buildStructuredResumeDocument,
  flattenResumeText,
  type ResumeSkillGroup,
  type StructuredResume,
} from './resume.js';

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
  /**
   * Per-role reworded bullets/scope, keyed by `ref` into source.experience. Roles are NEVER
   * reordered — the résumé always renders in the source's (reverse-chronological) order; relevance is
   * surfaced by rewording/emphasising bullets, not by moving roles around.
   */
  experience: TailoredExperience[];
}

export interface TailorResumeContext {
  company: string;
  role: string;
  jdText: string;
  /** The confirmed structured résumé — the ONLY truthful source for the tailored output. */
  resume: StructuredResume;
  /**
   * B2 foldResolutions().truthfulAdditions for this run — JD skills the user confirmed AND backed
   * with their own usage evidence (G1). The model MAY surface these as a new Skills entry and, when
   * the evidence describes concrete usage of a specific role, as at most one concise bullet on that
   * role. The evidence text is itself a truthful source; everything else stays reword/reorder-only.
   */
  truthfulAdditions?: readonly { skill: SkillId; evidence: string }[];
  /**
   * G2 adaptive summary: when true the candidate already closely matches this role, so the model is
   * told to keep the summary to at most one crisp line (or omit it) and let the experience bullets
   * take the page; when false/undefined this is an adjacent/stretch move and the summary is kept
   * brief but bridge-explaining. Derived deterministically from computeGap via `isCloseFit`.
   */
  closeFit?: boolean;
}

// Hard contract for the structured `tailor` action: reword/reorder + ground evidence-backed
// additions, JSON only, no new facts beyond the source résumé and the confirmed evidence.
const STRUCTURED_TAILOR_SYSTEM = [
  NO_FABRICATION_SYSTEM,
  '',
  'You are given the candidate’s résumé as structured JSON — the ONLY truthful source, plus an',
  'optional list of CONFIRMED TRUTHFUL ADDITIONS: skills the candidate has confirmed and backed with',
  'their own usage evidence. Your job is to REWORD existing material toward the target job, in the',
  'job’s vocabulary, and to truthfully fold in the confirmed additions, WITHOUT adding any fact,',
  'skill, employer, title, date, metric, or credential that is not already present in the source',
  'résumé OR in a confirmed addition’s evidence.',
  '',
  'Work HOLISTICALLY, not bullet-by-bullet — this is what intelligent rewording means. First read the',
  'WHOLE résumé and the WHOLE job description and understand the candidate’s overall story and what',
  'THIS role values most. Then reshape the content the way a sharp editor would: emphasise the',
  'experience that matters most here, reword in the job’s language, MERGE two overlapping bullets into',
  'one stronger line, or SPLIT one overloaded bullet into two focused single-line bullets when it',
  'carries two distinct results. Keep each role’s bullets coherent as a set, and avoid repeating the',
  'same phrasing across roles. You may rephrase the summary, reword and reorder bullets WITHIN a role,',
  'tighten a scope line, and drop a bullet that is irrelevant to the job. Do NOT reorder roles — the',
  'résumé always stays in the source (reverse-chronological) order. You may NOT invent a role, award,',
  'school, skill, or number, and never drop a role entirely.',
  '',
  'Confirmed truthful additions (when present):',
  '- A confirmed skill may be named in a reworded bullet ONLY when its evidence describes using it.',
  '- You MAY add at most ONE concise bullet to the single MOST RELEVANT existing role to capture a',
  '  confirmed addition, derived ONLY from that addition’s evidence — never invent scope, metric, or',
  '  outcome the evidence does not state. If the evidence is thin, prefer no bullet over a padded one.',
  '- The Skills section itself is added deterministically by the app; do not restate skill lists.',
  '',
  'Hard constraints for the rewording:',
  '- Keep each bullet CONCISE — one short, single-line sentence. Lead with the action + the metric.',
  '  If a result would run long, split it into two focused single-line bullets rather than cramming.',
  '- Reword in the job’s vocabulary, but ONLY by inference grounded in the source bullet or evidence.',
  '  Never name a tool, platform, or domain the candidate has not used (e.g. AWS, Snowflake, Azure,',
  '  Databricks, Hadoop, Kafka, AML) — use only the candidate’s own stack.',
  '- Keep every number EXACTLY as it appears in the source or evidence ($15M stays $15M, 41.25% stays',
  '  41.25%). Never introduce a new number or metric.',
  '- Do not add Markdown emphasis; the renderer bolds key metrics and skills automatically.',
  '',
  'Return ONLY a single JSON object (no prose, no Markdown, no code fence) of this exact shape:',
  '{',
  '  "summary": "<reworded summary, optional>",',
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
  const additions =
    (ctx.truthfulAdditions ?? [])
      .map((a) => `- ${skillLabel(a.skill)}: ${a.evidence}`)
      .join('\n') || '(none)';

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
    'Confirmed truthful additions (skill: the candidate’s own usage evidence — safe to fold in per',
    'the rules above; the evidence text is a truthful source for any bullet you derive from it):',
    additions,
    '',
    ctx.closeFit
      ? 'Summary guidance: the candidate already closely matches this role. Keep the summary to at most ' +
        'one crisp line, or omit it entirely, so the experience bullets get the page.'
      : 'Summary guidance: this is an adjacent/stretch move. Keep a brief 1–2 line summary that honestly ' +
        'bridges the candidate’s real background to this role (transferable strengths), inventing nothing.',
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
  // Any `experienceOrder` a model still emits is intentionally ignored — roles never reorder.
  return patch;
}

// --- B6.4-R grounded truthfulness guard ---------------------------------------------------------
// The structural skeleton was already locked in applyTailoredResume; the gap closed here is the
// free-form reworded TEXT (summary, scope, bullets), which the live recheck showed could smuggle in
// JD-borrowed claims. The policy (decided with Karan, memory/b64r-truthfulness-grounded) is GROUNDED
// inference, NOT literal-word matching: intelligent JD-driven rewording is wanted, so prose is
// default-allowed. Only two things are hard-rejected per unit:
//   (i)  a named FOREIGN tool/domain the candidate has never used (denylist, cross-checked so a
//        listed skill or any corpus word is never denied), and
//   (ii) an INVENTED number (a numeric token whose digit-core is absent from the source).
// On reject, the unit falls back to the source text (a rejected bullet is dropped; a role left with
// no surviving bullets keeps its source bullets). There is NO second LLM call — this is deterministic.

// Foreign tools/domains the candidate does not use. Lowercased; matched whole-word. A term is only a
// reject when it is NOT also present in the candidate's own skills/corpus (see buildAllowedTerms), so
// adding a tool here can never deny something the résumé legitimately contains.
export const FOREIGN_TECH_DENYLIST: readonly string[] = [
  'aws', 'snowflake', 'azure', 'databricks', 'redshift', 'kafka', 'hadoop', 'aml',
  'sagemaker', 'emr', 'athena', 'glue', 'kinesis', 'dynamodb', 'synapse',
];

const NUMERIC_TOKEN = /\d+(?:\.\d+)?/g;

// Normalize a numeric token so "07" and "7", "1.80" and "1.8" compare equal.
function normalizeNumber(token: string): string {
  const n = Number.parseFloat(token);
  return Number.isFinite(n) ? String(n) : token;
}

// Every numeric digit-core present anywhere in the source résumé (e.g. $15M→"15", 41.25%→"41.25",
// 700K→"700", 1.1M→"1.1", 07/2025→"7"/"2025"). A reworded number must be a member of this set.
// `extra` (G1) carries the user's confirmed evidence strings so a number the candidate actually
// supplied (e.g. "cut false positives 30%") is grounded and not rejected as invented.
export function buildResumeNumbers(source: StructuredResume, extra: readonly string[] = []): Set<string> {
  const numbers = new Set<string>();
  const strings = [...flattenResumeText(buildStructuredResumeDocument(source)), ...extra];
  for (const str of strings) {
    for (const match of str.match(NUMERIC_TOKEN) ?? []) numbers.add(normalizeNumber(match));
  }
  return numbers;
}

// Every word that appears anywhere in the source (skills included via the flattened render trace).
// Used to ensure a denylist term that the candidate legitimately uses is never rejected. `extra`
// (G1) adds the confirmed evidence/skill words so an evidence-derived bullet is grounded.
function buildAllowedTerms(source: StructuredResume, extra: readonly string[] = []): Set<string> {
  const allowed = new Set<string>();
  const strings = [...flattenResumeText(buildStructuredResumeDocument(source)), ...extra];
  for (const str of strings) {
    for (const word of str.toLowerCase().split(/[^a-z0-9+#]+/i)) {
      if (word) allowed.add(word);
    }
  }
  return allowed;
}

// The per-unit guard. Returns the text unchanged when it is grounded, or null to reject it.
export function groundReword(text: string, numbers: Set<string>, allowed: Set<string>): string | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  // (i) foreign tool/domain the candidate has never used.
  for (const term of FOREIGN_TECH_DENYLIST) {
    if (allowed.has(term)) continue;
    if (new RegExp(`\\b${term}\\b`, 'i').test(trimmed)) return null;
  }
  // (ii) invented number — any numeric token not present in the source.
  for (const match of trimmed.match(NUMERIC_TOKEN) ?? []) {
    if (!numbers.has(normalizeNumber(match))) return null;
  }
  return text;
}

// Re-stitch a tailored patch onto the structured source, producing a new StructuredResume that the
// deterministic renderer (createStructuredResumePdf) can draw. The truthfulness guarantee lives
// HERE, not in the prompt: every structural fact (contact, awards, projects, education, skills, and
// each experience entry's org/orgDetail/location/title/start/end) comes from `source`; the model can
// only influence the summary text, each role's bullet wording/order, and the scope line. Roles are
// NEVER reordered (source reverse-chronological order is preserved); an out-of-range `ref` is ignored,
// and no role is ever dropped (a role with no reworded bullets keeps its source bullets).
// G1 ingestion options: the user's confirmed truthful additions for this run. `evidence` strings
// extend the grounding corpus (so an evidence-derived bullet's numbers/terms pass groundReword);
// `skills` are the confirmed JD-skill labels, added to the Skills section DETERMINISTICALLY (never
// taken from the model), so a skill is claimed only because the user confirmed and evidenced it.
export interface TailorIngestOptions {
  evidence?: readonly string[];
  skills?: readonly string[];
}

// Append confirmed JD skills the candidate evidenced (G1) into the Skills section, skipping any term
// already present anywhere in skills (case-insensitive). Added to the first existing group, or a new
// unlabelled group when the source had none. Pure; only the user-confirmed labels are ever added.
function mergeConfirmedSkills(skills: ResumeSkillGroup[], confirmed: readonly string[]): ResumeSkillGroup[] {
  const wanted = confirmed.map((s) => s.trim()).filter(Boolean);
  if (!wanted.length) return skills;
  const present = new Set<string>();
  for (const group of skills) for (const item of group.items) present.add(item.trim().toLowerCase());
  const fresh: string[] = [];
  for (const label of wanted) {
    const key = label.toLowerCase();
    if (present.has(key)) continue;
    present.add(key);
    fresh.push(label);
  }
  if (!fresh.length) return skills;
  if (!skills.length) return [{ items: fresh }];
  return skills.map((group, i) => (i === 0 ? { ...group, items: [...group.items, ...fresh] } : group));
}

export function applyTailoredResume(
  source: StructuredResume,
  patch: TailoredResumePatch,
  opts: TailorIngestOptions = {},
): StructuredResume {
  const total = source.experience.length;
  // The grounded text guard (B6.4-R): computed once from the source corpus, extended (G1) with the
  // user's confirmed evidence so an evidence-derived bullet is not falsely rejected as invented.
  const evidenceCorpus = opts.evidence ?? [];
  const numbers = buildResumeNumbers(source, evidenceCorpus);
  const allowed = buildAllowedTerms(source, evidenceCorpus);

  // Last write wins for a given ref; ignore refs outside the source range.
  const byRef = new Map<number, TailoredExperience>();
  for (const e of patch.experience) {
    if (e.ref >= 0 && e.ref < total) byRef.set(e.ref, e);
  }

  // Roles ALWAYS render in the source's (reverse-chronological) order — the model may reword a role's
  // bullets/scope but never move roles relative to each other. Chronology is a hard invariant: a
  // recruiter expects reverse-chronological experience, and relevance is surfaced by wording, not by
  // reordering roles (which previously flipped adjacent same-employer roles and broke the timeline).
  const order = Array.from({ length: total }, (_, i) => i);

  const experience = order.map((i) => {
    const src = source.experience[i];
    const reworded = byRef.get(i);
    // Grounded guard: keep only reworded bullets that pass; drop the rest. If nothing survives the
    // role keeps its source bullets, so a role is never emptied and no fabricated bullet renders.
    const keptBullets = reworded
      ? reworded.bullets
          .map((b) => groundReword(b, numbers, allowed))
          .filter((b): b is string => b !== null)
          .map((b) => b.trim())
          .filter(Boolean)
      : [];
    const rewordedScope =
      reworded && typeof reworded.scope === 'string' && reworded.scope.trim()
        ? groundReword(reworded.scope.trim(), numbers, allowed)
        : null;
    return {
      ...src,
      // Reword license: bullets, scope — only when grounded. Structure stays from source.
      bullets: keptBullets.length ? keptBullets : src.bullets,
      scope: rewordedScope ?? src.scope,
    };
  });

  const rewordedSummary =
    typeof patch.summary === 'string' && patch.summary.trim()
      ? groundReword(patch.summary.trim(), numbers, allowed)
      : null;
  const summary = rewordedSummary ?? source.summary;

  // Everything except summary + experience + (G1) confirmed-skill additions is locked verbatim.
  return {
    contact: source.contact,
    summary,
    awards: source.awards,
    experience,
    projects: source.projects,
    education: source.education,
    skills: mergeConfirmedSkills(source.skills, opts.skills ?? []),
  };
}

// Convenience: parse the model's raw output and apply it, falling back to the un-tailored source
// when the patch is unusable. Always returns a renderable StructuredResume (createStructuredResumePdf
// input), so the format-faithful download path never breaks on a bad model response.
export function tailorStructuredResume(
  source: StructuredResume,
  raw: string,
  opts: TailorIngestOptions = {},
): StructuredResume {
  const patch = parseTailoredResumePatch(raw);
  // Even when the model patch is unusable, still fold in the deterministic confirmed-skill additions
  // so a user who confirmed a JD skill always sees it, independent of the reword/reorder result.
  return applyTailoredResume(source, patch ?? { experience: [] }, opts);
}

// --- G1 focused follow-up -----------------------------------------------------------------------
// One focused follow-up is offered (AC3/G1.3) only when a meaningful number or scope is likely
// RECOVERABLE from the user — i.e. their evidence reads like real usage but carries no quantity yet.
// Declining proceeds factually (no fabricated precision). Heuristic, deterministic, and testable:
// recoverable ⇔ non-empty evidence that contains no numeric token. Evidence that already states a
// number needs no prompt; blank evidence is not a truthful addition at all.
export function evidenceLikelyRecoverable(evidence: string): boolean {
  if (typeof evidence !== 'string') return false;
  const trimmed = evidence.trim();
  if (!trimmed) return false;
  // Non-global digit test — NUMERIC_TOKEN carries /g, whose .test() is stateful (lastIndex).
  return !/\d/.test(trimmed);
}

// --- G3 pre-save tailoring diff -----------------------------------------------------------------
// Before anything is saved or rendered, the user is shown exactly what tailoring changed and can
// restore/edit it. The diff is computed from the two FINAL résumés (source vs applied tailored) so
// it always matches what the preview==download path will render — no separate model trust. Roles are
// matched by their LOCKED structural key (org+title+dates), because applyTailoredResume may reorder
// roles; index matching would misalign. Per matched role we surface the before→after bullet sets,
// from which the UI reads rewrites (changed lines), additions (extra after-lines, e.g. an evidence
// bullet), and omissions (before-lines with no after counterpart). Summary changes and new Skills
// are surfaced separately. `unsupportedJd` carries the JD skills the user could not evidence
// (foldResolutions().futureSuggestions) so the review can show what was deliberately NOT claimed.

export interface TailorRoleDiff {
  /** Structural identity of the role (locked from source), for display + restore keying. */
  org: string;
  title: string;
  before: string[];
  after: string[];
}

export interface TailorDiff {
  summary: { before: string; after: string } | null;
  skillAdditions: string[];
  roles: TailorRoleDiff[];
  /** G2: optional content (awards / projects / skills) present in the source but pruned for
   *  relevance to hold one page. Surfaced so the pruning is transparent and reversible (restore). */
  omittedOptional: string[];
  unsupportedJd: string[];
  /** True when nothing changed — the review can show a calm "no changes" state. */
  unchanged: boolean;
}

function roleKey(exp: { org: string; title: string; start: string; end: string }): string {
  return [exp.org, exp.title, exp.start, exp.end].map((s) => (s ?? '').trim().toLowerCase()).join('|');
}

function lowerSet(items: readonly string[]): Set<string> {
  return new Set(items.map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export function diffTailored(
  source: StructuredResume,
  tailored: StructuredResume,
  opts: { unsupportedJd?: readonly string[] } = {},
): TailorDiff {
  const summary =
    source.summary.trim() !== tailored.summary.trim()
      ? { before: source.summary, after: tailored.summary }
      : null;

  // New Skills items: present in tailored, absent from source (case-insensitive, across all groups).
  const sourceSkills = lowerSet(source.skills.flatMap((g) => g.items));
  const skillAdditions: string[] = [];
  for (const item of tailored.skills.flatMap((g) => g.items)) {
    const key = item.trim().toLowerCase();
    if (key && !sourceSkills.has(key)) skillAdditions.push(item.trim());
  }

  // Per-role before→after, matched by locked structural key; only roles whose bullets changed.
  const tailoredByKey = new Map<string, string[]>();
  for (const exp of tailored.experience) tailoredByKey.set(roleKey(exp), exp.bullets);
  const roles: TailorRoleDiff[] = [];
  for (const src of source.experience) {
    const after = tailoredByKey.get(roleKey(src));
    if (!after) continue; // role always preserved, but guard defensively
    const changed = src.bullets.length !== after.length
      || src.bullets.some((b, i) => b.trim() !== (after[i] ?? '').trim());
    if (changed) roles.push({ org: src.org, title: src.title, before: src.bullets, after });
  }

  // Optional content dropped by G2 relevance pruning: awards/projects/skills present in the source
  // but absent from the tailored résumé. (Employment + education are never touched, so they can
  // never appear here.) These are reversible via "Restore original".
  const tailoredAwards = lowerSet(tailored.awards.map((a) => a.title));
  const tailoredProjects = lowerSet(tailored.projects.map((p) => p.name));
  const tailoredSkills = lowerSet(tailored.skills.flatMap((g) => g.items));
  const omittedOptional: string[] = [];
  for (const a of source.awards) {
    const label = a.title.trim();
    if (label && !tailoredAwards.has(label.toLowerCase())) omittedOptional.push(label);
  }
  for (const p of source.projects) {
    const label = p.name.trim();
    if (label && !tailoredProjects.has(label.toLowerCase())) omittedOptional.push(label);
  }
  for (const item of source.skills.flatMap((g) => g.items)) {
    const label = item.trim();
    if (label && !tailoredSkills.has(label.toLowerCase())) omittedOptional.push(label);
  }

  const unsupportedJd = [...(opts.unsupportedJd ?? [])].map((s) => s.trim()).filter(Boolean);
  const unchanged =
    !summary && skillAdditions.length === 0 && roles.length === 0 && omittedOptional.length === 0;
  return { summary, skillAdditions, roles, omittedOptional, unsupportedJd, unchanged };
}

// --- G2 relevance-based one-page selection + close-fit signal -----------------------------------
// Within the one-page budget the tailored résumé prunes/combines the LESS-relevant OPTIONAL content
// (skills, projects, awards) by JD relevance and adapts the summary — while keeping the FULL
// employment + education chronology intact (never a dropped role or school). The renderer already
// auto-fits to one A4 page by scaling text down; this selector is what lets the type stay legible
// (prune low-value content instead of shrinking everything) and gives the experience bullets the
// page on a close-fit role. Pure + deterministic so it stays shared with the api/ path (no jsPDF).

// A deterministic, explainable close-fit signal derived from computeGap (no model call). "Close fit"
// = the candidate already evidences (nearly) everything the JD requires, so the professional summary
// can be tightened/omitted to give the experience bullets the page; a stretch/pivot (many unmet
// requirements) keeps a bridge-explaining summary. Threshold: evidences ≥ 80% of the required
// skills. An unrecognised JD (no required skills extracted) is treated as NOT a confident close fit,
// so the honest bridge summary is preserved rather than dropped on thin signal.
export function isCloseFit(gap: GapResult): boolean {
  const required = gap.required.length;
  if (required === 0) return false;
  const covered = required - gap.gaps.length;
  return covered / required >= 0.8;
}

// Significant JD tokens (lowercased, length ≥ 3, minus common stopwords) used to score relevance of
// optional content. Deliberately simple + deterministic — matching the conservative posture of the
// gap lexicon: relevance nudges selection, it never invents or claims anything.
const RELEVANCE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'will', 'have', 'has', 'was', 'were',
  'this', 'that', 'from', 'all', 'can', 'not', 'but', 'they', 'them', 'their', 'who', 'what', 'when',
  'where', 'how', 'why', 'role', 'job', 'team', 'work', 'working', 'experience', 'years', 'year',
  'strong', 'including', 'across', 'using', 'etc', 'plus', 'preferred', 'required', 'ability', 'able',
  'skills', 'knowledge', 'understanding', 'help', 'build', 'building', 'develop', 'developing',
]);

function relevanceTokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9+#]+/g) ?? []).filter(
    (t) => t.length >= 3 && !RELEVANCE_STOPWORDS.has(t),
  );
}

export function jdRelevanceTokens(jdText: string): Set<string> {
  return new Set(relevanceTokenize(jdText));
}

// Number of DISTINCT JD tokens that appear in `text`. Higher = more JD-relevant.
function relevanceScore(text: string, jdTokens: Set<string>): number {
  let score = 0;
  const seen = new Set<string>();
  for (const token of relevanceTokenize(text)) {
    if (!seen.has(token) && jdTokens.has(token)) {
      score += 1;
      seen.add(token);
    }
  }
  return score;
}

// Keep the top-`cap` items by relevance, but render the survivors in their ORIGINAL order (awards +
// projects read chronologically/by importance; we only drop the least-relevant tail, not reorder).
function selectTopKPreserveOrder<T>(
  items: readonly T[], textOf: (item: T) => string, jdTokens: Set<string>, cap: number,
): T[] {
  if (items.length <= cap) return [...items];
  const scored = items.map((item, index) => ({ item, index, score: relevanceScore(textOf(item), jdTokens) }));
  const keep = new Set(
    [...scored].sort((a, b) => b.score - a.score || a.index - b.index).slice(0, cap).map((s) => s.index),
  );
  return scored.filter((s) => keep.has(s.index)).map((s) => s.item);
}

// Order items JD-relevant-first (stable on ties) — used for the skills line so the most JD-relevant
// tools lead, then cap the tail.
function rankByRelevanceStable<T>(items: readonly T[], textOf: (item: T) => string, jdTokens: Set<string>): T[] {
  return items
    .map((item, index) => ({ item, index, score: relevanceScore(textOf(item), jdTokens) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((s) => s.item);
}

// Tighten a summary to its leading sentence (close-fit) so the bullets get the page.
function tightenSummary(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed) return trimmed;
  const match = trimmed.match(/^[^.!?]*[.!?]/);
  return match ? match[0].trim() : trimmed;
}

export interface OnePageSelectionOptions {
  /** From `isCloseFit(computeGap(...))`: tighten the summary + prune optional content harder. */
  closeFit: boolean;
}

// Optional-content caps by fit. Close-fit trims harder (bullets deserve the page); a stretch/pivot
// keeps more supporting breadth. Experience + education are NEVER in scope here — chronology stays
// complete. A confirmed-added (G1) skill is always JD-relevant (it came from the JD gap), so it
// scores > 0 and is never pruned.
const OPTIONAL_CAPS = {
  closeFit: { awards: 3, projects: 1, skillsPerGroup: 12 },
  stretch: { awards: 6, projects: 3, skillsPerGroup: 16 },
} as const;

// Prune/reorder the LESS-relevant optional content (skills, projects, awards) to hold one legible
// page, and adapt the summary — keeping every employment + education entry. Returns a new
// StructuredResume (the source is never mutated). Feeds the one-page renderer + the persisted
// artifact, so preview == download still holds on the pruned result.
export function pruneOptionalForRelevance(
  resume: StructuredResume,
  jdText: string,
  opts: OnePageSelectionOptions,
): StructuredResume {
  const jdTokens = jdRelevanceTokens(jdText);
  const caps = opts.closeFit ? OPTIONAL_CAPS.closeFit : OPTIONAL_CAPS.stretch;

  // Summary: close-fit tightens to the leading sentence; a stretch/pivot keeps the bridge summary.
  const summary = opts.closeFit ? tightenSummary(resume.summary) : resume.summary;

  // Awards: keep the most JD-relevant up to the cap, in original order.
  const awards = selectTopKPreserveOrder(
    resume.awards, (a) => `${a.title} ${a.detail ?? ''}`, jdTokens, caps.awards,
  );

  // Projects: keep the most JD-relevant up to the cap; on a close fit also drop any project with no
  // JD relevance at all (it is pure filler competing with the experience bullets for the page).
  let projects = selectTopKPreserveOrder(
    resume.projects, (p) => `${p.name} ${p.scope ?? ''} ${p.bullets.join(' ')}`, jdTokens, caps.projects,
  );
  if (opts.closeFit) {
    projects = projects.filter(
      (p) => relevanceScore(`${p.name} ${p.scope ?? ''} ${p.bullets.join(' ')}`, jdTokens) > 0,
    );
  }

  // Skills: order JD-relevant items first within each group, then cap the group. Empty groups are
  // dropped by the renderer, so a group emptied by capping simply disappears (never a blank line).
  const skills = resume.skills.map((group) => ({
    ...group,
    items: rankByRelevanceStable(group.items, (s) => s, jdTokens).slice(0, caps.skillsPerGroup),
  }));

  return {
    contact: resume.contact,
    summary,
    awards,
    experience: resume.experience,
    projects,
    education: resume.education,
    skills,
  };
}
