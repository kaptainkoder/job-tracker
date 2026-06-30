import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  applyTailoredResume,
  buildResumeNumbers,
  buildTailorMessages,
  buildTailorResumeMessages,
  FOREIGN_TECH_DENYLIST,
  groundReword,
  isTailorAction,
  parseTailoredResumePatch,
  TAILOR_ACTIONS,
  TAILOR_PRIVACY_ACTION,
  tailorIncludedCategories,
  tailorStructuredResume,
  type TailorContext,
} from './tailor';
import { flattenResumeText, buildStructuredResumeDocument, type StructuredResume } from './resume';

// A representative context: one confirmed (evidenced) addition and one declined gap.
function ctx(action: TailorContext['action']): TailorContext {
  return {
    action,
    company: 'Acme',
    role: 'Senior Data Engineer',
    jdText: 'We need strong Python, SQL, and Kubernetes experience.',
    profile: {
      fullName: 'Karan M',
      email: 'karan@example.com',
      phone: '+1 555 0100',
      currentTitle: 'Data Engineer',
      currentCompany: 'Globex',
      linkedinUrl: 'https://linkedin.com/in/karan',
      githubUrl: 'https://github.com/karan',
      skills: ['Python', 'SQL'],
    },
    truthfulAdditions: [{ skill: 'kubernetes', evidence: 'Ran a 12-node k8s cluster at Globex for 2 years.' }],
    futureSuggestions: ['terraform'],
  };
}

// --- action vocabulary ------------------------------------------------------------------------

test('isTailorAction accepts the three actions and rejects others', () => {
  for (const a of TAILOR_ACTIONS) assert.equal(isTailorAction(a), true);
  for (const bad of ['echo', 'ping', 'tailor-resume', '', null, 42]) {
    assert.equal(isTailorAction(bad), false);
  }
});

test('privacy-log action slugs match the locked vocabulary', () => {
  assert.equal(TAILOR_PRIVACY_ACTION.tailor, 'tailor-resume');
  assert.equal(TAILOR_PRIVACY_ACTION.cover, 'cover-letter');
  assert.equal(TAILOR_PRIVACY_ACTION.prep, 'prep-questions');
});

// --- included categories drive the manifest ---------------------------------------------------

test('tailor + prep send JD/profile/work/skills but NOT contact-info', () => {
  for (const action of ['tailor', 'prep'] as const) {
    const cats = tailorIncludedCategories(ctx(action));
    assert.deepEqual([...cats].sort(), ['job-description', 'profile-summary', 'skills', 'work-history']);
    assert.equal(cats.includes('contact-info'), false);
  }
});

test('cover letter adds contact-info (so the gate re-prompts every time)', () => {
  const cats = tailorIncludedCategories(ctx('cover'));
  assert.equal(cats.includes('contact-info'), true);
});

test('contact details appear only in cover payloads, matching the privacy manifest', () => {
  for (const action of ['tailor', 'prep'] as const) {
    const [, user] = buildTailorMessages(ctx(action));
    assert.doesNotMatch(user.content, /karan@example\.com|\+1 555 0100|linkedin\.com|github\.com/);
  }
  const [, cover] = buildTailorMessages(ctx('cover'));
  assert.match(cover.content, /karan@example\.com/);
  assert.match(cover.content, /\+1 555 0100/);
  assert.match(cover.content, /linkedin\.com/);
  assert.match(cover.content, /github\.com/);
});

// --- no-fabrication contract in the assembled messages ----------------------------------------

test('system message carries the hard no-fabrication rule', () => {
  const [system] = buildTailorMessages(ctx('tailor'));
  assert.equal(system.role, 'system');
  assert.match(system.content, /never invent/i);
  assert.match(system.content, /do NOT claim it/i);
});

test('user message embeds JD, role, and the evidenced truthful addition', () => {
  const [, user] = buildTailorMessages(ctx('tailor'));
  assert.equal(user.role, 'user');
  assert.match(user.content, /Senior Data Engineer/);
  assert.match(user.content, /strong Python, SQL, and Kubernetes/);
  // The confirmed addition appears with its evidence under the "safe to use" section.
  assert.match(user.content, /Confirmed truthful additions[\s\S]*Kubernetes: Ran a 12-node/);
});

