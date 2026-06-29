// Résumé parse contract (Wave B · B6.3) — the one-time LLM extraction of the base PDF into the
// StructuredResume source of truth.
//
// The LLM's ONLY job here is extraction: turn already-extracted résumé *text* (pdf.js, client-side)
// into the StructuredResume shape, copying content faithfully and inventing nothing. Layout never
// comes from the LLM (the renderer is deterministic), and the truthfulness guarantee for *tailoring*
// lives in tailor.ts — but at parse time the guard is the contract below + the normalizer, which
// only ever keeps strings the model emitted and never fabricates a placeholder. The owner then
// reviews/corrects the result on the Résumé screen before it is saved.
//
// Like the tailor path, the browser assembles these messages and POSTs them to api/llm.ts, which
// audits (manifest below) + streams the JSON back. parseStructuredResumeResponse re-assembles the
// streamed text into a StructuredResume, tolerating fences/prose and dropping malformed entries.

import type { ChatMessage } from './llm';
import type { PrivacyCategory } from './privacy';
import type {
  StructuredResume,
  ResumeAward,
  ResumeEducation,
  ResumeExperience,
  ResumeProject,
  ResumeSkillGroup,
  ResumeLink,
} from './resume';

export const PARSE_RESUME_ACTION = 'parse-resume' as const;
export type ParseResumeAction = typeof PARSE_RESUME_ACTION;

// The persisted audit row's action label (Privacy Log reads like prose).
export const PARSE_RESUME_PRIVACY_ACTION = 'parse-resume';

// What leaves the browser on a parse: the entire résumé text, which carries contact details. So the
// manifest is the full résumé + every content category it contains (no salary — résumés don't have
// the target salary). Used by the server to build the SENT manifest; nothing else is sent.
export const PARSE_RESUME_CATEGORIES: PrivacyCategory[] = [
  'resume',
  'contact-info',
  'profile-summary',
  'work-history',
  'skills',
  'education',
];

export function isParseResumeAction(value: unknown): value is ParseResumeAction {
  return value === PARSE_RESUME_ACTION;
}

// The extraction contract. The schema is described inline so the model emits exactly the
// StructuredResume shape; the renderer + review UI rely on it. No-fabrication is stated plainly and
// re-enforced by the normalizer (which can only keep what the model returned).
const PARSE_RESUME_SYSTEM = [
  'You convert the plain text of a candidate résumé into a single structured JSON object.',
  'You are an EXTRACTOR, not a writer. Copy what the résumé says, faithfully. Never invent, infer,',
  'embellish, or add a skill, employer, date, degree, award, or achievement that is not present in',
  'the text. If a field is absent, omit it (or use an empty array) — do not guess. Preserve the',
  "résumé's own wording for bullets; do not rephrase.",
  '',
  'Return ONLY the JSON object (no Markdown fence, no prose) with exactly this shape:',
  '{',
  '  "contact": { "fullName": string, "title": string, "phone"?: string, "email"?: string,',
  '               "location"?: string, "links": [{ "label": string, "url"?: string }] },',
  '  "summary": string,                          // the professional-summary paragraph, "" if none',
  '  "awards": [{ "title": string, "detail"?: string }],',
  '  "experience": [{ "org": string, "orgDetail"?: string, "location"?: string, "title": string,',
  '                   "start": string, "end": string, "scope"?: string, "bullets": [string] }],',
  '  "projects": [{ "name": string, "location"?: string, "scope"?: string, "bullets": [string] }],',
  '  "education": [{ "school": string, "detail"?: string, "location"?: string, "degree": string,',
  '                 "start": string, "end": string }],',
  '  "skills": [{ "label"?: string, "items": [string] }]   // group by the résumé\'s own headings',
  '}',
  '',
  'Dates: copy the résumé\'s surface form (e.g. "July 2025", "07/2025", "Present"). One experience',
  'entry per role. One bullet per achievement line, verbatim. Output must be valid JSON.',
].join('\n');

export interface ParseResumeContext {
  /** The résumé text extracted client-side (pdf.js). */
  resumeText: string;
}

export function buildParseResumeMessages(ctx: ParseResumeContext): ChatMessage[] {
  const userContent = [
    'Résumé text to convert into the JSON object described in the system message:',
    '',
    ctx.resumeText.trim() || '(empty)',
    '',
    'Return only the JSON object. Extract faithfully; invent nothing.',
  ].join('\n');

  return [
    { role: 'system', content: PARSE_RESUME_SYSTEM },
    { role: 'user', content: userContent },
  ];
}

