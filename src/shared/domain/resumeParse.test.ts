import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildParseResumeMessages,
  parseStructuredResumeResponse,
  emptyStructuredResume,
  isParseResumeAction,
  PARSE_RESUME_ACTION,
  PARSE_RESUME_CATEGORIES,
} from './resumeParse';
import { buildStructuredResumeDocument, flattenResumeText, type StructuredResume } from './resume';

const sample = JSON.parse(
  readFileSync('fixtures/resume-structured-sample.json', 'utf8'),
) as StructuredResume;

// --- contract / manifest ------------------------------------------------------------------------

test('parse messages put the no-fabrication extractor contract first, résumé text second', () => {
  const messages = buildParseResumeMessages({ resumeText: 'Karan Mahajan\nManager - Data Science' });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /EXTRACTOR/);
  assert.match(messages[0].content, /Never invent/);
  assert.equal(messages[1].role, 'user');
  assert.match(messages[1].content, /Karan Mahajan/);
});

test('parse manifest sends the whole résumé (incl. contact) but never salary', () => {
  assert.ok(PARSE_RESUME_CATEGORIES.includes('resume'));
  assert.ok(PARSE_RESUME_CATEGORIES.includes('contact-info'));
  assert.ok(!PARSE_RESUME_CATEGORIES.includes('salary'));
  assert.ok(isParseResumeAction(PARSE_RESUME_ACTION));
  assert.ok(!isParseResumeAction('tailor'));
});

// --- tolerant parsing -------------------------------------------------------------------------

test('parses a clean JSON object into a StructuredResume', () => {
  const resume = parseStructuredResumeResponse(JSON.stringify(sample));
  assert.ok(resume);
  assert.equal(resume.contact.fullName, sample.contact.fullName);
  assert.equal(resume.experience.length, sample.experience.length);
  assert.deepEqual(resume.experience[0].bullets, sample.experience[0].bullets);
});

test('strips a ```json fence and surrounding prose', () => {
  const fenced = 'Here is the result:\n```json\n' + JSON.stringify(sample) + '\n```\nDone.';
  const resume = parseStructuredResumeResponse(fenced);
  assert.ok(resume);
  assert.equal(resume.contact.fullName, sample.contact.fullName);
});

test('returns null on irrecoverable garbage (no JSON object)', () => {
  assert.equal(parseStructuredResumeResponse(''), null);
  assert.equal(parseStructuredResumeResponse('no json here'), null);
  assert.equal(parseStructuredResumeResponse('{ not valid json'), null);
});

test('drops malformed entries instead of coercing them into fabricated content', () => {
  const messy = {
    contact: { fullName: 'Karan Mahajan', title: '', links: [{ url: 'x' }, { label: 'GitHub', url: 'g' }] },
    summary: '   ',
    awards: [{ detail: 'orphan detail, no title' }, { title: '2024 Centurion Award' }],
    experience: [
      { bullets: ['floating bullet, no org or title'] }, // dropped: no org AND no title
      { org: 'American Express', title: 'Manager', start: '2025', end: 'Present', bullets: ['Did X', '  '] },
    ],
    projects: 'not an array',
    education: [{ degree: 'MSc' }], // dropped: no school
    skills: [{ items: [] }, { label: 'Tech', items: ['Python', 'SQL', ''] }],
  };
  const resume = parseStructuredResumeResponse(JSON.stringify(messy));
  assert.ok(resume);
  assert.equal(resume.contact.title, ''); // missing → empty, never invented
  assert.equal(resume.contact.links.length, 1); // the label-less link dropped
  assert.equal(resume.awards.length, 1); // orphan-detail award dropped
  assert.equal(resume.experience.length, 1); // org/title-less entry dropped
  assert.deepEqual(resume.experience[0].bullets, ['Did X']); // blank bullet dropped
  assert.deepEqual(resume.projects, []); // non-array → empty
  assert.equal(resume.education.length, 0); // school-less entry dropped
  assert.equal(resume.skills.length, 1); // empty group dropped, blank item trimmed
  assert.deepEqual(resume.skills[0].items, ['Python', 'SQL']);
});

test('only-confirmed-content: every rendered string traces back to the parsed JSON', () => {
  const resume = parseStructuredResumeResponse(JSON.stringify(sample));
  assert.ok(resume);
  const rendered = flattenResumeText(buildStructuredResumeDocument(resume));
  const sourceBlob = JSON.stringify(sample);
  for (const piece of rendered) {
    // Section headings are renderer-owned labels, not résumé content — skip those.
    if (['Summary', 'Key Awards and Achievements', 'Experience', 'Projects', 'Education', 'Skills'].includes(piece)) {
      continue;
    }
    assert.ok(sourceBlob.includes(piece), `rendered string not in source JSON: ${piece}`);
  }
});

test('emptyStructuredResume is a valid, content-free StructuredResume', () => {
  const empty = emptyStructuredResume();
  const doc = buildStructuredResumeDocument(empty);
  assert.equal(doc.sections.length, 0); // nothing to render → no fabricated placeholders
});