test('declined gaps appear ONLY under the do-not-claim fence, never as experience', () => {
  const [, user] = buildTailorMessages(ctx('tailor'));
  const lines = user.content.split('\n');
  const fenceIdx = lines.findIndex((l) => /Do NOT claim these/i.test(l));
  const terraformIdx = lines.findIndex((l) => /Terraform/.test(l));
  assert.ok(fenceIdx >= 0, 'expected a do-not-claim fence');
  assert.ok(terraformIdx >= 0, 'expected the declined skill to be listed');
  // The only mention of the declined skill is after the fence (i.e. in the growth-only section).
  assert.equal(user.content.match(/Terraform/g)?.length, 1);
  assert.ok(terraformIdx > fenceIdx, 'declined skill must sit under the do-not-claim fence');
});

test('empty resolution buckets render as "(none)", not a fabricated claim', () => {
  const bare = ctx('cover');
  delete bare.truthfulAdditions;
  delete bare.futureSuggestions;
  const [, user] = buildTailorMessages(bare);
  assert.match(user.content, /safe to use\):\n\(none\)/);
  assert.match(user.content, /future growth, never as experience:\n\(none\)/);
});

// ================================================================================================
// B6.2 — structured, format-faithful tailoring (reword/reorder over a locked structural skeleton)
// ================================================================================================

const resume = JSON.parse(
  readFileSync('fixtures/resume-structured-sample.json', 'utf8'),
) as StructuredResume;

// --- the structured-output contract (messages) ------------------------------------------------

test('buildTailorResumeMessages carries the no-fabrication + JSON-only reword contract', () => {
  const [system, user] = buildTailorResumeMessages({
    company: 'Mastercard',
    role: 'Data Scientist II',
    jdText: 'We need Kubernetes, Rust, and real-time fraud detection.',
    resume,
  });
  assert.equal(system.role, 'system');
  assert.match(system.content, /never invent/i);
  assert.match(system.content, /REWORD and REORDER/);
  assert.match(system.content, /ONLY a single JSON object/);
  // Layout-bearing sections are explicitly withheld from the model (locked, deterministic render).
  assert.match(system.content, /kept verbatim from the[\s\S]*source/i);
  assert.equal(user.role, 'user');
  assert.match(user.content, /Data Scientist II/);
  assert.match(user.content, /Kubernetes, Rust/);
  // The model is shown indexed experience entries to reference by ref.
  assert.match(user.content, /\[0\] Global Financial Services Co\. — Manager - Data Science/);
});

test('the structured tailor prompt never leaks contact-info (manifest parity with prose path)', () => {
  const [, user] = buildTailorResumeMessages({
    company: 'X',
    role: 'Y',
    jdText: 'Z',
    resume,
  });
  assert.doesNotMatch(user.content, /redacted@example\.com|000-000-0000|linkedin\.com/);
});

// --- the tolerant parser ----------------------------------------------------------------------

test('parseTailoredResumePatch strips a ```json fence and validates the shape', () => {
  const raw = '```json\n{"summary":"Reworded.","experience":[{"ref":0,"bullets":["a","b"]}]}\n```';
  const patch = parseTailoredResumePatch(raw);
  assert.ok(patch);
  assert.equal(patch?.summary, 'Reworded.');
  assert.deepEqual(patch?.experience, [{ ref: 0, bullets: ['a', 'b'] }]);
});

test('parseTailoredResumePatch isolates a JSON object embedded in stray prose', () => {
  const raw = 'Here you go:\n{"experience":[{"ref":1,"bullets":["x"]}]}\nHope that helps!';
  const patch = parseTailoredResumePatch(raw);
  assert.deepEqual(patch?.experience, [{ ref: 1, bullets: ['x'] }]);
});

test('parseTailoredResumePatch rejects garbage and malformed entries', () => {
  assert.equal(parseTailoredResumePatch('not json'), null);
  assert.equal(parseTailoredResumePatch(''), null);
  assert.equal(parseTailoredResumePatch('{"experience":"nope"}'), null);
  // An entry with a non-integer ref or non-string bullets is dropped, not coerced.
  const patch = parseTailoredResumePatch(
    '{"experience":[{"ref":0,"bullets":["ok"]},{"ref":1.5,"bullets":["x"]},{"ref":2,"bullets":[3]}]}',
  );
  assert.deepEqual(patch?.experience, [{ ref: 0, bullets: ['ok'] }]);
});

// --- AC #5: a confirmed bullet reworded toward a JD keyword — the FACT survives ---------------

