import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { computeFit } from './fit';

// Fixtures are read relative to cwd — `npm test` always runs from the project root.
const fixture = (name: string) => readFileSync(`fixtures/${name}`, 'utf8');

// A representative commercial-marketing decision scientist's confirmed skills.
const DS_EVIDENCE = ['Python', 'SQL', 'XGBoost', 'Machine learning'];

function classOf(result: ReturnType<typeof computeFit>, skill: string) {
  return result.classifications.find((c) => c.skill === skill);
}

// --- G4: never an ATS percentage --------------------------------------------------------------

test('fit is a band + counts, never an ATS percentage', () => {
  const r = computeFit({ jdText: fixture('close-fit-jd.txt'), evidence: DS_EVIDENCE });
  assert.ok(['High', 'Medium', 'Low'].includes(r.band));
  // No output field is a percentage, and the summary never contains a % score.
  assert.ok(!r.summary.includes('%'));
  assert.ok(!r.notes.some((n) => n.includes('%')));
  assert.equal(typeof r.requiredEvidenced, 'number');
  assert.equal(typeof r.requiredTotal, 'number');
});

// --- G4.1/G4.2: close-fit shows High + evidence match + required/preferred classification -------

test('close-fit DS role → High, same-track, required skills classified + evidenced', () => {
  const r = computeFit({ jdText: fixture('close-fit-jd.txt'), evidence: DS_EVIDENCE });
  assert.equal(r.band, 'High');
  assert.equal(r.adjacency, 'same-track');
  assert.equal(r.confidence, 'high');
  // Python + SQL are required and directly evidenced; ML is inferable from XGBoost.
  assert.equal(classOf(r, 'python')?.requirement, 'required');
  assert.equal(classOf(r, 'python')?.evidence, 'direct');
  assert.equal(classOf(r, 'sql')?.evidence, 'direct');
  assert.equal(classOf(r, 'machine-learning')?.evidence, 'direct'); // extracted directly from "Machine learning"
  assert.equal(r.missingRequired.length, 0);
  assert.equal(r.requiredEvidenced, r.requiredTotal);
});

// --- G4.2: a missing required item lowers fit but the job is not hidden -------------------------

test('pivot infra role for a DS candidate → Low + stretch, missing required listed (not hidden)', () => {
  const r = computeFit({ jdText: fixture('pivot-jd.txt'), evidence: DS_EVIDENCE });
  assert.equal(r.band, 'Low');
  assert.equal(r.adjacency, 'stretch');
  // Infra requirements are present, classified required, and unconfirmed — surfaced, never dropped.
  assert.ok(r.missingRequired.some((c) => c.skill === 'kubernetes'));
  assert.ok(r.missingRequired.some((c) => c.skill === 'terraform'));
  assert.equal(r.requiredEvidenced, 0);
  assert.ok(r.requiredTotal > 0); // the job still lists its requirements
  assert.ok(r.notes.some((n) => /stretch/i.test(n)));
});

// --- G4.3: adjacent role → Medium with explicit bridges ----------------------------------------

test('adjacent applied-AI role → Medium, bridges are explicit and factual', () => {
  const r = computeFit({ jdText: fixture('adjacent-jd.txt'), evidence: DS_EVIDENCE });
  // Required ml+data families are covered, but the preferred infra block (AWS/Docker) is not → adjacent.
  assert.equal(r.adjacency, 'adjacent');
  assert.equal(r.band, 'Medium');
  // PyTorch is required but unconfirmed; XGBoost/ML evidence bridges the same ml family.
  const pt = classOf(r, 'pytorch');
  assert.equal(pt?.requirement, 'required');
  assert.equal(pt?.evidence, 'unconfirmed');
  const bridge = r.bridges.find((b) => b.skill === 'pytorch');
  assert.ok(bridge, 'expected a PyTorch bridge');
  assert.ok(/adjacent/i.test(bridge!.note));
  // The bridge never claims the missing skill itself.
  assert.ok(/rather than claiming/i.test(bridge!.note));
  // AWS + Docker are the "nice to have" block → preferred, not required.
  assert.equal(classOf(r, 'aws')?.requirement, 'preferred');
  assert.equal(classOf(r, 'docker')?.requirement, 'preferred');
});

// --- Requirement classification edge cases (negation / optional / migration) --------------------

test('negated/optional/migrating skills classify correctly (required/preferred/dropped)', () => {
  const r = computeFit({ jdText: fixture('negated-skills-jd.txt'), evidence: [] });
  // "SQL is required" → required.
  assert.equal(classOf(r, 'sql')?.requirement, 'required');
  // "Terraform would be nice to have, but it is optional" → preferred.
  assert.equal(classOf(r, 'terraform')?.requirement, 'preferred');
  // "Python is not required" → dropped entirely (not a requirement).
  assert.equal(classOf(r, 'python'), undefined);
  // "We are migrating away from Kubernetes" → dropped.
  assert.equal(classOf(r, 'kubernetes'), undefined);
});

// --- Preference fit is counted separately ------------------------------------------------------

