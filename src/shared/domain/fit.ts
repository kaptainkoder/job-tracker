// Profile-fit scoring core (Wave G · G4). Pure, environment-neutral domain shared by the job-detail
// panel. No network, no Supabase, no LLM — a deterministic, explainable rubric over the same skill
// lexicon the gap interview uses (gap.ts). The posture mirrors the rest of the app:
//   - Nothing is invented. Fit is computed only from lexicon-known JD requirements and the user's
//     truthful, evidenced skills (the confirmed structured résumé's skill lines).
//   - There is NO fake "ATS match percentage." Fit is a High / Medium / Low band with an explicit
//     confidence, backed by transparent counts ("3 of 4 required skills evidenced") — never a score.
//   - A missing required skill LOWERS the band but never hides the job; the caller always renders.
//
// The model, per the G4 acceptance criteria:
//   1. Each recognized JD skill is classified required / preferred / unclear (explicitly negated or
//      being-migrated-away skills are dropped — they are not requirements).
//   2. Each JD skill's profile evidence is classified direct / reasonably-inferable / unconfirmed.
//   3. We emit evidence match (counts), role adjacency (same-track / adjacent / stretch),
//      preference fit, an overall band + confidence, the missing required evidence, and factual
//      bridge opportunities (a JD skill you don't evidence directly but are adjacent to).

import {
  SKILL_LEXICON,
  expandSkills,
  extractSkills,
  skillLabel,
  type SkillId,
} from './gap.js';

export type FitBand = 'High' | 'Medium' | 'Low';
export type FitConfidence = 'high' | 'medium' | 'low';
export type JdRequirement = 'required' | 'preferred' | 'unclear';
export type EvidenceStrength = 'direct' | 'inferable' | 'unconfirmed';
export type RoleAdjacency = 'same-track' | 'adjacent' | 'stretch';

// Coarse skill families used only for role adjacency + bridge reasoning. Deliberately simple: a
// skill belongs to exactly one family. Cross-family evidence still flows through the implication
// graph in gap.ts (e.g. XGBoost evidences Python), so families need not model every relationship.
type SkillFamily = 'ml' | 'data' | 'infra' | 'web';
const SKILL_FAMILY: Record<SkillId, SkillFamily> = {
  python: 'data',
  sql: 'data',
  etl: 'data',
  'machine-learning': 'ml',
  'deep-learning': 'ml',
  xgboost: 'ml',
  pytorch: 'ml',
  tensorflow: 'ml',
  aws: 'infra',
  docker: 'infra',
  kubernetes: 'infra',
  terraform: 'infra',
  'infrastructure-as-code': 'infra',
  'ci-cd': 'infra',
  observability: 'infra',
  javascript: 'web',
  typescript: 'web',
  react: 'web',
};

const FAMILY_LABEL: Record<SkillFamily, string> = {
  ml: 'machine learning',
  data: 'data / analytics',
  infra: 'infrastructure / DevOps',
  web: 'web engineering',
};

export const ADJACENCY_LABEL: Record<RoleAdjacency, string> = {
  'same-track': 'same track',
  adjacent: 'adjacent track',
  stretch: 'stretch',
};