test('reword license: bullet wording changes but the role’s structural facts are untouched', () => {
  // Model rewords role 0's first bullet toward the JD vocabulary ("machine learning pipeline").
  const patch = parseTailoredResumePatch(
    JSON.stringify({
      summary: 'Tailored summary emphasising real-time ML.',
      experience: [
        {
          ref: 0,
          bullets: [
            'Shipped a production machine learning pipeline (s-learner XGBoost) that drove $15M annual incremental revenue',
          ],
        },
      ],
    }),
  );
  assert.ok(patch);
  const tailored = applyTailoredResume(resume, patch!);
  const role = tailored.experience.find((e) => e.title === 'Manager - Data Science');
  assert.ok(role);
  // Structural facts come from the source verbatim — the model cannot alter them.
  assert.equal(role!.org, 'Global Financial Services Co.');
  assert.equal(role!.start, '07/2025');
  assert.equal(role!.end, 'Present');
  assert.equal(role!.location, 'Gurgaon, India');
  // The reworded wording is what renders; the $15M fact survives the rewrite.
  assert.match(role!.bullets[0], /machine learning pipeline/);
  assert.match(role!.bullets[0], /\$15M/);
  // Summary rewording is honoured.
  assert.equal(tailored.summary, 'Tailored summary emphasising real-time ML.');
});

// --- AC #5: an unbacked JD keyword is NOT claimed (fabrication impossible by construction) -----

test('a fabricated role (out-of-range ref) is ignored — no invented employer appears', () => {
  const before = resume.experience.length;
  const patch = parseTailoredResumePatch(
    JSON.stringify({
      experience: [{ ref: 99, bullets: ['Led the Kubernetes platform team at FakeCorp'] }],
    }),
  );
  const tailored = applyTailoredResume(resume, patch!);
  assert.equal(tailored.experience.length, before);
  const flat = flattenResumeText(buildStructuredResumeDocument(tailored)).join('\n');
  assert.doesNotMatch(flat, /FakeCorp/);
});

test('locked sections: an unbacked JD skill never enters the tailored résumé', () => {
  // The JD demanded Kubernetes/Rust; neither is in the source skills, and skills are locked.
  const tailored = applyTailoredResume(resume, { experience: [] });
  assert.deepEqual(tailored.skills, resume.skills);
  assert.deepEqual(tailored.awards, resume.awards);
  assert.deepEqual(tailored.education, resume.education);
  assert.deepEqual(tailored.contact, resume.contact);
  const flat = flattenResumeText(buildStructuredResumeDocument(tailored)).join('\n');
  assert.doesNotMatch(flat, /Kubernetes|Rust/);
});

test('every rendered string of a tailored résumé traces to the source OR a reworded bullet/summary', () => {
  const patch = parseTailoredResumePatch(
    JSON.stringify({
      summary: 'Reworded summary.',
      experience: [{ ref: 0, scope: 'Reworded scope.', bullets: ['Reworded bullet one.'] }],
    }),
  );
  const tailored = applyTailoredResume(resume, patch!);
  const sourceStrings = new Set(flattenResumeText(buildStructuredResumeDocument(resume)));
  const allowedReworded = new Set(['Reworded summary.', 'Reworded scope.', 'Reworded bullet one.']);
  for (const value of flattenResumeText(buildStructuredResumeDocument(tailored))) {
    assert.ok(
      sourceStrings.has(value) || allowedReworded.has(value),
      `unexpected rendered string not from source or reword: ${JSON.stringify(value)}`,
    );
  }
});

// --- reorder license + no-role-dropped guarantee ----------------------------------------------

test('experienceOrder reorders roles; omitted roles are appended, never dropped', () => {
  const n = resume.experience.length;
  // Only name the last role first; the rest must still appear, in original order.
  const tailored = applyTailoredResume(resume, { experienceOrder: [n - 1], experience: [] });
  assert.equal(tailored.experience.length, n);
  assert.equal(tailored.experience[0].title, resume.experience[n - 1].title);
  // The remaining roles follow in their original relative order.
  assert.deepEqual(
    tailored.experience.slice(1).map((e) => e.title),
    resume.experience.slice(0, n - 1).map((e) => e.title),
  );
});

test('a role with empty reworded bullets keeps its source bullets (no content dropped)', () => {
  const tailored = applyTailoredResume(resume, {
    experience: [{ ref: 0, bullets: ['   ', ''] }],
  });
  assert.deepEqual(tailored.experience[0].bullets, resume.experience[0].bullets);
});

test('an invalid/non-permutation experienceOrder still yields every source role once', () => {
  const n = resume.experience.length;
  const tailored = applyTailoredResume(resume, {
    experienceOrder: [0, 0, 99, -1], // duplicates + out-of-range are ignored
    experience: [],
  });
  assert.equal(tailored.experience.length, n);
  assert.deepEqual(
    [...tailored.experience.map((e) => e.title)].sort(),
    [...resume.experience.map((e) => e.title)].sort(),
  );
});

// --- end-to-end convenience: bad model output falls back to the un-tailored source ------------

