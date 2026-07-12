import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  applyTailoredResume,
  buildResumeNumbers,
  buildTailorMessages,
  buildTailorResumeMessages,
  cohereTailoredBullets,
  diffTailored,
  evidenceLikelyRecoverable,
  FOREIGN_TECH_DENYLIST,
  groundReword,
  isCloseFit,
  isTailorAction,
  finalizeTailoredEditorialPlan,
  isDanglingImpactFragment,
  parseTailoredEditorialPlan,
  parseTailoredResumePatch,
  pruneOptionalForRelevance,
  TAILOR_ACTIONS,
  TAILOR_PRIVACY_ACTION,
  tailorIncludedCategories,
  tailorStructuredResume,
  validateTailoredEditorialPlan,
  type TailoredEditorialAudit,
  type TailoredEditorialPlan,
  type TailorContext,
} from './tailor';
import { flattenResumeText, buildStructuredResumeDocument, type StructuredResume } from './resume';
import { computeGap } from './gap';

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

test('tailor sends the complete PII-redacted résumé manifest; prep stays profile-only', () => {
  const tailor = tailorIncludedCategories(ctx('tailor'));
  assert.deepEqual(
    [...tailor].sort(),
    ['education', 'job-description', 'profile-summary', 'resume', 'skills', 'work-history'],
  );
  assert.equal(tailor.includes('contact-info'), false);
  assert.deepEqual(
    [...tailorIncludedCategories(ctx('prep'))].sort(),
    ['job-description', 'profile-summary', 'skills', 'work-history'],
  );
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

const semanticBulletFixtures = JSON.parse(
  readFileSync('fixtures/semantic-bullet-fragments.json', 'utf8'),
) as Array<{ name: string; adversarialPurpose: string; input: string[]; expected: string[] }>;

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
  assert.match(system.content, /REWORD existing material/);
  // Holistic rewording contract: whole-résumé judgement, and roles are NOT reordered.
  assert.match(system.content, /HOLISTICALLY/);
  assert.match(system.content, /MANDATORY SILENT FINAL AUDIT/i);
  assert.match(system.content, /both resulting bullets/i);
  assert.match(system.content, /action and (?:its )?(?:result|impact)/i);
  assert.match(system.content, /rewrite the whole bullet more concisely/i);
  assert.match(system.content, /ONE readable A4 page/);
  assert.match(system.content, /88–102 characters/);
  assert.match(system.content, /Built an S-learner XGBoost balance model/);
  assert.match(system.content, /Do NOT reorder roles/);
  assert.match(system.content, /ONLY a single JSON object/);
  assert.match(system.content, /ONE AND ONLY ONE model call/i);
  assert.match(system.content, /2 or 3 ranked/i);
  assert.match(system.content, /ONE physical line/i);
  assert.equal(user.role, 'user');
  assert.match(user.content, /Data Scientist II/);
  assert.match(user.content, /Kubernetes, Rust/);
  // The model is shown indexed experience entries to reference by ref.
  assert.match(user.content, /\[0\] Global Financial Services Co\. · Credit and Fraud Risk — Manager - Data Science/);
  assert.match(user.content, /\[award:0\] 2024 Centurion Award/);
  assert.match(user.content, /\[project:0:bullet:0\]/);
  assert.match(user.content, /\[education:0\] IIT Kharagpur/);
  assert.match(user.content, /\[skill:0:0\] Technology: XGBoost/);
});

test('the rejected mechanical merger is gone; dangling fragments are rejected, not rewritten', () => {
  for (const fixture of semanticBulletFixtures) {
    assert.match(fixture.adversarialPurpose, /rejected rather than mechanically merged/i, fixture.name);
    assert.equal(isDanglingImpactFragment(fixture.input[1]), true, fixture.name);
    assert.deepEqual(cohereTailoredBullets(fixture.input), [fixture.input[0]], fixture.name);
  }
});