test('preferred skills are counted and evidenced separately from required', () => {
  // Evidence includes AWS + Docker so the adjacent JD's nice-to-haves are met.
  const r = computeFit({
    jdText: fixture('adjacent-jd.txt'),
    evidence: [...DS_EVIDENCE, 'AWS', 'Docker'],
  });
  assert.equal(r.preferredTotal, 2);
  assert.equal(r.preferredEvidenced, 2);
  assert.match(r.summary, /2 of 2 preferred/);
});

// --- Empty / unknown JD → honest low confidence, no fabricated fit ------------------------------

test('JD with no recognized skills → Low band, low confidence, honest note', () => {
  const r = computeFit({ jdText: fixture('messy-recruiter-inmail.txt'), evidence: DS_EVIDENCE });
  assert.equal(r.requiredTotal, 0);
  assert.equal(r.band, 'Low');
  assert.equal(r.confidence, 'low');
  assert.ok(r.notes.some((n) => /no recognized required skills/i.test(n)));
});

// --- Determinism: same inputs → identical result ----------------------------------------------

test('computeFit is deterministic', () => {
  const a = computeFit({ jdText: fixture('close-fit-jd.txt'), evidence: DS_EVIDENCE });
  const b = computeFit({ jdText: fixture('close-fit-jd.txt'), evidence: DS_EVIDENCE });
  assert.deepEqual(a, b);
});

// --- Direct branch coverage -----------------------------------------------------------------

test('ambiguous skill language is classified as unclear and explained', () => {
  const r = computeFit({ jdText: 'Familiarity with Kubernetes', evidence: [] });
  assert.equal(classOf(r, 'kubernetes')?.requirement, 'unclear');
  assert.ok(r.notes.includes('Mentioned but ambiguous in the JD: Kubernetes.'));
});

test('nice-to-have header scopes following skills as preferred', () => {
  const r = computeFit({ jdText: 'Nice to have:\n- Kubernetes', evidence: [] });
  assert.equal(classOf(r, 'kubernetes')?.requirement, 'preferred');
});

test('requirements header resets preferred section scope', () => {
  const r = computeFit({
    jdText: 'Nice to have:\n- Kubernetes\nRequirements:\n- SQL',
    evidence: [],
  });
  assert.equal(classOf(r, 'kubernetes')?.requirement, 'preferred');
  assert.equal(classOf(r, 'sql')?.requirement, 'required');
});

test('two required skills with one direct skill produce medium confidence', () => {
  const r = computeFit({ jdText: 'Requirements:\n- Python\n- SQL', evidence: ['Python'] });
  assert.equal(r.requiredTotal, 2);
  assert.equal(r.requiredEvidenced, 1);
  assert.equal(r.confidence, 'medium');
});

test('four of five required skills is the High band boundary', () => {
  const r = computeFit({
    jdText: 'Requirements:\n- Python\n- SQL\n- Kubernetes\n- Terraform\n- AWS',
    evidence: ['Python', 'SQL', 'Kubernetes', 'Terraform'],
  });
  assert.equal(r.requiredTotal, 5);
  assert.equal(r.requiredEvidenced, 4);
  assert.notEqual(r.adjacency, 'stretch');
  assert.equal(r.band, 'High');
});

test('one of three required skills produces Low without a stretch', () => {
  const r = computeFit({
    jdText: 'Requirements:\n- Python\n- SQL\n- ETL',
    evidence: ['Python'],
  });
  assert.equal(r.requiredTotal, 3);
  assert.equal(r.requiredEvidenced, 1);
  assert.equal(r.adjacency, 'same-track');
  assert.equal(r.band, 'Low');
});

test('replacement, phase-out, and no-prior-experience clauses drop skills', () => {
  const r = computeFit({
    jdText: [
      'We are replacing Docker with a managed platform.',
      'We are phasing out Kubernetes.',
      'No prior Terraform experience is required.',
    ].join('\n'),
    evidence: [],
  });
  assert.equal(classOf(r, 'docker'), undefined);
  assert.equal(classOf(r, 'kubernetes'), undefined);
  assert.equal(classOf(r, 'terraform'), undefined);
});

test('implied evidence counts toward required fit without becoming missing', () => {
  const r = computeFit({
    jdText: 'Requirements:\n- Machine learning\n- SQL',
    evidence: ['XGBoost', 'SQL'],
  });
  assert.equal(classOf(r, 'machine-learning')?.evidence, 'inferable');
  assert.equal(r.requiredTotal, 2);
  assert.equal(r.requiredEvidenced, 2);
  assert.ok(!r.missingRequired.some((c) => c.skill === 'machine-learning'));
});

test('empty and whitespace-only JDs return honest low-confidence results', () => {
  for (const jdText of ['', ' \n\t ']) {
    const r = computeFit({ jdText, evidence: DS_EVIDENCE });
    assert.equal(r.requiredTotal, 0);
    assert.equal(r.band, 'Low');
    assert.equal(r.confidence, 'low');
    assert.ok(
      r.notes.includes(
        'This posting lists no recognized required skills — fit cannot be asserted with confidence from the JD alone.',
      ),
    );
  }
});