test('tailorStructuredResume falls back to the source when the model output is unusable', () => {
  assert.deepEqual(tailorStructuredResume(resume, 'totally not json'), resume);
});

test('tailorStructuredResume applies a valid patch end-to-end', () => {
  const tailored = tailorStructuredResume(
    resume,
    '{"summary":"E2E reworded.","experience":[{"ref":0,"bullets":["E2E bullet."]}]}',
  );
  assert.equal(tailored.summary, 'E2E reworded.');
  assert.equal(tailored.experience[0].bullets[0], 'E2E bullet.');
  assert.equal(tailored.experience[0].org, resume.experience[0].org);
});

// ================================================================================================
// B6.4-R — grounded truthfulness guard (denylist foreign tech + invented numbers; grounded prose OK)
// ================================================================================================

const numbers = buildResumeNumbers(resume);
const allowed = new Set<string>(); // empty allowed-set → denylist terms are never whitelisted

test('buildResumeNumbers captures source metrics and excludes invented ones', () => {
  // Digit-cores present in the fixture (e.g. $15M, 41.25%, 700K, 1.1M).
  assert.equal(numbers.has('15'), true);
  assert.equal(numbers.has('41.25'), true);
  assert.equal(numbers.has('700'), true);
  assert.equal(numbers.has('1.1'), true);
  // A number that never appears in the source.
  assert.equal(numbers.has('50'), false);
});

test('FOREIGN_TECH_DENYLIST holds the named foreign tools/domains', () => {
  for (const term of ['aws', 'snowflake', 'azure', 'databricks', 'aml']) {
    assert.equal(FOREIGN_TECH_DENYLIST.includes(term), true);
  }
});

test('groundReword rejects named foreign tools/domains not in the candidate stack', () => {
  assert.equal(groundReword('Built data lakes on AWS and Snowflake', numbers, allowed), null);
  assert.equal(groundReword('Migrated workloads onto Azure Databricks', numbers, allowed), null);
  assert.equal(groundReword('Owned hands-on AML transaction monitoring', numbers, allowed), null);
});

test('groundReword ALLOWS grounded inference (validators / pipelines / regulatory)', () => {
  // These are inferences grounded in the résumé, not foreign tools — they must pass unchanged.
  const grounded = [
    'Communicated model results to validators across the org',
    'Supported robust, auditable data pipelines for the targeting platform',
    'Drove regulatory-grade governance for credit-and-fraud-risk models',
  ];
  for (const text of grounded) assert.equal(groundReword(text, numbers, allowed), text);
});

test('groundReword rejects an invented metric but keeps a source metric', () => {
  assert.equal(groundReword('Drove $50M in net-new annual revenue', numbers, allowed), null);
  const kept = 'Drove $15M in annual incremental revenue with a 41.25% lift';
  assert.equal(groundReword(kept, numbers, allowed), kept);
});

test('groundReword accepts the candidate’s listed skills on any wording', () => {
  const text = 'Built XGBoost models in Python and SQL on GCP, orchestrated with Airflow';
  assert.equal(groundReword(text, numbers, allowed), text);
});

test('applyTailoredResume drops a fabricated bullet but keeps the grounded one (fixture)', () => {
  const patch = parseTailoredResumePatch(
    JSON.stringify({
      experience: [
        {
          ref: 0,
          bullets: [
            'Shipped an s-learner XGBoost Balance Model driving $15M in annual incremental revenue',
            'Built the AML detection pipeline on AWS Snowflake', // fabricated → must be dropped
          ],
        },
      ],
    }),
  );
  assert.ok(patch);
  const tailored = applyTailoredResume(resume, patch!);
  const role = tailored.experience.find((e) => e.title === 'Manager - Data Science');
  assert.ok(role);
  assert.equal(role!.bullets.length, 1);
  assert.match(role!.bullets[0], /\$15M/);
  const flat = flattenResumeText(buildStructuredResumeDocument(tailored)).join('\n');
  assert.doesNotMatch(flat, /AWS|Snowflake|AML/i);
});

test('applyTailoredResume falls back to source bullets when every reworded bullet is rejected', () => {
  const tailored = applyTailoredResume(resume, {
    experience: [{ ref: 0, bullets: ['Ran everything on AWS', 'Invented $999M of revenue'] }],
  });
  assert.deepEqual(tailored.experience[0].bullets, resume.experience[0].bullets);
});

test('applyTailoredResume rejects a fabricated summary, keeping the source summary', () => {
  const tailored = applyTailoredResume(resume, {
    summary: 'AML and Snowflake expert with $50M of delivered impact.',
    experience: [],
  });
  assert.equal(tailored.summary, resume.summary);
});