test('the two user-approved semantic rewrites are locked as regression fixtures', () => {
  assert.deepEqual(semanticBulletFixtures.flatMap((fixture) => fixture.expected), [
    'Built an S-learner XGBoost balance model that improved targeting precision and drove $15M in annual incremental revenue.',
    'Built a GPT-powered feature discovery solution that generated 10+ novel features for the high-spend decliner segment.',
  ]);
});

test('cohereTailoredBullets leaves independently meaningful accomplishments separate', () => {
  const bullets = [
    'Developed a feature discovery workflow for model validation.',
    'Reduced runtime by 5x through end-to-end platform migration.',
  ];
  assert.deepEqual(cohereTailoredBullets(bullets), bullets);
});

test('the structured tailor prompt never leaks contact-info (manifest parity with prose path)', () => {
  const [, user] = buildTailorResumeMessages({
    company: 'X',
    role: 'Y',
    jdText: 'Z',
    resume,
  });
  assert.doesNotMatch(user.content, /redacted@example\.com|000-000-0000|linkedin\.com/);
  assert.doesNotMatch(user.content, /Karan Virender Mahajan/);
  assert.match(user.content, /LOCKED BY APP[\s\S]*REDACTED/);
});

const completeAudit: TailoredEditorialAudit = {
  completeResumeReviewed: true,
  narrativeAndSectionBalanceChecked: true,
  everyClaimIndependent: true,
  actionImpactKeptTogether: true,
  sourceCoverageChecked: true,
  exactMetricsChecked: true,
  truthfulnessChecked: true,
  candidateLineFitChecked: true,
  omissionsExplicit: true,
};

function completeEditorialPlan(): TailoredEditorialPlan {
  return {
    summaryCandidates: [
      { rank: 1, text: resume.summary },
      { rank: 2, text: resume.summary },
    ],
    experience: resume.experience.map((experience, roleIndex) => ({
      ref: roleIndex,
      scope: experience.scope,
      claims: experience.bullets.map((bullet, bulletIndex) => {
        const approved = roleIndex === 0 && bulletIndex < semanticBulletFixtures.length
          ? semanticBulletFixtures[bulletIndex].expected[0]
          : bullet;
        return {
          sourceRefs: [`experience:${roleIndex}:bullet:${bulletIndex}`],
          candidates: [
            { rank: 1 as const, text: approved },
            { rank: 2 as const, text: bullet },
          ],
        };
      }),
    })),
    omissions: [],
    audit: completeAudit,
  };
}

test('one-call editorial plan parser requires provenance, contiguous ranks, omissions, and all audit flags', () => {
  const parsed = parseTailoredEditorialPlan(JSON.stringify(completeEditorialPlan()));
  assert.ok(parsed);
  assert.equal(parsed!.experience[0].claims[0].sourceRefs[0], 'experience:0:bullet:0');
  assert.equal(parsed!.experience[0].claims[0].candidates.length, 2);

  const incompleteAudit = completeEditorialPlan() as unknown as Record<string, unknown>;
  incompleteAudit.audit = { ...completeAudit, exactMetricsChecked: false };
  assert.equal(parseTailoredEditorialPlan(JSON.stringify(incompleteAudit)), null);

  const oneCandidate = completeEditorialPlan();
  oneCandidate.experience[0].claims[0].candidates.splice(1);
  assert.equal(parseTailoredEditorialPlan(JSON.stringify(oneCandidate)), null);

  const skippedRank = completeEditorialPlan();
  skippedRank.experience[0].claims[0].candidates[1].rank = 3;
  assert.equal(parseTailoredEditorialPlan(JSON.stringify(skippedRank)), null);

  const malformedRef = completeEditorialPlan() as unknown as { experience: Array<{ claims: Array<{ sourceRefs: string[] }> }> };
  malformedRef.experience[0].claims[0].sourceRefs = ['not-a-resume-ref'];
  assert.equal(parseTailoredEditorialPlan(JSON.stringify(malformedRef)), null);
});

