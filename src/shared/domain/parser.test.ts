// Self-contained test (no test runner): bundled by esbuild and run with node via
// `npm test`. Throws — and so exits non-zero — on the first failed assertion, which
// is what the release gate keys off. Fixtures live in ../../../fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLeadInput } from './parser';
import { isStale } from './stages';

// Fixtures are read relative to cwd — `npm test` always runs from the project root.
const fixture = (name: string) => readFileSync(`fixtures/${name}`, 'utf8');

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('parser + stages');

test('extracts a job URL from a bare link + blurb', () => {
  const r = parseLeadInput('Saw this, might be interesting https://jobs.acme.com/123 ping me');
  assert.equal(r.job_url, 'https://jobs.acme.com/123');
  assert.equal(r.suggestedStage, 'lead');
});

test('parses "Role at Company"', () => {
  const r = parseLeadInput('Senior Backend Engineer at Stripe');
  assert.equal(r.role, 'Senior Backend Engineer');
  assert.equal(r.company, 'Stripe');
});

test('no salary present → stays null (renders "unspecified", never guessed)', () => {
  const r = parseLeadInput('Data Engineer at Acme. Great team, remote-friendly.');
  assert.equal(r.salary_min, null);
  assert.equal(r.salary_max, null);
  assert.equal(r.salary_currency, null);
});

test('detects currency when a salary is clearly stated', () => {
  const r = parseLeadInput('Backend role, comp $120,000 base');
  assert.equal(r.salary_currency, 'USD');
});

test('empty input is safe', () => {
  const r = parseLeadInput('   ');
  assert.equal(r.company, null);
  assert.equal(r.job_url, null);
});

test('active + untouched 12 days = stale; terminal stage never stale', () => {
  const old = new Date(Date.now() - 12 * 864e5).toISOString();
  assert.equal(isStale('applied', old), true);
  assert.equal(isStale('rejected', old), false);
});

// --- Fixture-driven (fixtures/ is the "done" bar; see fixtures/README.md) -----
test('fixture: clean JD → role + company + url + currency, ready to apply', () => {
  const r = parseLeadInput(fixture('clean-jd.txt'));
  assert.equal(r.role, 'Senior Platform Engineer');
  assert.equal(r.company, 'Acme Corp');
  assert.ok(r.job_url?.startsWith('https://'));
  assert.equal(r.salary_currency, 'USD');
  assert.equal(r.suggestedStage, 'applied');
});

test('fixture: no-salary JD → salary stays null (never guessed)', () => {
  const r = parseLeadInput(fixture('no-salary-jd.txt'));
  assert.equal(r.salary_min, null);
  assert.equal(r.salary_max, null);
  assert.equal(r.salary_currency, null);
});

test('fixture: form-only lead → captures the link, suggests lead', () => {
  const r = parseLeadInput(fixture('form-only-lead.txt'));
  assert.ok(r.job_url?.startsWith('https://'));
  assert.equal(r.suggestedStage, 'lead');
});

test('fixture: messy recruiter InMail → never throws, extracts the link (rich parse = Wave B)', () => {
  const r = parseLeadInput(fixture('messy-recruiter-inmail.txt'));
  assert.ok(r.job_url?.startsWith('https://'));
});

console.log(`\n${passed} passed`);
