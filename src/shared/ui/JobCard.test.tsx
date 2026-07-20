import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import JobCard from './JobCard';
import type { Priority } from '../types';

// Direct DOM coverage for the shared Kanban card. This deliberately exercises the JobCard
// presentational contract — the priority eyebrow (dot hue + label), the "location · salary"
// meta line (and its null/blank-location fallbacks), the amber stale/overdue indicator (dot +
// AlarmClock icon), the company/role/last text, and the click-to-open wiring — so a refactor
// that quietly breaks the card fails the gate instead of shipping silently.
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

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
}

interface Callbacks {
  onOpen: () => void;
  opens: () => number;
}

function makeCallbacks(): Callbacks {
  let opens = 0;
  return {
    onOpen: () => {
      opens += 1;
    },
    opens: () => opens,
  };
}

function baseProps(overrides: Partial<{
  company: string;
  role: string;
  location: string | null;
  salary: string;
  last: string;
  priority: Priority;
  stale: boolean;
  onOpen: () => void;
}> = {}) {
  const { onOpen } = makeCallbacks();
  return {
    company: 'Acme Corp',
    role: 'Staff Engineer',
    location: 'Remote',
    salary: '$150k',
    last: '2 days ago',
    priority: 'medium' as Priority,
    stale: false,
    onOpen,
    ...overrides,
  };
}

async function main() {
  await test('1: priority dot hue — high uses bg-stage-rejected', async () => {
    const container = await mount(<JobCard {...baseProps({ priority: 'high' })} />);
    const dot = container.querySelector('.h-1\\.5.w-1\\.5.rounded-full');
    assert.ok(dot);
    assert.ok(dot!.className.includes('bg-stage-rejected'));
  });

  await test('1: priority dot hue — medium uses bg-stage-interviewing', async () => {
    const container = await mount(<JobCard {...baseProps({ priority: 'medium' })} />);
    const dot = container.querySelector('.h-1\\.5.w-1\\.5.rounded-full');
    assert.ok(dot);
    assert.ok(dot!.className.includes('bg-stage-interviewing'));
  });

  await test('1: priority dot hue — low uses bg-ink-faint', async () => {
    const container = await mount(<JobCard {...baseProps({ priority: 'low' })} />);
    const dot = container.querySelector('.h-1\\.5.w-1\\.5.rounded-full');
    assert.ok(dot);
    assert.ok(dot!.className.includes('bg-ink-faint'));
  });

  await test('2: priority label text — high renders "High"', async () => {
    const container = await mount(<JobCard {...baseProps({ priority: 'high' })} />);
    assert.ok(container.textContent?.includes('High'));
  });

  await test('2: priority label text — medium renders "Medium"', async () => {
    const container = await mount(<JobCard {...baseProps({ priority: 'medium' })} />);
    assert.ok(container.textContent?.includes('Medium'));
  });

  await test('2: priority label text — low renders "Low"', async () => {
    const container = await mount(<JobCard {...baseProps({ priority: 'low' })} />);
    assert.ok(container.textContent?.includes('Low'));
  });

  await test('3: meta line with non-empty location joins with the middle dot', async () => {
    const container = await mount(
      <JobCard {...baseProps({ location: 'Bengaluru', salary: '$120k' })} />,
    );
    const meta = container.querySelector('p.text-ink-faint');
    assert.ok(meta);
    assert.equal(meta!.textContent, 'Bengaluru · $120k');
  });

  await test('4: meta line drops the separator when location is null', async () => {
    const container = await mount(<JobCard {...baseProps({ location: null, salary: '$120k' })} />);
    const meta = container.querySelector('p.text-ink-faint');
    assert.ok(meta);
    assert.equal(meta!.textContent, '$120k');
  });

  await test('5: meta line drops the separator when location is blank/whitespace', async () => {
    const container = await mount(<JobCard {...baseProps({ location: '   ', salary: '$120k' })} />);
    const meta = container.querySelector('p.text-ink-faint');
    assert.ok(meta);
    assert.equal(meta!.textContent, '$120k');
  });

  await test('6: stale=true renders the "Needs follow-up" dot and the AlarmClock icon', async () => {
    const container = await mount(<JobCard {...baseProps({ stale: true })} />);
    const staleSpan = container.querySelector('[title="Needs follow-up"]');
    assert.ok(staleSpan);
    const alarmIcon = container.querySelector('svg.text-stage-interviewing');
    assert.ok(alarmIcon);
  });

  await test('7: stale=false renders neither the "Needs follow-up" dot nor the AlarmClock icon', async () => {
    const container = await mount(<JobCard {...baseProps({ stale: false })} />);
    const staleSpan = container.querySelector('[title="Needs follow-up"]');
    assert.equal(staleSpan, null);
    const alarmIcon = container.querySelector('svg.text-stage-interviewing');
    assert.equal(alarmIcon, null);
  });

  await test('8: company, role, and last render in the card text', async () => {
    const container = await mount(
      <JobCard {...baseProps({ company: 'Globex', role: 'Product Designer', last: 'Yesterday' })} />,
    );
    assert.ok(container.textContent?.includes('Globex'));
    assert.ok(container.textContent?.includes('Product Designer'));
    assert.ok(container.textContent?.includes('Yesterday'));
  });

  await test('9: clicking the root button calls onOpen exactly once', async () => {
    const { onOpen, opens } = makeCallbacks();
    const container = await mount(<JobCard {...baseProps({ onOpen })} />);
    const button = container.querySelector('button');
    assert.ok(button);
    await click(button!);
    assert.equal(opens(), 1);
  });

  await test('10: root element is a button[type="button"]', async () => {
    const container = await mount(<JobCard {...baseProps()} />);
    const button = container.querySelector('button');
    assert.ok(button);
    assert.equal(button!.getAttribute('type'), 'button');
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