test('editorial validation accepts the complete grounded plan and both approved rewrites', () => {
  const plan = completeEditorialPlan();
  const validation = validateTailoredEditorialPlan(resume, plan);
  assert.deepEqual(validation, { ok: true, errors: [] });
  assert.equal(plan.experience[0].claims[0].candidates[0].text, semanticBulletFixtures[0].expected[0]);
  assert.equal(plan.experience[0].claims[1].candidates[0].text, semanticBulletFixtures[1].expected[0]);
});

test('editorial validation rejects audit failures, unknown/duplicate refs, lost metrics, dangling candidates, and unaccounted source bullets', () => {
  const failedAudit = completeEditorialPlan();
  failedAudit.audit = { ...failedAudit.audit, exactMetricsChecked: false } as unknown as TailoredEditorialAudit;
  assert.match(validateTailoredEditorialPlan(resume, failedAudit).errors.join('\n'), /required audit flag/);

  const unknownRef = completeEditorialPlan();
  unknownRef.experience[0].claims[0].sourceRefs = ['experience:999:bullet:0'];
  assert.match(validateTailoredEditorialPlan(resume, unknownRef).errors.join('\n'), /Unknown claim ref/);

  const duplicateRef = completeEditorialPlan();
  duplicateRef.experience[0].claims[0].sourceRefs.push('experience:0:bullet:0');
  assert.match(validateTailoredEditorialPlan(resume, duplicateRef).errors.join('\n'), /Duplicate claim ref/);

  const lostMetric = completeEditorialPlan();
  lostMetric.experience[0].claims[0].candidates[0].text = 'Built an S-learner XGBoost balance model for improved targeting precision.';
  assert.equal(validateTailoredEditorialPlan(resume, lostMetric).ok, false);

  const dangling = completeEditorialPlan();
  dangling.experience[0].claims[1].candidates[0].text = 'Generating 10+ novel features for the high-spend decliner segment.';
  assert.equal(validateTailoredEditorialPlan(resume, dangling).ok, false);

  const uncovered = completeEditorialPlan();
  uncovered.experience[0].claims.splice(0, 1);
  assert.match(validateTailoredEditorialPlan(resume, uncovered).errors.join('\n'), /Unaccounted source ref/);
});

test('finalizer chooses the best ranked exact-width fit and returns canonical provenance + omissions', () => {
  const plan = completeEditorialPlan();
  // Force the rank-1 wording for the first claim not to fit; rank 2 must be selected without a call.
  const firstClaim = plan.experience[0].claims[0];
  const rank1 = firstClaim.candidates[0].text;
  const rank2 = firstClaim.candidates[1].text;
  const finalized = finalizeTailoredEditorialPlan(
    resume,
    plan,
    (text) => ({ fits: text !== rank1, fillRatio: text === rank2 ? 0.96 : 0.82 }),
  );
  assert.ok(finalized);
  assert.equal(finalized!.resume.experience[0].bullets[0], rank2);
  assert.equal(finalized!.selectedClaims[0].candidate.rank, 2);
  assert.deepEqual(finalized!.selectedClaims[0].sourceRefs, ['experience:0:bullet:0']);
  assert.deepEqual(finalized!.omissions, []);
});

