import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildTailorMessages,
  isTailorAction,
  TAILOR_ACTIONS,
  TAILOR_PRIVACY_ACTION,
  tailorIncludedCategories,
  type TailorContext,
} from './tailor';

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
