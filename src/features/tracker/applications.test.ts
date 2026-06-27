import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Application } from '../../shared/types';
import { parseLeadInput } from '../../shared/domain/parser';
import {
  EMPTY_APPLICATION_FORM,
  SALARY_UNSPECIFIED,
  applicationFormToPayload,
  applicationToForm,
  applyStageChange,
  countStale,
  formatRelativeActivity,
  formatSalary,
  groupByStage,
  parsedLeadToForm,
  validateApplicationForm,
  type ApplicationFormValues,
} from './applications';

// Fixtures are read relative to cwd — `npm test` always runs from the project root.
const fixture = (name: string) => readFileSync(`fixtures/${name}`, 'utf8');

const salaryOf = (over: Partial<Application>): Application =>
  ({
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    ...over,
  }) as Application;

test('salary renders a currency range, single value, open-ended, and period suffix', () => {
  assert.equal(
    formatSalary(salaryOf({ salary_min: 150000, salary_max: 185000, salary_currency: 'USD' })),
    '$150,000–$185,000',
  );
  assert.equal(formatSalary(salaryOf({ salary_min: 120000, salary_max: 120000 })), '120,000');
  assert.equal(
    formatSalary(salaryOf({ salary_min: 90000, salary_currency: 'EUR', salary_period: 'year' })),
    '€90,000+/yr',
  );
  assert.equal(
    formatSalary(salaryOf({ salary_max: 50, salary_currency: 'GBP', salary_period: 'hour' })),
    'up to £50/hr',
  );
  assert.equal(
    formatSalary(salaryOf({ salary_min: 15000, salary_currency: 'CAD' })),
    'CAD 15,000+',
  );
});

test('salary is "unspecified" whenever no amounts are present (never guessed)', () => {
  assert.equal(formatSalary(salaryOf({})), SALARY_UNSPECIFIED);
  assert.equal(formatSalary(salaryOf({ salary_currency: 'USD' })), SALARY_UNSPECIFIED);
});

test('fixture: no-salary JD parses to no amounts → form keeps salary blank → "unspecified"', () => {
  const form = parsedLeadToForm(parseLeadInput(fixture('no-salary-jd.txt')));
  assert.equal(form.salary_min, '');
  assert.equal(form.salary_max, '');
  const payload = applicationFormToPayload({ ...form, company: 'Globex', role: 'Data Engineer' });
  assert.equal(formatSalary(payload as Application), SALARY_UNSPECIFIED);
});

test('fixture: clean JD prefills company, role, url, currency and suggests applied', () => {
  const form = parsedLeadToForm(parseLeadInput(fixture('clean-jd.txt')));
  assert.equal(form.company, 'Acme Corp');
  assert.equal(form.role, 'Senior Platform Engineer');
  assert.ok(form.job_url.startsWith('https://'));
  assert.equal(form.salary_currency, 'USD');
  assert.equal(form.stage, 'applied');
});