test('finalizer fails closed when no candidate fits and applies explicit reversible omissions', () => {
  const plan = completeEditorialPlan();
  assert.equal(
    finalizeTailoredEditorialPlan(resume, plan, () => ({ fits: false, fillRatio: 1.1 })),
    null,
  );

  const omittedRef = 'experience:0:bullet:3' as const;
  plan.experience[0].claims = plan.experience[0].claims.filter(
    (claim) => claim.sourceRefs[0] !== omittedRef,
  );
  plan.omissions = [
    { sourceRef: omittedRef, reason: 'Less relevant to the target role', jdBased: true },
    { sourceRef: 'award:4', reason: 'Lower-priority award for this JD', jdBased: true },
  ];
  const finalized = finalizeTailoredEditorialPlan(
    resume,
    plan,
    () => ({ fits: true, fillRatio: 0.9 }),
  );
  assert.ok(finalized);
  assert.equal(finalized!.resume.experience[0].bullets.length, resume.experience[0].bullets.length - 1);
  assert.equal(finalized!.resume.awards.length, resume.awards.length - 1);
  assert.deepEqual(finalized!.omissions, plan.omissions);
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

// --- chronology preserved (roles never reorder) + no-role-dropped guarantee -------------------

test('roles always render in source (reverse-chronological) order — never reordered', () => {
  // Even when the patch rewords the last role, the roles keep their source order exactly.
  const n = resume.experience.length;
  const tailored = applyTailoredResume(resume, {
    experience: [{ ref: n - 1, bullets: ['Reworded final-role bullet.'] }],
  });
  assert.equal(tailored.experience.length, n);
  assert.deepEqual(
    tailored.experience.map((e) => e.title),
    resume.experience.map((e) => e.title),
  );
});

test('a stray experienceOrder in raw model JSON is ignored — order stays chronological', () => {
  const n = resume.experience.length;
  // A model may still emit experienceOrder; the parser drops it and roles keep source order.
  const patch = parseTailoredResumePatch(
    JSON.stringify({ experienceOrder: [n - 1, 0], experience: [] }),
  );
  assert.ok(patch);
  assert.equal('experienceOrder' in patch!, false);
  const tailored = applyTailoredResume(resume, patch!);
  assert.deepEqual(
    tailored.experience.map((e) => e.title),
    resume.experience.map((e) => e.title),
  );
});

test('a role with empty reworded bullets keeps its source bullets (no content dropped)', () => {
  const tailored = applyTailoredResume(resume, {
    experience: [{ ref: 0, bullets: ['   ', ''] }],
  });
  assert.deepEqual(tailored.experience[0].bullets, resume.experience[0].bullets);
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

// ================================================================================================
// G1 — evidence-ingesting tailoring (confirmed skills → Skills; evidence-derived bullets stay
// grounded; one focused follow-up only when a quantity is recoverable). 2026-06-30 gap wave.
// ================================================================================================

test('G1.1 a confirmed skill enters Skills; an unconfirmed JD skill never appears', () => {
  const tailored = applyTailoredResume(resume, { experience: [] }, { skills: ['Kubernetes'] });
  const flat = flattenResumeText(buildStructuredResumeDocument(tailored)).join('\n').toLowerCase();
  assert.match(flat, /kubernetes/); // confirmed + evidenced → folded into Skills
  assert.doesNotMatch(flat, /terraform/); // never confirmed → never injected
  // Deterministic + idempotent: a skill already present is not duplicated.
  const again = applyTailoredResume(resume, { experience: [] }, { skills: ['Python', 'Kubernetes'] });
  const pythonCount = flattenResumeText(buildStructuredResumeDocument(again))
    .filter((s) => s.toLowerCase() === 'python').length;
  assert.equal(pythonCount, 1);
});

test('G1.2 an evidence-derived bullet passes the guard; a fabricated metric is rejected', () => {
  const evidence = ['Cut fraud false positives 30% by deploying a gradient boosting model'];
  const grounded = applyTailoredResume(
    resume,
    { experience: [{ ref: 0, bullets: ['Cut fraud false positives 30% with a gradient boosting model'] }] },
    { evidence },
  );
  assert.match(grounded.experience[0].bullets.join(' '), /30%/); // grounded by the user's evidence

  // Without the evidence corpus the same 30% bullet is NOT grounded (number absent from source) →
  // the role falls back to its source bullets rather than rendering an ungrounded claim.
  const ungrounded = applyTailoredResume(resume, {
    experience: [{ ref: 0, bullets: ['Cut fraud false positives 30% with a gradient boosting model'] }],
  });
  assert.doesNotMatch(ungrounded.experience[0].bullets.join(' '), /30% with a gradient/);

  // A fabricated metric absent from BOTH source and evidence is rejected even when evidence is present.
  const fabricated = applyTailoredResume(
    resume,
    { experience: [{ ref: 0, bullets: ['Cut fraud false positives 90% overnight'] }] },
    { evidence },
  );
  assert.doesNotMatch(fabricated.experience[0].bullets.join(' '), /90%/);
});

test('G1.3 the focused follow-up fires only on quantity-less evidence; declining stays factual', () => {
  assert.equal(evidenceLikelyRecoverable('Led the migration to a feature store'), true);
  assert.equal(evidenceLikelyRecoverable('Cut latency by 40%'), false);
  assert.equal(evidenceLikelyRecoverable('   '), false);
  // Declining the follow-up: a factual, unquantified bullet stays grounded — no fabricated precision.
  const tailored = applyTailoredResume(
    resume,
    { experience: [{ ref: 0, bullets: ['Led the migration to a feature store for real-time scoring'] }] },
    { evidence: ['Led the migration to a feature store'] },
  );
  assert.match(tailored.experience[0].bullets.join(' '), /feature store/);
});

// ================================================================================================
// G3 — pre-save tailoring diff (additions / rewrites / omissions / unsupported JD; restore parity).
// ================================================================================================

test('G3.1 diffTailored surfaces a summary rewrite, a new skill, and a per-role bullet change', () => {
  const tailored = applyTailoredResume(
    resume,
    {
      summary: 'Reworded summary for the target role.',
      experience: [{ ref: 0, bullets: ['Owned validators across pipelines for regulatory reporting'] }],
    },
    { skills: ['Kubernetes'] },
  );
  const diff = diffTailored(resume, tailored, { unsupportedJd: ['Terraform'] });
  assert.equal(diff.unchanged, false);
  assert.equal(diff.summary?.after, 'Reworded summary for the target role.');
  assert.equal(diff.summary?.before, resume.summary);
  assert.ok(diff.skillAdditions.includes('Kubernetes'));
  const role0 = diff.roles.find((r) => r.org === resume.experience[0].org && r.title === resume.experience[0].title);
  assert.ok(role0);
  assert.deepEqual(role0!.before, resume.experience[0].bullets); // restore target = the source bullets
  assert.deepEqual(diff.unsupportedJd, ['Terraform']);
});

test('G3.2 a tailored result identical to source reports no changes (restore parity)', () => {
  const diff = diffTailored(resume, resume);
  assert.equal(diff.unchanged, true);
  assert.equal(diff.summary, null);
  assert.deepEqual(diff.skillAdditions, []);
  assert.deepEqual(diff.roles, []);
});

test('diffTailored shows a dropped bullet as a shorter after-set (omission is visible)', () => {
  const firstOnly = [resume.experience[0].bullets[0]]; // verbatim source bullet → passes the guard
  const tailored = applyTailoredResume(resume, { experience: [{ ref: 0, bullets: firstOnly }] });
  const diff = diffTailored(resume, tailored);
  const role0 = diff.roles.find((r) => r.org === resume.experience[0].org && r.title === resume.experience[0].title);
  assert.ok(role0);
  assert.ok(role0!.before.length > role0!.after.length);
});

// ================================================================================================
// G2 — relevance-based optional-content selection + adaptive summary (never drops roles/education).
// ================================================================================================

const closeFitJd = readFileSync('fixtures/close-fit-jd.txt', 'utf8');
const pivotJd = readFileSync('fixtures/pivot-jd.txt', 'utf8');
// The candidate's evidenced skills, drawn from the résumé's own Skills section.
const resumeSkills = resume.skills.flatMap((g) => g.items);

test('isCloseFit: a role the candidate fully evidences is close; a devops pivot is not', () => {
  const closeGap = computeGap({ jdText: closeFitJd, evidence: resumeSkills });
  const pivotGap = computeGap({ jdText: pivotJd, evidence: resumeSkills });
  assert.equal(isCloseFit(closeGap), true);
  assert.equal(isCloseFit(pivotGap), false);
  // An unrecognised JD (no required skills extracted) is NOT a confident close fit — keep the bridge.
  assert.equal(isCloseFit(computeGap({ jdText: 'We value curiosity and grit.', evidence: resumeSkills })), false);
});

test('G2.1 close-fit tightens the summary; a pivot keeps the bridge summary', () => {
  const close = pruneOptionalForRelevance(resume, closeFitJd, { closeFit: true });
  // Summary shortened on a close fit (bullets deserve the page), still grounded in the source text.
  assert.ok(close.summary.length < resume.summary.length, 'close-fit summary should be tightened');
  assert.ok(resume.summary.startsWith(close.summary), 'tightened summary must be a prefix of the source');
  // A stretch/pivot keeps the full bridge-explaining summary.
  const pivot = pruneOptionalForRelevance(resume, pivotJd, { closeFit: false });
  assert.equal(pivot.summary, resume.summary);
});

test('G2.1 the structured prompt carries adaptive summary guidance for close-fit vs. pivot', () => {
  const [, closeUser] = buildTailorResumeMessages({ company: 'X', role: 'Y', jdText: closeFitJd, resume, closeFit: true });
  assert.match(closeUser.content, /already closely matches[\s\S]*at most/i);
  const [, pivotUser] = buildTailorResumeMessages({ company: 'X', role: 'Y', jdText: pivotJd, resume, closeFit: false });
  assert.match(pivotUser.content, /adjacent\/stretch move[\s\S]*bridges/i);
});

test('G2.2 less-relevant optional content is pruned while full chronology is preserved', () => {
  const close = pruneOptionalForRelevance(resume, closeFitJd, { closeFit: true });
  // Employment + education chronology stays COMPLETE — never a dropped role or school.
  assert.equal(close.experience.length, resume.experience.length);
  assert.deepEqual(close.experience.map((e) => e.title), resume.experience.map((e) => e.title));
  assert.equal(close.education.length, resume.education.length);
  assert.deepEqual(close.education.map((e) => e.school), resume.education.map((e) => e.school));
  // Optional content IS pruned by relevance.
  assert.ok(close.awards.length < resume.awards.length, 'less-relevant awards pruned');
  const closeSkills = close.skills.flatMap((g) => g.items);
  assert.ok(closeSkills.length < resumeSkills.length, 'less-relevant skills pruned');
  // But the JD-relevant skills are always kept (a confirmed-added skill would be too).
  for (const kept of ['Python', 'SQL', 'XGBoost', 'Machine Learning']) {
    assert.ok(closeSkills.includes(kept), `${kept} must survive relevance pruning`);
  }
  // The pruning is surfaced by the diff as omissions (transparent + reversible via restore).
  const diff = diffTailored(resume, close);
  assert.ok(diff.omittedOptional.length > 0, 'pruned optional content is reported as omissions');
  assert.equal(diff.roles.length, 0, 'no role bullets changed by pure selection');
});

test('G2 a stretch/pivot keeps optional content within its wider budget (no over-pruning)', () => {
  const pivot = pruneOptionalForRelevance(resume, pivotJd, { closeFit: false });
  assert.equal(pivot.awards.length, resume.awards.length);
  assert.equal(pivot.projects.length, resume.projects.length);
  assert.equal(pivot.skills.flatMap((g) => g.items).length, resumeSkills.length);
  // Restore parity is untouched — an identity prune of the source reports no changes.
  assert.equal(diffTailored(resume, resume).unchanged, true);
});

test('buildTailorResumeMessages surfaces confirmed truthful additions to the model', () => {
  const messages = buildTailorResumeMessages({
    company: 'Acme',
    role: 'ML Platform Engineer',
    jdText: 'Kubernetes in production',
    resume,
    truthfulAdditions: [{ skill: 'kubernetes', evidence: 'Ran prod workloads on k8s for two years' }],
  });
  const user = messages.find((m) => m.role === 'user');
  assert.ok(user);
  assert.match(user!.content, /Confirmed truthful additions/);
  assert.match(user!.content, /Kubernetes: Ran prod workloads on k8s/);
});
