import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StructuredResume } from '../../shared/domain/resume';
import { flattenStructuredSkills, structuredToProfilePayload } from './profileSync';

function baseResume(overrides: Partial<StructuredResume> = {}): StructuredResume {
  return {
    contact: {
      fullName: ' Karan Mahajan ',
      title: ' Manager - Data Science ',
      phone: ' +91 99999 ',
      email: ' karan@example.com ',
      location: 'Gurgaon, India',
      links: [
        { label: 'LinkedIn Profile', url: ' https://linkedin.com/in/karan ' },
        { label: 'GitHub', url: 'https://github.com/karan' },
        { label: 'Portfolio', url: 'https://karan.dev' },
      ],
    },
    summary: '',
    experience: [
      { org: 'American Express', title: 'Manager', location: '', start: '07/2025', end: 'Present', bullets: [] },
      { org: 'Prior Co', title: 'Analyst', location: '', start: '2020', end: '2025', bullets: [] },
    ],
    education: [],
    skills: [
      { label: 'Technology', items: [' Python ', 'SQL', 'python'] },
      { label: 'ML', items: ['XGBoost', ''] },
    ],
    awards: [],
    projects: [],
    ...overrides,
  };
}

test('structuredToProfilePayload mirrors contact fields, trimmed', () => {
  const p = structuredToProfilePayload(baseResume());
  assert.equal(p.full_name, 'Karan Mahajan');
  assert.equal(p.current_title, 'Manager - Data Science');
  assert.equal(p.phone, '+91 99999');
  assert.equal(p.email, 'karan@example.com');
});

test('current_company comes from the most recent (top) experience org', () => {
  assert.equal(structuredToProfilePayload(baseResume()).current_company, 'American Express');
  // No experience → null, not a crash.
  assert.equal(structuredToProfilePayload(baseResume({ experience: [] })).current_company, null);
});

test('linkedin/github URLs matched by label (case-insensitive substring), trimmed', () => {
  const p = structuredToProfilePayload(baseResume());
  assert.equal(p.linkedin_url, 'https://linkedin.com/in/karan');
  assert.equal(p.github_url, 'https://github.com/karan');
});

test('missing links mirror to null', () => {
  const p = structuredToProfilePayload(baseResume({ contact: { ...baseResume().contact, links: [] } }));
  assert.equal(p.linkedin_url, null);
  assert.equal(p.github_url, null);
});

test('skills flatten across groups, trim, drop empties, dedup case-insensitively', () => {
  assert.deepEqual(flattenStructuredSkills(baseResume()), ['Python', 'SQL', 'XGBoost']);
  assert.deepEqual(structuredToProfilePayload(baseResume()).skills, ['Python', 'SQL', 'XGBoost']);
});
