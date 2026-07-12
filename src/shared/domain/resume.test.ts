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
  analyzeStructuredResumeBulletWidths,
  analyzeStructuredResumeLayout,
  createStructuredResumePdf,
  splitMetricRuns,
  STRUCTURED_RESUME_BULLET_AVAILABLE_WIDTH_MM,
  STRUCTURED_RESUME_BULLET_FONT_SIZE_PT,
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

test('the representative redacted fixture is not tiny-text compressed onto one A4 page', () => {
  const interBase64 = readFileSync('src/assets/InterVariable.ttf').toString('base64');
  // The pre-tailoring source is intentionally too dense. It must fail visibly rather than silently
  // shrinking to the rejected 60% scale; the holistic editor is responsible for a truthful one-page
  // selection before the result can pass the final gate.
  assert.ok(createStructuredResumePdf(resume, interBase64).getNumberOfPages() > 1);
  assert.ok(createStructuredResumePdf(resume).getNumberOfPages() > 1);
});

// --- strict single-line semantic bullets (2026-07-02 editorial repair) --------------------------

test('exact Inter/jsPDF width contract distinguishes fit from overflow without rewriting', () => {
  const interBase64 = readFileSync('src/assets/InterVariable.ttf').toString('base64');
  const [fit, overflow] = analyzeStructuredResumeBulletWidths([
    'Built a useful model that drove $15M in revenue.',
    'This deliberately overlong semantic bullet '.repeat(12).trim(),
  ], interBase64);
  assert.equal(fit.availableWidthMm, STRUCTURED_RESUME_BULLET_AVAILABLE_WIDTH_MM);
  assert.ok(fit.measuredWidthMm > 0);
  assert.ok(fit.fillRatio < 1);
  assert.equal(fit.overflowMm, 0);
  assert.equal(fit.fitsSingleLine, true);
  assert.ok(overflow.measuredWidthMm > overflow.availableWidthMm);
  assert.ok(overflow.fillRatio > 1);
  assert.ok(overflow.overflowMm > 0);
  assert.equal(overflow.fitsSingleLine, false);
});

test('both approved semantic rewrites fit one Inter line and nearly fill it', () => {
  const interBase64 = readFileSync('src/assets/InterVariable.ttf').toString('base64');
  const approved = [
    'Built an S-learner XGBoost balance model that improved targeting precision and drove $15M in annual incremental revenue.',
    'Built a GPT-powered feature discovery solution that generated 10+ novel features for the high-spend decliner segment.',
  ];
  const measurements = analyzeStructuredResumeBulletWidths(approved, interBase64);
  assert.deepEqual(measurements.map((item) => item.text), approved);
  assert.ok(measurements.every((item) => item.fitsSingleLine));
  assert.ok(measurements.every((item) => item.fillRatio >= 0.9 && item.fillRatio <= 1.001));
});

test('representative structured fixture uses normal typography and exposes page and bullet overflow', () => {
  const interBase64 = readFileSync('src/assets/InterVariable.ttf').toString('base64');
  const diagnostics = analyzeStructuredResumeLayout(resume, interBase64);
  assert.ok(diagnostics.pageCount > 1);
  assert.equal(diagnostics.fitsSinglePage, false);
  assert.equal(diagnostics.hasPageOverflow, true);
  assert.equal(diagnostics.bulletFontSizePt, STRUCTURED_RESUME_BULLET_FONT_SIZE_PT);
  assert.ok(diagnostics.bulletFontSizePt >= 8);
  assert.ok(diagnostics.minRelevantFontSizePt >= 7);
  assert.ok(diagnostics.contentBottomMm <= diagnostics.usableBottomMm);
  assert.ok(diagnostics.utilization > 1);
  assert.ok(diagnostics.overflows.length > 0, 'the rejected legacy wording must fail the strict gate');
  assert.equal(diagnostics.hasClipping, true);
  assert.equal(diagnostics.isValid, false);
});

test('the full redacted fixture is rejected before public structured-PDF bytes', () => {
  const interBase64 = readFileSync('src/assets/InterVariable.ttf').toString('base64');
  assert.throws(
    () => structuredResumePdfBytes(resume, interBase64),
    /Structured résumé PDF blocked: \d+ bullets exceeded the measured line width\./,
  );
  // The diagnostic renderer remains available to measure the rejected document.
  assert.ok(createStructuredResumePdf(resume, interBase64).getNumberOfPages() > 1);
});

test('a complete-section one-page result with approved bullets passes without clipping', () => {
  const interBase64 = readFileSync('src/assets/InterVariable.ttf').toString('base64');
  const approved: StructuredResume = {
    contact: { fullName: 'Test User', title: 'Data Scientist', links: [], location: 'India' },
    summary: 'Data scientist building measurable, production-ready machine-learning products.',
    awards: [{ title: 'Impact Award', detail: 'Recognized for measurable commercial results' }],
    experience: [{
      org: 'Example Company',
      location: 'India',
      title: 'Data Scientist',
      start: '2024',
      end: 'Present',
      bullets: [
        'Built an S-learner XGBoost balance model that improved targeting precision and drove $15M in annual incremental revenue.',
        'Built a GPT-powered feature discovery solution that generated 10+ novel features for the high-spend decliner segment.',
      ],
    }],
    projects: [{ name: 'Modeling Project', bullets: ['Built a reproducible model evaluation pipeline.'] }],
    education: [{ school: 'Example University', degree: 'BSc, Statistics', start: '2021', end: '2024' }],
    skills: [{ label: 'Modeling', items: ['XGBoost', 'Python', 'Experimentation'] }],
  };
  const diagnostics = analyzeStructuredResumeLayout(approved, interBase64);
  assert.equal(diagnostics.pageCount, 1);
  assert.equal(diagnostics.hasPageOverflow, false);
  assert.equal(diagnostics.overflows.length, 0);
  assert.equal(diagnostics.hasClipping, false);
  assert.equal(diagnostics.isValid, true);
  const bytes = structuredResumePdfBytes(approved, interBase64);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  assert.ok(bytes.byteLength > 1_000);
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
