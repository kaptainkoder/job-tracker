// Gap-interview core (Wave B · B2). Pure, environment-neutral domain shared by the browser
// profile editor and (in B3) the tailor flow. No network, no Supabase — just the no-fabrication
// contract:
//   1. extractSkills    — conservatively pull lexicon-known skills out of free text (JD or résumé).
//   2. expandSkills     — apply the implication graph (a line on XGBoost evidences Python + ML).
//   3. computeGap       — required (from JD) minus evidenced (from profile) = the gap set.
//   4. mustPauseBeforeGenerate — the contract a caller checks BEFORE generating anything.
//   5. resolveGap / foldResolutions — a confirmed gap becomes a truthful addition ONLY with
//      evidence; declined or evidence-less gaps become future-suggestions, never résumé claims.
//
// The posture (see brainstorm Wave B, locked decision "No fabrication = gap-interview"): the app
// never invents a skill the JD asks for; it asks, and only adds what the user can back with
// evidence. Extraction stays deliberately conservative — it would rather miss a skill than guess
// one out of vague recruiter prose (mirrors parser.ts).

// --- Skill vocabulary ------------------------------------------------------------------------
// Canonical skill ids (kebab-case). The declaration order here is canonical — extraction output
// is sorted by it so results are stable and comparable. Each canonical id maps to the surface
// aliases we accept in text. Add to this lexicon rather than widening the matcher heuristically.

export const SKILL_LEXICON = {
  python: ['python'],
  sql: ['sql', 'postgresql', 'postgres', 'mysql'],
  // Avoid ambiguous two-letter aliases in JDs (for example TS/SCI clearance is not TypeScript).
  javascript: ['javascript'],
  typescript: ['typescript'],
  react: ['react', 'react.js', 'reactjs'],
  aws: ['aws', 'amazon web services'],
  docker: ['docker'],
  kubernetes: ['kubernetes', 'k8s'],
  terraform: ['terraform'],
  'infrastructure-as-code': ['infrastructure-as-code', 'infrastructure as code', 'iac'],
  'ci-cd': ['ci/cd', 'ci-cd', 'cicd', 'continuous integration', 'continuous delivery', 'continuous deployment'],
  observability: ['observability'],
  etl: ['etl', 'elt', 'etl/elt'],
  'machine-learning': ['machine learning', 'machine-learning'],
  'deep-learning': ['deep learning', 'deep-learning'],
  xgboost: ['xgboost'],
  pytorch: ['pytorch'],
  tensorflow: ['tensorflow'],
} as const;

export type SkillId = keyof typeof SKILL_LEXICON;

// Human-readable labels for the UI ("also evidences: Python, Machine learning").
export const SKILL_LABEL: Record<SkillId, string> = {
  python: 'Python',
  sql: 'SQL',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  react: 'React',
  aws: 'AWS',
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  terraform: 'Terraform',
  'infrastructure-as-code': 'Infrastructure as code',
  'ci-cd': 'CI/CD',
  observability: 'Observability',
  etl: 'ETL / ELT',
  'machine-learning': 'Machine learning',
  'deep-learning': 'Deep learning',
  xgboost: 'XGBoost',
  pytorch: 'PyTorch',
  tensorflow: 'TensorFlow',
};

export function skillLabel(skill: string): string {
  return isSkillId(skill) ? SKILL_LABEL[skill] : skill;
}

// Implication graph: evidencing the key skill also evidences the listed skills. Resolved to a
// fixpoint (transitive) in expandSkills, so pytorch -> deep-learning -> machine-learning all hold.
// Kept conservative — only implications that are true by definition of the tool/practice.
export const SKILL_IMPLICATIONS: Partial<Record<SkillId, readonly SkillId[]>> = {
  xgboost: ['python', 'machine-learning'],
  pytorch: ['python', 'deep-learning'],
  tensorflow: ['python', 'deep-learning'],
  'deep-learning': ['machine-learning'],
  terraform: ['infrastructure-as-code'],
  react: ['javascript'],
};

const CANONICAL_ORDER = Object.keys(SKILL_LEXICON) as SkillId[];
const orderIndex = (skill: SkillId) => {
  const i = CANONICAL_ORDER.indexOf(skill);
  return i === -1 ? CANONICAL_ORDER.length : i;
};
const byCanonicalOrder = (a: SkillId, b: SkillId) => orderIndex(a) - orderIndex(b);

