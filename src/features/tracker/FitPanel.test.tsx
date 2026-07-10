import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { FitResult, JdSkillClassification } from '../../shared/domain/fit';
import FitPanel from './FitPanel';

// Direct, isolated DOM coverage for FitPanel (G4 profile-fit panel) — independent of the one JD
// fixture exercised indirectly via ApplicationDetail.test.tsx. Locks down each conditional-render
// branch (required/preferred/unclear groups, bridges, notes) and the hard "never a %" invariant
// at the component level. No Supabase/Auth/LLM involved — FitPanel is a pure presentational
// component driven entirely by its `fit` prop, so no stub wiring is needed here.

// Tiny deterministic harness, copied verbatim from ApplicationDetail.test.tsx: node:test's
// exitCode is only set asynchronously at process end, which races the runner's forced exit
// (React keeps the loop alive), so this harness counts failures synchronously instead.
const state = ((globalThis as unknown as { __DOM_TEST_STATE__?: { failures: number } }).__DOM_TEST_STATE__ ??= {
  failures: 0,
});
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    state.failures += 1;
    console.log(`not ok - ${name}`);
    console.error(err instanceof Error ? err.stack : String(err));
  }
}

async function mount(fit: FitResult) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<FitPanel fit={fit} />);
  });
  return {
    container,
    async cleanup() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

// Minimal valid classification builder — only the fields under test vary per call.
function classification(overrides: Partial<JdSkillClassification> & Pick<JdSkillClassification, 'skill' | 'requirement' | 'evidence'>): JdSkillClassification {
  return {
    label: overrides.skill,
    ...overrides,
  };
}

// Minimal valid FitResult builder. `adjacency`/`requiredTotal`/etc. are filler values not under
// test here (the domain rubric already has its own suite) — only the shape must satisfy the type.
function baseFit(overrides: Partial<FitResult> = {}): FitResult {
  return {
    band: 'Medium',
    confidence: 'medium',
    adjacency: 'same-track',
    requiredTotal: 1,
    requiredEvidenced: 1,
    preferredTotal: 0,
    preferredEvidenced: 0,
    classifications: [],
    missingRequired: [],
    bridges: [],
    summary: 'Medium fit · same track. 1 of 1 required skills evidenced.',
    notes: [],
    ...overrides,
  };
}

async function main() {

await test('1: renders band, confidence, and summary verbatim', async () => {
  const fit = baseFit({
    band: 'High',
    confidence: 'high',
    summary: 'High fit · same track. 3 of 3 required skills evidenced.',
  });
  const { cleanup } = await mount(fit);
  const body = document.body.textContent ?? '';
  assert.match(body, /High fit/);
  assert.match(body, /high confidence/);
  assert.ok(body.includes('High fit · same track. 3 of 3 required skills evidenced.'), 'summary renders verbatim');
  await cleanup();
});

await test('2: required group renders only when present, with evidence label', async () => {
  const fit = baseFit({
    classifications: [
      classification({ skill: 'sql', label: 'SQL', requirement: 'required', evidence: 'direct' }),
    ],
  });
  const { cleanup } = await mount(fit);
  const body = document.body.textContent ?? '';
  assert.match(body, /Required/);
  assert.match(body, /SQL/);
  assert.match(body, /evidenced/);
  assert.doesNotMatch(body, /Preferred/);
  assert.doesNotMatch(body, /Mentioned \(unclear\)/);
  await cleanup();
});

await test('3: preferred group renders independently, with inferable evidence label', async () => {
  const fit = baseFit({
    classifications: [
      classification({ skill: 'aws', label: 'AWS', requirement: 'preferred', evidence: 'inferable' }),
    ],
  });
  const { cleanup } = await mount(fit);
  const body = document.body.textContent ?? '';
  assert.match(body, /Preferred/);
  assert.match(body, /inferable/);
  assert.doesNotMatch(body, /\bRequired\b/);
  assert.doesNotMatch(body, /Mentioned \(unclear\)/);
  await cleanup();
});

await test('4: unclear group renders independently, unconfirmed evidence label', async () => {
  const fit = baseFit({
    classifications: [
      classification({ skill: 'docker', label: 'Docker', requirement: 'unclear', evidence: 'unconfirmed' }),
    ],
  });
  const { cleanup } = await mount(fit);
  const body = document.body.textContent ?? '';
  assert.match(body, /Mentioned \(unclear\)/);
  assert.match(body, /not evidenced/);
  assert.doesNotMatch(body, /\bRequired\b/);
  assert.doesNotMatch(body, /\bPreferred\b/);
  await cleanup();
});

await test('5: all three groups render together with no cross-contamination', async () => {
  const fit = baseFit({
    classifications: [
      classification({ skill: 'sql', label: 'SQL', requirement: 'required', evidence: 'direct' }),
      classification({ skill: 'aws', label: 'AWS', requirement: 'preferred', evidence: 'inferable' }),
      classification({ skill: 'docker', label: 'Docker', requirement: 'unclear', evidence: 'unconfirmed' }),
    ],
  });
  const { cleanup } = await mount(fit);
  const body = document.body.textContent ?? '';
  // Group labels are immediately followed by chip text with no separator in textContent (e.g.
  // "RequiredSQLevidenced"), so `\b`-bounded regexes would false-negative here — substring checks
  // are the correct assertion for adjacent-node DOM text.
  assert.ok(body.includes('Required'));
  assert.ok(body.includes('Preferred'));
  assert.match(body, /Mentioned \(unclear\)/);
  assert.match(body, /SQL/);
  assert.match(body, /AWS/);
  assert.match(body, /Docker/);

  // No cross-contamination: each skill's chip only appears once, and its title reflects its own
  // requirement class (not another group's).
  const chips = [...document.querySelectorAll('[title]')];
  const sqlChip = chips.find((el) => el.textContent?.includes('SQL'));
  const awsChip = chips.find((el) => el.textContent?.includes('AWS'));
  const dockerChip = chips.find((el) => el.textContent?.includes('Docker'));
  assert.ok(sqlChip, 'SQL chip present');
  assert.ok(awsChip, 'AWS chip present');
  assert.ok(dockerChip, 'Docker chip present');
  assert.equal(sqlChip!.getAttribute('title'), 'required · evidenced');
  assert.equal(awsChip!.getAttribute('title'), 'preferred · inferable');
  assert.equal(dockerChip!.getAttribute('title'), 'unclear · not evidenced');

  await cleanup();
});

await test('6: zero classifications — no group renders, panel still mounts cleanly', async () => {
  const fit = baseFit({ classifications: [] });
  const { cleanup } = await mount(fit);
  const body = document.body.textContent ?? '';
  assert.doesNotMatch(body, /\bRequired\b/);
  assert.doesNotMatch(body, /\bPreferred\b/);
  assert.doesNotMatch(body, /Mentioned \(unclear\)/);
  assert.match(body, /Profile fit/);
  assert.match(body, /not an ATS match score/i);
  await cleanup();
});

await test('7: bridge opportunities render only when present', async () => {
  const withBridge = baseFit({
    bridges: [
      {
        skill: 'pytorch',
        label: 'PyTorch',
        via: 'python',
        viaLabel: 'Python',
        note: 'You evidence Python; PyTorch is adjacent machine learning work.',
      },
    ],
  });
  const { cleanup: cleanup1 } = await mount(withBridge);
  const body1 = document.body.textContent ?? '';
  assert.match(body1, /Bridge opportunities/);
  assert.ok(body1.includes('You evidence Python; PyTorch is adjacent machine learning work.'));
  await cleanup1();

  const withoutBridge = baseFit({ bridges: [] });
  const { cleanup: cleanup2 } = await mount(withoutBridge);
  const body2 = document.body.textContent ?? '';
  assert.doesNotMatch(body2, /Bridge opportunities/);
  await cleanup2();
});

await test('8: notes render only when present', async () => {
  const withNotes = baseFit({
    notes: [
      'This posting lists no recognized required skills — fit cannot be asserted with confidence from the JD alone.',
      'Low confidence — thin signal (few recognized requirements or little evidenced skill overlap).',
    ],
  });
  const { cleanup: cleanup1, container: container1 } = await mount(withNotes);
  const body1 = document.body.textContent ?? '';
  assert.ok(body1.includes('This posting lists no recognized required skills — fit cannot be asserted with confidence from the JD alone.'));
  assert.ok(body1.includes('Low confidence — thin signal (few recognized requirements or little evidenced skill overlap).'));
  // Two <li> notes plus (if any) group/bridge lists — assert at least a notes-bearing <ul> exists.
  assert.ok(container1.querySelector('ul'), 'notes render inside a <ul>');
  await cleanup1();

  const withoutNotes = baseFit({ notes: [] });
  const { cleanup: cleanup2, container: container2 } = await mount(withoutNotes);
  // With no classifications, no bridges, and no notes, no <ul> at all should be present.
  assert.equal(container2.querySelector('ul'), null, 'no notes list renders when notes is empty');
  await cleanup2();
});

await test('9: footer disclaimer always renders regardless of state', async () => {
  const empty = baseFit({ classifications: [] });
  const { cleanup: cleanup1 } = await mount(empty);
  const body1 = document.body.textContent ?? '';
  assert.match(body1, /not an ATS match score/i);
  assert.match(body1, /Nothing here is invented/i);
  await cleanup1();

  const full = baseFit({
    classifications: [
      classification({ skill: 'sql', label: 'SQL', requirement: 'required', evidence: 'direct' }),
      classification({ skill: 'aws', label: 'AWS', requirement: 'preferred', evidence: 'inferable' }),
      classification({ skill: 'docker', label: 'Docker', requirement: 'unclear', evidence: 'unconfirmed' }),
    ],
  });
  const { cleanup: cleanup2 } = await mount(full);
  const body2 = document.body.textContent ?? '';
  assert.match(body2, /not an ATS match score/i);
  assert.match(body2, /Nothing here is invented/i);
  await cleanup2();
});

await test('10: hard invariant — never a literal % anywhere, across every fixture used', async () => {
  const fixtures: FitResult[] = [
    baseFit({
      band: 'High',
      confidence: 'high',
      summary: 'High fit, same track, three of three required skills evidenced',
    }),
    baseFit({
      classifications: [classification({ skill: 'sql', label: 'SQL', requirement: 'required', evidence: 'direct' })],
    }),
    baseFit({
      classifications: [classification({ skill: 'aws', label: 'AWS', requirement: 'preferred', evidence: 'inferable' })],
    }),
    baseFit({
      classifications: [classification({ skill: 'docker', label: 'Docker', requirement: 'unclear', evidence: 'unconfirmed' })],
    }),
    baseFit({
      classifications: [
        classification({ skill: 'sql', label: 'SQL', requirement: 'required', evidence: 'direct' }),
        classification({ skill: 'aws', label: 'AWS', requirement: 'preferred', evidence: 'inferable' }),
        classification({ skill: 'docker', label: 'Docker', requirement: 'unclear', evidence: 'unconfirmed' }),
      ],
    }),
    baseFit({ classifications: [] }),
    baseFit({
      bridges: [
        {
          skill: 'pytorch',
          label: 'PyTorch',
          via: 'python',
          viaLabel: 'Python',
          note: 'You evidence Python; PyTorch is adjacent machine learning work.',
        },
      ],
    }),
    baseFit({
      notes: [
        'This posting lists no recognized required skills — fit cannot be asserted with confidence from the JD alone.',
        'Low confidence — thin signal (few recognized requirements or little evidenced skill overlap).',
      ],
    }),
  ];

  for (const fixture of fixtures) {
    // Fixture data must itself contain no % — otherwise this test would prove nothing.
    assert.doesNotMatch(fixture.summary, /%/, 'fixture summary must not itself contain %');
    for (const n of fixture.notes) assert.doesNotMatch(n, /%/, 'fixture note must not itself contain %');
    for (const c of fixture.classifications) assert.doesNotMatch(c.label, /%/, 'fixture skill label must not itself contain %');

    const { cleanup } = await mount(fixture);
    assert.doesNotMatch(document.body.textContent ?? '', /%/, 'FitPanel markup must never render a % character');
    await cleanup();
  }
});

await test('11: chip title attribute is exactly "required · evidenced"', async () => {
  const fit = baseFit({
    classifications: [
      classification({ skill: 'sql', label: 'SQL', requirement: 'required', evidence: 'direct' }),
    ],
  });
  const { container, cleanup } = await mount(fit);
  const chip = container.querySelector('[title]');
  assert.ok(chip, 'expected a chip element with a title attribute');
  assert.equal(chip!.getAttribute('title'), 'required · evidenced');
  await cleanup();
});

}

// Run sequentially (each test mounts/unmounts its own root), then signal the runner. Reached
// even if a test failed — the harness records failures rather than throwing.
void main().then(() => {
  (globalThis as unknown as { __DOM_TESTS_DONE__?: boolean }).__DOM_TESTS_DONE__ = true;
});
