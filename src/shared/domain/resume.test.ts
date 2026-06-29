import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildStructuredResumeDocument,
  flattenResumeText,
  structuredResumeFilename,
  type StructuredResume,
} from './resume';
import {
  createStructuredResumePdf,
  structuredResumePdfBytes,
} from '../../features/tailor/resumePdf';

const resume = JSON.parse(
  readFileSync('fixtures/resume-structured-sample.json', 'utf8'),
) as StructuredResume;

// --- builder: fixed section order + empty-section dropping ------------------------------------

test('buildStructuredResumeDocument keeps the base-résumé section order', () => {
  const doc = buildStructuredResumeDocument(resume);
  assert.deepEqual(
    doc.sections.map((section) => section.kind),
    ['summary', 'awards', 'experience', 'projects', 'education', 'skills'],
  );
  // Headings match the locked labels.
  assert.deepEqual(
    doc.sections.map((section) => section.heading),
    ['Summary', 'Key Awards and Achievements', 'Experience', 'Projects', 'Education', 'Skills'],
  );
});

test('experience entries carry dates + location for the right-aligned layout', () => {
  const doc = buildStructuredResumeDocument(resume);
  const experience = doc.sections.find((s) => s.kind === 'experience')?.experience ?? [];
  assert.equal(experience.length, 4);
  assert.equal(experience[0].start, '07/2025');
  assert.equal(experience[0].end, 'Present');
  assert.equal(experience[0].location, 'Gurgaon, India');
  assert.ok(experience[0].bullets.length > 0);
});

test('missing sections are dropped, not rendered as empty placeholders', () => {
  const bare: StructuredResume = {
    contact: { fullName: 'Test User', title: 'Engineer', links: [] },
    summary: 'A summary.',
    awards: [],
    experience: [{ org: 'Org', title: 'Role', start: '2020', end: '2021', bullets: ['Did a thing.'] }],
    projects: [],
    education: [],
    skills: [{ label: 'Tech', items: [] }], // group with no items must also drop
  };
  const doc = buildStructuredResumeDocument(bare);
  assert.deepEqual(doc.sections.map((s) => s.kind), ['summary', 'experience']);
  assert.equal(doc.sections.find((s) => s.kind === 'awards'), undefined);
  assert.equal(doc.sections.find((s) => s.kind === 'skills'), undefined);
});

// --- only-confirmed-content (AC #2 / #5) ------------------------------------------------------

test('flattenResumeText draws only content present in the structured source', () => {
  const doc = buildStructuredResumeDocument(resume);
  const flat = flattenResumeText(doc);
  const joined = flat.join('\n');
  // Real confirmed content is present...
  assert.match(joined, /2024 Centurion Award/);
  assert.match(joined, /\$15M in annual incremental revenue/);
  assert.match(joined, /Modeling Super Bowl/);
  // ...and a JD keyword that is NOT in the source is never fabricated into the render text.
  assert.doesNotMatch(joined, /Kubernetes/i);
  assert.doesNotMatch(joined, /Rust/i);
  // Every flattened string is traceable to the JSON source (no invented tokens).
  const source = JSON.stringify(resume);
  for (const value of flat) {
    if (['Summary', 'Key Awards and Achievements', 'Experience', 'Projects', 'Education', 'Skills'].includes(value)) {
      continue; // section headings are structural labels, not source content
    }
    assert.ok(source.includes(value), `render string not found in source: "${value}"`);
  }
});

// --- deterministic A4 renderer ----------------------------------------------------------------

test('createStructuredResumePdf renders a single-column A4 vector PDF', () => {
  const pdf = createStructuredResumePdf(resume);
  assert.equal(Math.round(pdf.internal.pageSize.getWidth()), 210);
  const bytes = structuredResumePdfBytes(resume);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  assert.ok(bytes.byteLength > 1_000);
});

test('long content paginates instead of clipping', () => {
  const long: StructuredResume = {
    ...resume,
    experience: Array.from({ length: 30 }, (_, i) => ({
      org: `Org ${i}`,
      location: 'Somewhere',
      title: 'Role',
      start: '2020',
      end: '2021',
      scope: 'Scope line for the entry.',
      bullets: ['One evidence-backed responsibility line that takes up real space on the page.'],
    })),
  };
  const pdf = createStructuredResumePdf(long);
  assert.ok(pdf.getNumberOfPages() > 1, 'long content should paginate');
});

test('renderer registers the Inter font when supplied', () => {
  const interBase64 = readFileSync('src/assets/InterVariable.ttf').toString('base64');
  const pdf = createStructuredResumePdf(resume, interBase64);
  assert.deepEqual(pdf.getFontList().Inter.sort(), ['bold', 'normal']);
});

// --- filename ---------------------------------------------------------------------------------

test('structuredResumeFilename is stable, lowercased, and PII-free', () => {
  assert.equal(
    structuredResumeFilename(resume.contact, 'Senior Data Scientist'),
    'karan-virender-mahajan-senior-data-scientist-resume.pdf',
  );
  assert.equal(structuredResumeFilename({ fullName: '', title: '', links: [] }, null), 'resume.pdf');
});
