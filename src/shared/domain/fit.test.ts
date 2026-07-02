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
