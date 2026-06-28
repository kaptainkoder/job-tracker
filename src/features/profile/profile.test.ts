import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Profile } from '../../shared/types';
import {
  baseResumePath,
  parseSkillsInput,
  profileFormToPayload,
  profileToForm,
  skillsToText,
  validatePdfFile,
  validateProfileForm,
  type ProfileFormValues,
} from './profile';

const values: ProfileFormValues = {
  full_name: ' Karan ',
  email: ' karan@example.com ',
  phone: ' ',
  current_title: ' Product Manager ',
  current_company: '',
  linkedin_url: ' https://www.linkedin.com/in/karan ',
  github_url: 'https://github.com/karan',
};

test('profile payload trims values and stores optional blanks as null', () => {
  assert.deepEqual(profileFormToPayload(values), {
    full_name: 'Karan',
    email: 'karan@example.com',
    phone: null,
    current_title: 'Product Manager',
    current_company: null,
    linkedin_url: 'https://www.linkedin.com/in/karan',
    github_url: 'https://github.com/karan',
  });
});

test('profile form hydrates nullable fields and falls back to the auth email', () => {
  assert.equal(profileToForm(null, 'owner@example.com').email, 'owner@example.com');

  const profile = {
    ...profileFormToPayload(values),
    id: 'owner-id',
    resume_path: null,
    skills: [],
    created_at: '2026-06-28T00:00:00Z',
    updated_at: '2026-06-28T00:00:00Z',
  } satisfies Profile;
  assert.equal(profileToForm(profile).phone, '');
  assert.equal(profileToForm(profile).full_name, 'Karan');
});

test('profile validation reports malformed email and web URLs', () => {
  const errors = validateProfileForm({
    ...values,
    email: 'not-an-email',
    linkedin_url: 'linkedin.com/in/karan',
    github_url: 'ftp://github.com/karan',
  });

  assert.ok(errors.email);
  assert.ok(errors.linkedin_url);
  assert.ok(errors.github_url);
  assert.deepEqual(validateProfileForm(values), {});
});

test('skills input parses lines, trims, drops blanks, and de-dupes case-insensitively', () => {
  assert.deepEqual(parseSkillsInput('XGBoost\n  Python  \n\nxgboost\nSQL'), ['XGBoost', 'Python', 'SQL']);
  assert.deepEqual(parseSkillsInput('   \n  '), []);
  assert.equal(skillsToText(['XGBoost', 'Python']), 'XGBoost\nPython');
  assert.equal(skillsToText(null), '');
});

test('base resume path is deterministic and owner-scoped', () => {
  assert.equal(baseResumePath('user-123'), 'user-123/base-resume.pdf');
});

test('PDF validation checks extension, content, and empty files', async () => {
  assert.equal(await validatePdfFile(new File(['%PDF-1.7\nfixture'], 'resume.pdf', { type: 'application/pdf' })), null);
  assert.equal(await validatePdfFile(new File(['plain text'], 'resume.pdf', { type: 'application/pdf' })), 'This file does not appear to be a valid PDF.');
  assert.equal(await validatePdfFile(new File(['%PDF-1.7'], 'resume.txt')), 'Choose a PDF file.');
  assert.equal(await validatePdfFile(new File([], 'resume.pdf', { type: 'application/pdf' })), 'The selected PDF is empty.');
});
