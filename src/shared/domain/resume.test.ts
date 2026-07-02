import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildStructuredResumeDocument,
  flattenResumeText,
  parseStructuredResumeJson,
  structuredResumeFilename,
  type StructuredResume,
} from './resume';
import {
  createStructuredResumePdf,
  splitMetricRuns,
  structuredResumePdfBytes,
  wrapBulletForWidth,
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

test('the real fixture résumé renders on exactly ONE A4 page (B6.4-R)', () => {
  const interBase64 = readFileSync('src/assets/InterVariable.ttf').toString('base64');
  // With the bundled font (the production path) the full real résumé must fit on a single page.
  assert.equal(createStructuredResumePdf(resume, interBase64).getNumberOfPages(), 1);
  // …and the same with the fallback font, so the one-page invariant never depends on font loading.
  assert.equal(createStructuredResumePdf(resume).getNumberOfPages(), 1);
});

// --- semantic bullets: visual wrapping never creates a second bullet (2026-07-02 repair) ---------

test('wrapBulletForWidth keeps a fitting semantic bullet whole', () => {
  const measure = (line: string) => line.length; // width == char count
  assert.deepEqual(wrapBulletForWidth('Short bullet.', 40, measure), ['Short bullet.']);
});

test('wrapBulletForWidth wraps visually without changing words or semantic bullet identity', () => {
  const measure = (line: string) => line.length;
  const bullet =
    'Led end-to-end development of an s-learner XGBoost model, driving $15M in annual revenue.';
  const lines = wrapBulletForWidth(bullet, 60, measure);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => measure(line) <= 60));
  assert.equal(lines.join(' '), bullet, 'visual wrapping must preserve the semantic bullet verbatim');
  assert.match(lines[1], /\$15M/, 'the continuation carries the metric without becoming a new bullet');
});

test('wrapBulletForWidth never breaks a decimal/metric token', () => {
  const measure = (line: string) => line.length;
  const lines = wrapBulletForWidth('Improved lift by 41.25% and cut cost by 18%.', 30, measure);
  assert.match(lines.join(' '), /41\.25%/);
});

test('an unsplittable over-wide clause stays one bullet (caller floor-shrinks it, no clip)', () => {
  const measure = (line: string) => line.length;
  const oneClause = 'Supercalifragilisticexpialidocious'.repeat(3);
  assert.deepEqual(wrapBulletForWidth(oneClause, 10, measure), [oneClause]);
});

test('a résumé with long bullets still renders on exactly ONE A4 page (uniform sizing holds fit)', () => {
  const interBase64 = readFileSync('src/assets/InterVariable.ttf').toString('base64');
  const longBullets: StructuredResume = {
    ...resume,
    experience: resume.experience.map((exp) => ({
      ...exp,
      bullets: exp.bullets.map(
        (b) => `${b} Additionally partnered with cross-functional stakeholders, drove adoption, and documented the approach.`,
      ),
    })),
  };
  assert.equal(createStructuredResumePdf(longBullets, interBase64).getNumberOfPages(), 1);
});

test('splitMetricRuns bolds metric tokens and leaves prose normal (B6.4-R)', () => {
  const runs = splitMetricRuns('Drove $15M revenue and a 41.25% lift at 5x speed');
  const bold = runs.filter((r) => r.bold).map((r) => r.text);
  assert.deepEqual(bold, ['$15M', '41.25%', '5x']);
  // Round-trip: concatenating the runs reproduces the original text exactly (no loss/duplication).
  assert.equal(runs.map((r) => r.text).join(''), 'Drove $15M revenue and a 41.25% lift at 5x speed');
  // Prose with no metric is a single normal run.
  const plain = splitMetricRuns('Led the platform team');
  assert.deepEqual(plain, [{ text: 'Led the platform team', bold: false }]);
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

// --- parseStructuredResumeJson: round-trip persisted résumé, reject legacy/garbage ----------------

test('parseStructuredResumeJson round-trips a persisted StructuredResume', () => {
  const parsed = parseStructuredResumeJson(JSON.stringify(resume));
  assert.ok(parsed, 'a well-formed StructuredResume JSON must parse');
  // Deep round-trip: the re-rendered text matches the source résumé exactly (no loss, no invention).
  assert.deepEqual(
    flattenResumeText(buildStructuredResumeDocument(parsed!)),
    flattenResumeText(buildStructuredResumeDocument(resume)),
  );
});

test('parseStructuredResumeJson rejects legacy Markdown and garbage (caller falls back)', () => {
  assert.equal(parseStructuredResumeJson('# Tailored résumé\n\n## Summary\n- Did things'), null);
  assert.equal(parseStructuredResumeJson('not json at all'), null);
  assert.equal(parseStructuredResumeJson('{"contact":{"fullName":"X"}}'), null, 'missing title/arrays → null');
  assert.equal(parseStructuredResumeJson('[]'), null, 'array root → null');
  assert.equal(parseStructuredResumeJson('null'), null);
  assert.equal(parseStructuredResumeJson(''), null);
});
