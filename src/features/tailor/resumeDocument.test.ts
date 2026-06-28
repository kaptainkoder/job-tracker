import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Application, Profile } from '../../shared/types';
import {
  buildResumeDocument,
  safeResumeFilename,
} from './resumeDocument';
import { createResumePdf, resumePdfBytes } from './resumePdf';

const profile: Profile = {
  id: 'u1', full_name: 'Karan', email: 'karan@example.com', phone: null,
  current_title: 'Data Engineer', current_company: 'Example Co',
  linkedin_url: 'https://linkedin.com/in/karan', github_url: null,
  resume_path: null, skills: ['Python', 'SQL', 'Data pipelines'],
  created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
};

const application = {
  company: 'Acme & Sons',
  role: 'Senior Data Engineer',
} as Application;

const fixture = readFileSync('fixtures/tailored-resume-sample.md', 'utf8');

test('buildResumeDocument structures the saved artifact without inventing missing contact data', () => {
  const document = buildResumeDocument({ content: fixture, profile, application });
  assert.equal(document.name, 'Karan');
  assert.equal(document.headline, 'Data Engineer · Example Co');
  assert.equal(document.tailoredFor, 'Tailored for Senior Data Engineer at Acme & Sons');
  assert.deepEqual(document.contact, ['karan@example.com', 'linkedin.com/in/karan']);
  assert.deepEqual(document.skills, ['Python', 'SQL', 'Data pipelines']);
  assert.deepEqual(document.sections.map((section) => section.heading), ['Summary', 'Selected impact', 'Experience']);
  assert.equal(document.sections[1].items[0].kind, 'bullet');
  assert.doesNotMatch(JSON.stringify(document), /(^|[^a-z])null([^a-z]|$)/i);
});

test('client-side renderer produces vector A4 PDF bytes and paginates long content', () => {
  const longContent = `${fixture}\n\n## More evidence\n${'- Evidence-backed production responsibility.\n'.repeat(180)}`;
  const document = buildResumeDocument({ content: longContent, profile, application });
  const pdf = createResumePdf(document);
  assert.equal(pdf.internal.pageSize.getWidth(), 210.0015555555555);
  assert.ok(pdf.getNumberOfPages() > 1, 'long content should paginate instead of clipping');
  const bytes = resumePdfBytes(document);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  assert.ok(bytes.byteLength > 1_000);

  const interBase64 = readFileSync('src/assets/InterVariable.ttf').toString('base64');
  const interPdf = createResumePdf(document, interBase64);
  assert.deepEqual(interPdf.getFontList().Inter.sort(), ['bold', 'normal']);
});

test('download filename is stable and strips unsafe punctuation', () => {
  assert.equal(safeResumeFilename(application, profile.full_name), 'karan-acme-sons-senior-data-engineer-resume.pdf');
});