// --- Tolerant response normalization ------------------------------------------------------------
// The model streams JSON text back. We strip an optional ```json fence, isolate the outermost
// object if it wrapped prose, JSON.parse, then coerce into a well-formed StructuredResume. Every
// coercion only ever KEEPS strings the model returned (trimmed) — it never substitutes a default
// value that would read as a fabricated claim. Returns null only when there is no parseable object
// at all, so the caller can surface an honest "couldn't read that" instead of rendering garbage.

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optStr(value: unknown): string | undefined {
  const s = str(value);
  return s ? s : undefined;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(str).filter((s) => s.length > 0);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeLinks(value: unknown): ResumeLink[] {
  if (!Array.isArray(value)) return [];
  const links: ResumeLink[] = [];
  for (const item of value) {
    const obj = asObject(item);
    if (!obj) continue;
    const label = str(obj.label);
    if (!label) continue;
    const link: ResumeLink = { label };
    const url = optStr(obj.url);
    if (url) link.url = url;
    links.push(link);
  }
  return links;
}

function normalizeAwards(value: unknown): ResumeAward[] {
  if (!Array.isArray(value)) return [];
  const out: ResumeAward[] = [];
  for (const item of value) {
    const obj = asObject(item);
    if (!obj) continue;
    const title = str(obj.title);
    if (!title) continue;
    const award: ResumeAward = { title };
    const detail = optStr(obj.detail);
    if (detail) award.detail = detail;
    out.push(award);
  }
  return out;
}

function normalizeExperience(value: unknown): ResumeExperience[] {
  if (!Array.isArray(value)) return [];
  const out: ResumeExperience[] = [];
  for (const item of value) {
    const obj = asObject(item);
    if (!obj) continue;
    const org = str(obj.org);
    const title = str(obj.title);
    if (!org && !title) continue; // an entry with neither org nor title is noise
    const entry: ResumeExperience = {
      org,
      title,
      start: str(obj.start),
      end: str(obj.end),
      bullets: strArray(obj.bullets),
    };
    const orgDetail = optStr(obj.orgDetail);
    if (orgDetail) entry.orgDetail = orgDetail;
    const location = optStr(obj.location);
    if (location) entry.location = location;
    const scope = optStr(obj.scope);
    if (scope) entry.scope = scope;
    out.push(entry);
  }
  return out;
}

function normalizeProjects(value: unknown): ResumeProject[] {
  if (!Array.isArray(value)) return [];
  const out: ResumeProject[] = [];
  for (const item of value) {
    const obj = asObject(item);
    if (!obj) continue;
    const name = str(obj.name);
    if (!name) continue;
    const project: ResumeProject = { name, bullets: strArray(obj.bullets) };
    const location = optStr(obj.location);
    if (location) project.location = location;
    const scope = optStr(obj.scope);
    if (scope) project.scope = scope;
    out.push(project);
  }
  return out;
}

function normalizeEducation(value: unknown): ResumeEducation[] {
  if (!Array.isArray(value)) return [];
  const out: ResumeEducation[] = [];
  for (const item of value) {
    const obj = asObject(item);
    if (!obj) continue;
    const school = str(obj.school);
    if (!school) continue;
    const edu: ResumeEducation = {
      school,
      degree: str(obj.degree),
      start: str(obj.start),
      end: str(obj.end),
    };
    const detail = optStr(obj.detail);
    if (detail) edu.detail = detail;
    const location = optStr(obj.location);
    if (location) edu.location = location;
    out.push(edu);
  }
  return out;
}

function normalizeSkills(value: unknown): ResumeSkillGroup[] {
  if (!Array.isArray(value)) return [];
  const out: ResumeSkillGroup[] = [];
  for (const item of value) {
    const obj = asObject(item);
    if (!obj) continue;
    const items = strArray(obj.items);
    if (!items.length) continue;
    const group: ResumeSkillGroup = { items };
    const label = optStr(obj.label);
    if (label) group.label = label;
    out.push(group);
  }
  return out;
}

export function emptyStructuredResume(): StructuredResume {
  return {
    contact: { fullName: '', title: '', links: [] },
    summary: '',
    awards: [],
    experience: [],
    projects: [],
    education: [],
    skills: [],
  };
}

// Isolate a JSON object from possibly-fenced, possibly-prose-wrapped model output.
function isolateJsonObject(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  if (!text) return null;
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fence) text = fence[1].trim();
  if (!text.startsWith('{')) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    text = text.slice(start, end + 1);
  }
  return text;
}

export function parseStructuredResumeResponse(raw: string): StructuredResume | null {
  const text = isolateJsonObject(raw);
  if (text === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const obj = asObject(parsed);
  if (!obj) return null;

  const contactObj = asObject(obj.contact) ?? {};
  const resume: StructuredResume = {
    contact: {
      fullName: str(contactObj.fullName),
      title: str(contactObj.title),
      links: normalizeLinks(contactObj.links),
    },
    summary: str(obj.summary),
    awards: normalizeAwards(obj.awards),
    experience: normalizeExperience(obj.experience),
    projects: normalizeProjects(obj.projects),
    education: normalizeEducation(obj.education),
    skills: normalizeSkills(obj.skills),
  };
  const phone = optStr(contactObj.phone);
  if (phone) resume.contact.phone = phone;
  const email = optStr(contactObj.email);
  if (email) resume.contact.email = email;
  const location = optStr(contactObj.location);
  if (location) resume.contact.location = location;

  return resume;
}
