import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import StagePill from './StagePill';
import type { Stage } from '../types';

// Direct DOM coverage for the shared StagePill atom. This deliberately exercises the
// presentational contract — the tinted pill vs. dot-only header modes, the stage label text,
// the stage dot hue, the optional count (which must show even when it is `0`), and the
// trimmed `className` passthrough — so a refactor that quietly breaks the pill fails the gate
// instead of shipping silently. Expected classes/labels are hard-coded here (not imported from
// `../domain/stages`) so the test pins the contract independently.
const state = ((globalThis as unknown as { __DOM_TEST_STATE__?: { failures: number } }).__DOM_TEST_STATE__ ??= {
  failures: 0,
});

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

async function cleanupMounted() {
  while (mounted.length > 0) {
    const item = mounted.pop()!;
    try {
      await act(async () => item.root.unmount());
    } finally {
      item.container.remove();
    }
  }
}

async function resetEnvironment() {
  await cleanupMounted();
  document.body.replaceChildren();
}

async function restoreEnvironment() {
  await cleanupMounted();
  document.body.replaceChildren();
}

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await resetEnvironment();
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    state.failures += 1;
    console.log(`not ok - ${name}`);
    console.error(error instanceof Error ? error.stack : String(error));
  } finally {
    await restoreEnvironment();
  }
}

async function mount(children: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(children));
  return container;
}

const STAGE_LABEL: Record<Stage, string> = {
  lead: 'Lead',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
};

const STAGE_PILL: Record<Stage, string> = {
  lead: 'bg-stage-lead/15 text-stage-lead',
  applied: 'bg-stage-applied/15 text-stage-applied',
  interviewing: 'bg-stage-interviewing/15 text-stage-interviewing',
  offer: 'bg-stage-offer/15 text-stage-offer',
  rejected: 'bg-stage-rejected/15 text-stage-rejected',
};

const STAGE_DOT: Record<Stage, string> = {
  lead: 'bg-stage-lead',
  applied: 'bg-stage-applied',
  interviewing: 'bg-stage-interviewing',
  offer: 'bg-stage-offer',
  rejected: 'bg-stage-rejected',
};

const STAGES: Stage[] = ['lead', 'applied', 'interviewing', 'offer', 'rejected'];

async function main() {
  await test('1: tinted pill class — default mode carries pill + STAGE_PILL tint', async () => {
    const container = await mount(<StagePill stage="applied" />);
    const outer = container.firstElementChild;
    assert.ok(outer);
    assert.ok(outer!.className.includes('pill'));
    assert.ok(outer!.className.includes('bg-stage-applied/15'));
    assert.ok(outer!.className.includes('text-stage-applied'));
  });

  await test('2: pill label text — default mode renders STAGE_LABEL text', async () => {
    const container = await mount(<StagePill stage="applied" />);
    const outer = container.firstElementChild;
    assert.ok(outer);
    assert.ok(outer!.textContent?.includes('Applied'));
  });

  await test('3: pill dot hue — default mode dot carries STAGE_DOT class', async () => {
    const container = await mount(<StagePill stage="applied" />);
    const dot = container.querySelector('.rounded-full');
    assert.ok(dot);
    assert.ok(dot!.className.includes('bg-stage-applied'));
  });

  await test('4: dotOnly header, no tint — carries inline-flex + text-ink-soft, no pill/tint', async () => {
    const container = await mount(<StagePill stage="applied" dotOnly />);
    const outer = container.firstElementChild;
    assert.ok(outer);
    assert.ok(outer!.className.includes('inline-flex'));
    assert.ok(outer!.className.includes('text-ink-soft'));
    assert.ok(!outer!.className.includes('pill'));
    assert.doesNotMatch(outer!.className, /bg-stage-(?:lead|applied|interviewing|offer|rejected)\/15/);
  });

  await test('5: dotOnly label + dot — offer renders "Offer" and dot carries bg-stage-offer', async () => {
    const container = await mount(<StagePill stage="offer" dotOnly />);
    const outer = container.firstElementChild;
    assert.ok(outer);
    assert.ok(outer!.textContent?.includes('Offer'));
    const dot = container.querySelector('.rounded-full');
    assert.ok(dot);
    assert.ok(dot!.className.includes('bg-stage-offer'));
  });

  await test('6: count === 0 renders a literal 0 (count != null guard)', async () => {
    const container = await mount(<StagePill stage="applied" count={0} />);
    const outer = container.firstElementChild;
    assert.ok(outer);
    const spans = outer!.querySelectorAll('span');
    const countSpan = Array.from(spans).find((el) => el.textContent === '0');
    assert.ok(countSpan);
  });

  await test('7: count > 0 renders the exact count text', async () => {
    const container = await mount(<StagePill stage="applied" count={7} />);
    const outer = container.firstElementChild;
    assert.ok(outer);
    const spans = outer!.querySelectorAll('span');
    const countSpan = Array.from(spans).find((el) => el.textContent === '7');
    assert.ok(countSpan);
  });

  await test('8: count omitted — no bare-number child span renders', async () => {
    const container = await mount(<StagePill stage="applied" />);
    const outer = container.firstElementChild;
    assert.ok(outer);
    const children = outer!.querySelectorAll('span');
    assert.equal(children.length, 1);
    assert.ok(children[0]!.className.includes('rounded-full'));
  });

  await test('9: count in dotOnly mode — count={0} still renders', async () => {
    const container = await mount(<StagePill stage="applied" dotOnly count={0} />);
    const outer = container.firstElementChild;
    assert.ok(outer);
    const spans = outer!.querySelectorAll('span');
    const countSpan = Array.from(spans).find((el) => el.textContent === '0');
    assert.ok(countSpan);
  });

  await test('10: className appended (present) — default mode includes ml-2', async () => {
    const container = await mount(<StagePill stage="applied" className="ml-2" />);
    const outer = container.firstElementChild;
    assert.ok(outer);
    assert.ok(outer!.className.includes('ml-2'));
  });

  await test('11: className trimmed — default mode with no className has no trailing space', async () => {
    const container = await mount(<StagePill stage="applied" />);
    const outer = container.firstElementChild;
    assert.ok(outer);
    assert.equal(outer!.className, outer!.className.trim());
  });

  await test('11b: className trimmed — dotOnly mode with no className has no trailing space', async () => {
    const container = await mount(<StagePill stage="applied" dotOnly />);
    const outer = container.firstElementChild;
    assert.ok(outer);
    assert.equal(outer!.className, outer!.className.trim());
  });

  await test('12: all five stages render their STAGE_LABEL text and STAGE_DOT class', async () => {
    for (const stage of STAGES) {
      const container = await mount(<StagePill stage={stage} />);
      const outer = container.firstElementChild;
      assert.ok(outer, `missing outer span for stage ${stage}`);
      assert.ok(outer!.textContent?.includes(STAGE_LABEL[stage]), `missing label for ${stage}`);
      assert.ok(outer!.className.includes(STAGE_PILL[stage]), `missing pill tint for ${stage}`);
      const dot = outer!.querySelector('.rounded-full');
      assert.ok(dot, `missing dot for ${stage}`);
      assert.ok(dot!.className.includes(STAGE_DOT[stage]), `missing dot hue for ${stage}`);
    }
  });
}

void main()
  .catch((error) => {
    state.failures += 1;
    console.error(error instanceof Error ? error.stack : String(error));
  })
  .finally(() => {
    (globalThis as unknown as { __DOM_TESTS_DONE__?: boolean }).__DOM_TESTS_DONE__ = true;
  });