// --- JD requirement classification -----------------------------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Standalone-token match, bounded by non-alphanumerics (same rule as gap.ts so "ml" ≠ "HTML").
function aliasMatches(clause: string, alias: string): boolean {
  const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(alias)}(?![a-z0-9])`, 'i');
  return re.test(clause);
}

type ClauseDisposition = 'excluded' | 'preferred' | 'unclear' | 'required';

const PREFERRED_MARKERS = [
  'nice to have',
  'nice-to-have',
  'preferred',
  'a plus',
  'is a plus',
  'bonus',
  'ideally',
  'desirable',
  'would be great',
  'optional',
  'not required',
  'not needed',
];

// Soft/ambiguous language: mentioned, but not asserted as a firm requirement.
const UNCLEAR_MARKERS = ['familiarity', 'exposure', 'awareness', 'some experience', 'basic understanding'];

// Explicit non-requirement: negation or an away-migration/replacement. These drop the skill.
function clauseExcludes(clause: string, alias: string): boolean {
  const escaped = escapeRegExp(alias);
  const patterns = [
    new RegExp(`\\bno\\s+(?:prior\\s+)?${escaped}(?:\\s+experience)?\\s+(?:is\\s+)?required\\b`, 'i'),
    new RegExp(`${escaped}[^,]{0,40}\\bis\\s+not\\s+required\\b`, 'i'),
    new RegExp(`${escaped}[^,]{0,40}\\bnot\\s+(?:required|needed)\\b`, 'i'),
    new RegExp(`\\b(?:migrat\\w*|mov\\w*|transition\\w*)\\s+away\\s+from\\s+${escaped}`, 'i'),
    new RegExp(`\\b(?:replac\\w*|phas\\w*\\s+out)\\s+${escaped}`, 'i'),
  ];
  return patterns.some((p) => p.test(clause));
}

// A "Nice to have" / "Preferred" heading scopes the bullet lines beneath it. A "Requirements" /
// "Must have" heading resets back to the firm-requirement default. Detect header-only lines (a
// heading with no skill of its own) so the scope carries to the following lines.
const PREFERRED_HEADER = /^\s*(?:nice[-\s]to[-\s]haves?|preferred|bonus(?:\spoints)?|good[-\s]to[-\s]have|pluses?|desirable|nice)\b[^.]*:?\s*$/i;
const REQUIRED_HEADER = /^\s*(?:requirements?|must[-\s]haves?|what\s+you'?ll\s+do|responsibilities|qualifications|required|about\s+the\s+role|you\s+will)\b[^.]*:?\s*$/i;

function lineDisposition(
  line: string,
  alias: string,
  sectionPref: 'preferred' | null,
): ClauseDisposition | null {
  if (!aliasMatches(line, alias)) return null;
  if (clauseExcludes(line, alias)) return 'excluded';
  const lower = line.toLowerCase();
  if (PREFERRED_MARKERS.some((m) => lower.includes(m))) return 'preferred';
  if (UNCLEAR_MARKERS.some((m) => lower.includes(m))) return 'unclear';
  if (sectionPref === 'preferred') return 'preferred';
  return 'required';
}

// Aggregate a skill's dispositions across every line that mentions it, honoring section headers.
// Priority when lines disagree: a firm requirement wins over a preference wins over ambiguity. If
// the ONLY mentions are exclusions (negated / migrating away), the skill is not a requirement → null.
function aggregateRequirement(jdText: string, aliases: readonly string[]): JdRequirement | null {
  // Split on newlines AND sentence terminators so both bulleted and prose JDs classify. Header
  // detection runs on newline-delimited lines; sentence fragments inherit the active section.
  const lines = jdText.split(/\n/);
  let sectionPref: 'preferred' | null = null;
  let sawRequired = false;
  let sawPreferred = false;
  let sawUnclear = false;
  let sawAny = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (PREFERRED_HEADER.test(line)) sectionPref = 'preferred';
    else if (REQUIRED_HEADER.test(line)) sectionPref = null;
    // A line may hold several sentence clauses; each still inherits the section context.
    for (const clause of line.split(/[.!?;]+/)) {
      for (const alias of aliases) {
        const d = lineDisposition(clause, alias, sectionPref);
        if (d === null) continue;
        sawAny = true;
        if (d === 'required') sawRequired = true;
        else if (d === 'preferred') sawPreferred = true;
        else if (d === 'unclear') sawUnclear = true;
      }
    }
  }
  if (!sawAny) return null;
  if (sawRequired) return 'required';
  if (sawPreferred) return 'preferred';
  if (sawUnclear) return 'unclear';
  return null; // only exclusions
}

// Every recognized JD skill with its requirement class, in the lexicon's canonical order.
export interface JdSkillClassification {
  skill: SkillId;
  label: string;
  requirement: JdRequirement;
  evidence: EvidenceStrength;
}

export interface BridgeOpportunity {
  /** The JD skill you don't evidence directly. */
  skill: SkillId;
  label: string;
  /** An evidenced skill in the same family — the honest bridge. */
  via: SkillId;
  viaLabel: string;
  note: string;
}

export interface FitInput {
  jdText: string;
  /** The user's truthful skill lines (raw surface strings) — the confirmed structured résumé skills. */
  evidence: readonly string[];
}

export interface FitResult {
  band: FitBand;
  confidence: FitConfidence;
  adjacency: RoleAdjacency;
  requiredTotal: number;
  requiredEvidenced: number;
  preferredTotal: number;
  preferredEvidenced: number;
  /** Every recognized JD skill, classified both ways. */
  classifications: JdSkillClassification[];
  /** Required skills with no direct or inferable evidence — lowers the band, never hides the job. */
  missingRequired: JdSkillClassification[];
  /** Factual "you're adjacent to this" bridges for unconfirmed JD skills. */
  bridges: BridgeOpportunity[];
  /** One-line deterministic explanation. Never a percentage. */
  summary: string;
  /** Additional factual explanation lines for the panel. */
  notes: string[];
}

function evidenceStrength(skill: SkillId, directSet: Set<SkillId>, inferredSet: Set<SkillId>): EvidenceStrength {
  if (directSet.has(skill)) return 'direct';
  if (inferredSet.has(skill)) return 'inferable';
  return 'unconfirmed';
}

function isEvidenced(strength: EvidenceStrength): boolean {
  return strength === 'direct' || strength === 'inferable';
}

// The deterministic profile-fit rubric. Explainable by construction: every output field is a count
// or a class derived above, and `notes` narrates the same facts in plain language.
export function computeFit(input: FitInput): FitResult {
  const jdText = input.jdText ?? '';

  // 1. Classify each recognized JD skill required / preferred / unclear (canonical order).
  const classes: { skill: SkillId; requirement: JdRequirement }[] = [];
  for (const skill of Object.keys(SKILL_LEXICON) as SkillId[]) {
    const requirement = aggregateRequirement(jdText, SKILL_LEXICON[skill]);
    if (requirement) classes.push({ skill, requirement });
  }

  // 2. Classify the user's evidence: direct extraction + implication-expanded (reasonably inferable).
  const directList = extractSkills(input.evidence.join('\n'));
  const directSet = new Set<SkillId>(directList);
  const inferredSet = new Set<SkillId>(expandSkills(directList)); // includes direct + implied

  const classifications: JdSkillClassification[] = classes.map(({ skill, requirement }) => ({
    skill,
    label: skillLabel(skill),
    requirement,
    evidence: evidenceStrength(skill, directSet, inferredSet),
  }));

  const required = classifications.filter((c) => c.requirement === 'required');
  const preferred = classifications.filter((c) => c.requirement === 'preferred');
  const requiredEvidenced = required.filter((c) => isEvidenced(c.evidence)).length;
  const preferredEvidenced = preferred.filter((c) => isEvidenced(c.evidence)).length;
  const missingRequired = required.filter((c) => c.evidence === 'unconfirmed');

  // 3. Role adjacency from family overlap between the JD's asks and the user's evidenced skills.
  const jdFamilies = new Set<SkillFamily>(classifications.map((c) => SKILL_FAMILY[c.skill]));
  const evidencedSkills = [...inferredSet];
  const evidenceFamilies = new Set<SkillFamily>(evidencedSkills.map((s) => SKILL_FAMILY[s]));
  const coveredFamilies = [...jdFamilies].filter((f) => evidenceFamilies.has(f));
  let adjacency: RoleAdjacency;
  if (jdFamilies.size > 0 && [...jdFamilies].every((f) => evidenceFamilies.has(f))) {
    adjacency = 'same-track';
  } else if (coveredFamilies.length > 0) {
    adjacency = 'adjacent';
  } else {
    adjacency = 'stretch';
  }

  // 4. Bridge opportunities: an unconfirmed JD skill with an evidenced same-family skill.
  const bridges: BridgeOpportunity[] = [];
  for (const c of classifications) {
    if (isEvidenced(c.evidence)) continue;
    const family = SKILL_FAMILY[c.skill];
    const via = evidencedSkills.find((s) => SKILL_FAMILY[s] === family && s !== c.skill);
    if (via) {
      bridges.push({
        skill: c.skill,
        label: c.label,
        via,
        viaLabel: skillLabel(via),
        note: `You evidence ${skillLabel(via)}; ${c.label} is adjacent ${FAMILY_LABEL[family]} work — highlight the transferable experience rather than claiming ${c.label} itself.`,
      });
    }
  }

  // 5. Overall band + confidence.
  const requiredTotal = required.length;
  const ratio = requiredTotal > 0 ? requiredEvidenced / requiredTotal : null;
  let band: FitBand;
  if (ratio === null) {
    // No recognized required skills in this JD — we cannot assert a strong match honestly.
    band = 'Low';
  } else if (ratio >= 0.8 && adjacency !== 'stretch') {
    band = 'High';
  } else if (ratio < 0.4 || (adjacency === 'stretch' && ratio < 0.6)) {
    band = 'Low';
  } else {
    band = 'Medium';
  }

  let confidence: FitConfidence;
  if (requiredTotal <= 1 || directSet.size === 0) confidence = 'low';
  else if (requiredTotal >= 3 && directSet.size >= 2) confidence = 'high';
  else confidence = 'medium';

  // 6. Deterministic explanation. Counts only — never an ATS percentage.
  const parts = [`${requiredEvidenced} of ${requiredTotal} required skill${requiredTotal === 1 ? '' : 's'} evidenced`];
  if (preferred.length > 0) {
    parts.push(`${preferredEvidenced} of ${preferred.length} preferred`);
  }
  const summary = `${band} fit · ${ADJACENCY_LABEL[adjacency]}. ${parts.join(', ')}.`;

  const notes: string[] = [];
  if (requiredTotal === 0) {
    notes.push('This posting lists no recognized required skills — fit cannot be asserted with confidence from the JD alone.');
  }
  if (missingRequired.length > 0) {
    notes.push(
      `Missing required evidence: ${missingRequired.map((c) => c.label).join(', ')}. This lowers the fit but the role is still worth pursuing.`,
    );
  }
  const unclear = classifications.filter((c) => c.requirement === 'unclear');
  if (unclear.length > 0) {
    notes.push(`Mentioned but ambiguous in the JD: ${unclear.map((c) => c.label).join(', ')}.`);
  }
  if (adjacency === 'stretch') {
    notes.push('This is a stretch: your evidenced skills sit in a different track from this role’s core asks.');
  }
  if (confidence === 'low') {
    notes.push('Low confidence — thin signal (few recognized requirements or little evidenced skill overlap).');
  }

  return {
    band,
    confidence,
    adjacency,
    requiredTotal,
    requiredEvidenced,
    preferredTotal: preferred.length,
    preferredEvidenced,
    classifications,
    missingRequired,
    bridges,
    summary,
    notes,
  };
}
