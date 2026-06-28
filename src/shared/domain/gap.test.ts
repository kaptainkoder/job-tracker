import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  computeGap,
  expandSkills,
  extractSkills,
  foldResolutions,
  impliedFrom,
  mustPauseBeforeGenerate,
  resolveGap,
} from './gap';

// Fixtures are read relative to cwd — `npm test` always runs from the project root.
const fixture = (name: string) => readFileSync(`fixtures/${name}`, 'utf8');
const sorted = (skills: readonly string[]) => [...skills].sort();

// --- extractSkills: conservative, lexicon-driven (fixture-proven) -----------------------------

test('clean JD yields exactly its real stack — no more, no less', () => {
  const skills = extractSkills(fixture('clean-jd.txt'));
  assert.deepEqual(sorted(skills), sorted([
    'ci-cd',
    'infrastructure-as-code',
    'kubernetes',
    'observability',
    'terraform',
  ]));
});

test('no-salary JD yields python, sql, etl (salary absence is irrelevant to skills)', () => {
  const skills = extractSkills(fixture('no-salary-jd.txt'));
  assert.deepEqual(sorted(skills), sorted(['python', 'sql', 'etl']));
});

test('messy recruiter InMail invents NO required skills (no-fabrication invariant)', () => {
  // Pure prose, zero concrete skills — extraction must return []  rather than guess.
  assert.deepEqual(extractSkills(fixture('messy-recruiter-inmail.txt')), []);
});

test('extraction is alias-aware but does not false-match short tokens inside words', () => {
  // "ml" must not match inside "HTML"; "k8s" maps to kubernetes; "IaC" to infrastructure-as-code.
  assert.deepEqual(extractSkills('Strong HTML and CSS skills'), []);
  assert.deepEqual(sorted(extractSkills('k8s, IaC, ci/cd')), sorted([
    'ci-cd',
    'infrastructure-as-code',
    'kubernetes',
  ]));
});

test('explicitly negated, optional, retired, and ambiguous mentions are not requirements', () => {
  assert.deepEqual(extractSkills(fixture('negated-skills-jd.txt')), ['sql']);
  assert.deepEqual(extractSkills('No Python required. SQL is required.'), ['sql']);
  assert.deepEqual(extractSkills('Experience with TS/SCI clearance.'), []);
});

// --- expandSkills / impliedFrom: the implication graph (Karan's XGBoost insight) --------------

test('listing XGBoost evidences python and machine-learning', () => {
  assert.deepEqual(sorted(expandSkills(['xgboost'])), sorted([
    'machine-learning',
    'python',
    'xgboost',
  ]));
  assert.deepEqual(sorted(impliedFrom(['xgboost'])), sorted(['machine-learning', 'python']));
});

test('implications are transitive (pytorch -> deep-learning -> machine-learning)', () => {
  const expanded = expandSkills(['pytorch']);
  assert.ok(expanded.includes('deep-learning'));
  assert.ok(expanded.includes('machine-learning'));
  assert.ok(expanded.includes('python'));
});

// --- computeGap: required − evidenced, implication-aware --------------------------------------

test('gap counts XGBoost as evidence of python, so only sql + etl remain', () => {
  const result = computeGap({ jdText: fixture('no-salary-jd.txt'), evidence: ['XGBoost'] });
  // python is covered by the XGBoost implication; sql + etl are genuinely missing.
  assert.deepEqual(sorted(result.gaps.map((g) => g.skill)), sorted(['etl', 'sql']));
  assert.ok(mustPauseBeforeGenerate(result));
});

test('fully-evidenced JD produces no gaps and does not pause', () => {
  const result = computeGap({
    jdText: fixture('no-salary-jd.txt'),
    evidence: ['Python', 'SQL', 'ETL pipelines'],
  });
  assert.deepEqual(result.gaps, []);
  assert.equal(mustPauseBeforeGenerate(result), false);
});

// --- resolution: no fabrication ---------------------------------------------------------------

test('confirmed-with-evidence becomes a truthful addition; declined becomes a future-suggestion', () => {
  const withEvidence = resolveGap({ skill: 'sql', confirmed: true, evidence: 'Wrote analytics queries' });
  assert.equal(withEvidence.kind, 'truthful-addition');

  const declined = resolveGap({ skill: 'etl', confirmed: false });
  assert.equal(declined.kind, 'future-suggestion');
});

test('confirmed WITHOUT evidence is never a claim — it degrades to a future-suggestion', () => {
  const blank = resolveGap({ skill: 'sql', confirmed: true, evidence: '   ' });
  assert.equal(blank.kind, 'future-suggestion');
});

test('foldResolutions splits truthful additions from future-suggestions', () => {
  const folded = foldResolutions([
    resolveGap({ skill: 'sql', confirmed: true, evidence: 'Wrote analytics queries' }),
    resolveGap({ skill: 'etl', confirmed: false }),
    resolveGap({ skill: 'kubernetes', confirmed: true, evidence: '' }),
  ]);
  assert.deepEqual(folded.truthfulAdditions, [{ skill: 'sql', evidence: 'Wrote analytics queries' }]);
  assert.deepEqual(sorted(folded.futureSuggestions), sorted(['etl', 'kubernetes']));
});

test('foldResolutions independently rejects a malformed truthful addition with blank evidence', () => {
  const folded = foldResolutions([
    { skill: 'sql', kind: 'truthful-addition', evidence: '   ' },
  ]);
  assert.deepEqual(folded.truthfulAdditions, []);
  assert.deepEqual(folded.futureSuggestions, ['sql']);
});