test('relative last-activity reads naturally across ranges', () => {
  const now = new Date('2026-06-28T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  assert.equal(formatRelativeActivity(ago(0), now), 'just now');
  assert.equal(formatRelativeActivity(ago(5 * 60 * 60 * 1000), now), 'today');
  assert.equal(formatRelativeActivity(ago(1 * 864e5), now), 'yesterday');
  assert.equal(formatRelativeActivity(ago(2 * 864e5), now), '2d ago');
  assert.equal(formatRelativeActivity(ago(14 * 864e5), now), '2w ago');
  assert.equal(formatRelativeActivity(ago(60 * 864e5), now), '2mo ago');
});

test('groupByStage returns every stage in pipeline order, most recent first', () => {
  const mk = (id: string, stage: Application['stage'], last: string): Application =>
    ({ id, stage, last_activity_at: last } as Application);
  const groups = groupByStage([
    mk('a', 'applied', '2026-06-20T00:00:00Z'),
    mk('b', 'lead', '2026-06-27T00:00:00Z'),
    mk('c', 'applied', '2026-06-26T00:00:00Z'),
  ]);
  assert.deepEqual(
    groups.map((g) => g.stage),
    ['lead', 'applied', 'interviewing', 'offer', 'rejected'],
  );
  assert.deepEqual(groups[1].apps.map((a) => a.id), ['c', 'a']);
  assert.equal(groups[2].apps.length, 0);
});

test('countStale flags only active apps untouched for the stale window', () => {
  const now = new Date('2026-06-28T00:00:00Z');
  const old = new Date(now.getTime() - 12 * 864e5).toISOString();
  const fresh = new Date(now.getTime() - 1 * 864e5).toISOString();
  const mk = (stage: Application['stage'], last: string): Application =>
    ({ stage, last_activity_at: last } as Application);
  assert.equal(
    countStale([mk('applied', old), mk('lead', fresh), mk('rejected', old), mk('offer', old)], now),
    1,
  );
});

test('form payload trims required fields, nulls blanks, and parses salary numbers', () => {
  const values: ApplicationFormValues = {
    ...EMPTY_APPLICATION_FORM,
    company: '  Acme  ',
    role: '  Engineer ',
    job_url: '',
    salary_min: '120,000',
    salary_max: '150000',
    salary_currency: 'USD',
    notes: '  ',
  };
  assert.deepEqual(applicationFormToPayload(values), {
    company: 'Acme',
    role: 'Engineer',
    stage: 'lead',
    priority: 'medium',
    job_url: null,
    job_location: null,
    salary_min: 120000,
    salary_max: 150000,
    salary_currency: 'USD',
    notes: null,
  });
});

test('a currency with no amounts is dropped (would otherwise render oddly)', () => {
  const payload = applicationFormToPayload({
    ...EMPTY_APPLICATION_FORM,
    company: 'Acme',
    role: 'Engineer',
    salary_currency: 'USD',
  });
  assert.equal(payload.salary_currency, null);
});

test('validation requires company + role and rejects bad url / salary', () => {
  const errors = validateApplicationForm({
    ...EMPTY_APPLICATION_FORM,
    company: '',
    role: '',
    job_url: 'acme.com/jobs',
    salary_min: 'lots',
    salary_max: '100',
  });
  assert.ok(errors.company);
  assert.ok(errors.role);
  assert.ok(errors.job_url);
  assert.ok(errors.salary_min);

  const bounds = validateApplicationForm({
    ...EMPTY_APPLICATION_FORM,
    company: 'Acme',
    role: 'Engineer',
    salary_min: '200000',
    salary_max: '100000',
  });
  assert.ok(bounds.salary_max);

  assert.deepEqual(
    validateApplicationForm({ ...EMPTY_APPLICATION_FORM, company: 'Acme', role: 'Engineer' }),
    {},
  );
});

test('applicationToForm round-trips nullable columns to blank strings', () => {
  const app = {
    company: 'Acme',
    role: 'Engineer',
    stage: 'interviewing',
    priority: 'high',
    job_url: null,
    job_location: null,
    salary_min: null,
    salary_max: 90000,
    salary_currency: 'USD',
    notes: null,
  } as Application;
  const form = applicationToForm(app);
  assert.equal(form.job_url, '');
  assert.equal(form.salary_min, '');
  assert.equal(form.salary_max, '90000');
  assert.equal(form.stage, 'interviewing');
});

test('stage change bumps activity and records date_applied once', () => {
  const now = new Date('2026-06-28T09:30:00Z');
  const toApplied = applyStageChange({ date_applied: null }, 'applied', now);
  assert.equal(toApplied.stage, 'applied');
  assert.equal(toApplied.last_activity_at, now.toISOString());
  assert.equal(toApplied.date_applied, '2026-06-28');

  // Already applied earlier → don't overwrite the original apply date.
  const later = applyStageChange({ date_applied: '2026-06-01' }, 'interviewing', now);
  assert.equal(later.date_applied, undefined);

  // Moving to lead never sets an apply date.
  const toLead = applyStageChange({ date_applied: null }, 'lead', now);
  assert.equal(toLead.date_applied, undefined);
});