function isSkillId(value: string): value is SkillId {
  return Object.prototype.hasOwnProperty.call(SKILL_LEXICON, value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Match an alias as a standalone token: bounded by non-alphanumerics on both sides (so "ml" does
// not match inside "HTML", but "ci/cd" still matches inside "CI/CD," because '/' and ',' are
// non-alphanumeric). Case-insensitive.
function aliasMatches(text: string, alias: string): boolean {
  const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(alias)}(?![a-z0-9])`, 'i');
  return re.test(text);
}

// A lexicon mention is not automatically a requirement. Inspect its local clause and suppress
// explicit negation, retirement, and optional/nice-to-have language. Ambiguous prose is omitted
// instead of turned into a gap question.
function aliasIsRequired(text: string, alias: string): boolean {
  const escaped = escapeRegExp(alias);
  return text.split(/[\n.!?;]+/).some((clause) => {
    if (!aliasMatches(clause, alias)) return false;
    const nonRequirementPatterns = [
      new RegExp(`\\bno\\s+(?:prior\\s+)?${escaped}(?:\\s+experience)?\\s+(?:is\\s+)?required\\b`, 'i'),
      new RegExp(`${escaped}[^,]{0,60}\\b(?:not required|not needed|optional|nice to have)\\b`, 'i'),
      new RegExp(`\\b(?:optional|nice to have|bonus)\\b[^,]{0,60}${escaped}`, 'i'),
      new RegExp(`\\b(?:migrat\\w*|mov\\w*|transition\\w*)\\s+away\\s+from\\s+${escaped}`, 'i'),
      new RegExp(`\\b(?:replac\\w*|phas\\w*\\s+out)\\s+${escaped}`, 'i'),
    ];
    return !nonRequirementPatterns.some((pattern) => pattern.test(clause));
  });
}

// --- Extraction + expansion ------------------------------------------------------------------

// Conservatively pull known skills out of free text. Returns canonical ids in canonical order,
// de-duplicated. Anything not in the lexicon is simply not extracted (never guessed).
export function extractSkills(text: string): SkillId[] {
  if (!text) return [];
  const found = new Set<SkillId>();
  for (const skill of CANONICAL_ORDER) {
    if (SKILL_LEXICON[skill].some((alias) => aliasIsRequired(text, alias))) found.add(skill);
  }
  return [...found].sort(byCanonicalOrder);
}

// Apply the implication graph to a fixpoint. Returns the input skills PLUS everything they imply,
// canonical-ordered and de-duplicated. Inputs are canonical SkillIds produced by extractSkills.
export function expandSkills(skills: readonly SkillId[]): SkillId[] {
  const result = new Set<SkillId>(skills);
  let added = true;
  while (added) {
    added = false;
    for (const skill of [...result]) {
      for (const implied of SKILL_IMPLICATIONS[skill] ?? []) {
        if (!result.has(implied)) {
          result.add(implied);
          added = true;
        }
      }
    }
  }
  return [...result].sort(byCanonicalOrder);
}

// The skills that are ONLY present because of implication (expansion minus the originals). Powers
// the profile editor's "listing X also evidences: …" review preview.
export function impliedFrom(skills: readonly SkillId[]): SkillId[] {
  const original = new Set(skills);
  return expandSkills(skills).filter((skill) => !original.has(skill));
}

// --- Gap computation -------------------------------------------------------------------------

export interface GapQuestion {
  skill: SkillId;
  /** Human label for the UI (e.g. "Infrastructure as code"). */
  label: string;
  /** The pause-before-generate prompt, in the app's honest first person. */
  prompt: string;
}

export interface GapResult {
  /** JD-required skills, implication-expanded, canonical order. */
  required: SkillId[];
  /** Profile-evidenced skills, implication-expanded, canonical order. */
  evidenced: SkillId[];
  /** Required skills with no evidence — each becomes a pause-before-generate question. */
  gaps: GapQuestion[];
}

export interface GapInput {
  jdText: string;
  /** The user's truthful skill lines from their profile (raw surface strings are fine). */
  evidence: readonly string[];
}

function gapQuestion(skill: SkillId): GapQuestion {
  const label = skillLabel(skill);
  return {
    skill,
    label,
    prompt: `This role wants ${label}, but I don't see it evidenced in your profile. Do you have it? Tell me what demonstrates it and I'll add it truthfully — otherwise I'll keep it only as a future suggestion, never a claim.`,
  };
}

// required (from the JD) minus evidenced (from the profile, implication-expanded) = the gap set.
export function computeGap(input: GapInput): GapResult {
  const required = expandSkills(extractSkills(input.jdText));
  const evidenced = expandSkills(extractSkills(input.evidence.join('\n')));
  const evidencedSet = new Set(evidenced);
  const gaps = required.filter((skill) => !evidencedSet.has(skill)).map(gapQuestion);
  return { required, evidenced, gaps };
}

// The contract a caller MUST check before generating: if any gap is unresolved, pause and ask.
export function mustPauseBeforeGenerate(result: GapResult): boolean {
  return result.gaps.length > 0;
}

// --- Resolution (no fabrication) -------------------------------------------------------------

export interface GapDecision {
  skill: SkillId;
  confirmed: boolean;
  /** Free-text proof the user actually has the skill. Required for a truthful addition. */
  evidence?: string;
}

export interface GapResolution {
  skill: SkillId;
  kind: 'truthful-addition' | 'future-suggestion';
  /** Present only on a truthful addition. */
  evidence?: string;
}

// A confirmed gap becomes a truthful addition ONLY when backed by non-empty evidence. A declined
// gap — or a confirmed one with blank/missing evidence — degrades to a future-suggestion. The app
// never turns an unbacked confirmation into a résumé claim.
export function resolveGap(decision: GapDecision): GapResolution {
  const evidence = (decision.evidence ?? '').trim();
  if (decision.confirmed && evidence) {
    return { skill: decision.skill, kind: 'truthful-addition', evidence };
  }
  return { skill: decision.skill, kind: 'future-suggestion' };
}

export interface FoldedResolutions {
  /** Skills the user backed with evidence — safe to fold into the tailor context (B3). */
  truthfulAdditions: { skill: SkillId; evidence: string }[];
  /** Skills surfaced as future-suggestions only — never claimed. */
  futureSuggestions: SkillId[];
}

export function foldResolutions(resolutions: readonly GapResolution[]): FoldedResolutions {
  const truthfulAdditions: { skill: SkillId; evidence: string }[] = [];
  const futureSuggestions: SkillId[] = [];
  for (const resolution of resolutions) {
    const evidence = (resolution.evidence ?? '').trim();
    // Re-enforce the invariant at the fold boundary too. B3 may hydrate saved/remote data rather
    // than calling resolveGap in-process; malformed "truthful" input must still never become a
    // claim without evidence.
    if (resolution.kind === 'truthful-addition' && evidence) {
      truthfulAdditions.push({ skill: resolution.skill, evidence });
    } else {
      futureSuggestions.push(resolution.skill);
    }
  }
  return { truthfulAdditions, futureSuggestions };
}
