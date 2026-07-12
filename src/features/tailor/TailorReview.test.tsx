import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { StructuredResume } from '../../shared/domain/resume';
import type { ResumeSourceRef, TailoredOmission } from '../../shared/domain/tailor';
import TailorReview from './TailorReview';

interface TestGlobals {
  __DOM_TEST_STATE__?: { failures: number };
  __DOM_TESTS_DONE__?: boolean;
}

const globals = globalThis as unknown as TestGlobals;
const state = (globals.__DOM_TEST_STATE__ ??= { failures: 0 });

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    state.failures += 1;
    console.log(`not ok - ${name}`);
    console.error(error instanceof Error ? error.stack : String(error));
  }
}

const source: StructuredResume = {
  contact: { fullName: 'Karan', title: 'Data Scientist', links: [] },
  summary: 'Builds decision-science products.',
  awards: [{ title: 'Centurion Award', detail: 'Top 1%' }],
  experience: [{
    org: 'Example Co', title: 'Data Scientist', start: '2023', end: 'Present',
    bullets: ['Built a balance model that drove $15M in annual incremental revenue.'],
  }],
  projects: [{
    name: 'Feature Discovery',
    bullets: ['Built a GPT-powered solution that generated 10+ novel features.'],
  }],
  education: [],
  skills: [{ label: 'Technology', items: ['Python', 'SQL'] }],
};

const tailored: StructuredResume = {
  ...source,
  awards: [],
  experience: [{ ...source.experience[0], bullets: [] }],
  projects: [],
  skills: [{ ...source.skills[0], items: ['SQL'] }],
};

const omissions: TailoredOmission[] = [
  {
    sourceRef: 'experience:0:bullet:0',
    reason: 'The target role prioritizes experimentation leadership over this targeting example.',
    jdBased: true,
  },
  {
    sourceRef: 'project:0',
    reason: 'The project duplicates stronger production evidence.',
    jdBased: true,
  },
  {
    sourceRef: 'award:0',
    reason: 'Experience evidence is more relevant to the target requirements.',
    jdBased: false,
  },
  {
    sourceRef: 'skill:0:0',
    reason: 'The JD does not emphasize this skill.',
    jdBased: true,
  },
];

async function main() {
  await test('renders every source-linked omission with context, reason, label, and individual restore', async () => {
    const restored: ResumeSourceRef[] = [];
    const changes: StructuredResume[] = [];
    let restoredAll = 0;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <TailorReview
          source={source}
          tailored={tailored}
          unsupportedJd={[]}
          omissions={omissions}
          onRestoreOmission={(ref) => restored.push(ref)}
          onRestoreAllOmissions={() => { restoredAll += 1; }}
          onChange={(next) => changes.push(next)}
        />,
      );
    });

    const body = container.textContent ?? '';
    assert.match(body, /Explicit omissions/);
    assert.match(body, /Data Scientist · Example Co · Bullet 1/);
    assert.match(body, /Built a balance model that drove \$15M/);
    assert.match(body, /Project · Feature Discovery/);
    assert.match(body, /Centurion Award — Top 1%/);
    assert.match(body, /Technology · Item 1/);
    assert.match(body, /The JD does not emphasize this skill/);
    assert.equal(container.querySelectorAll('[data-source-ref]').length, omissions.length);
    assert.equal((body.match(/JD-based omission/g) ?? []).length, 3);
    assert.equal((body.match(/Editorial omission/g) ?? []).length, 1);

    const restore = container.querySelector<HTMLButtonElement>(
      '[aria-label="Restore omitted project:0"]',
    );
    assert.ok(restore);
    await act(async () => restore!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    assert.deepEqual(restored, ['project:0']);

    const restoreAll = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Restore original'),
    );
    assert.ok(restoreAll);
    await act(async () => restoreAll!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    assert.deepEqual(changes.at(-1), source, 'restore-all returns the canonical source résumé');
    assert.equal(restoredAll, 1, 'restore-all also clears explicit-omission metadata');

    const edit = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Edit'));
    assert.ok(edit);
    await act(async () => edit!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    const bullets = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Edit bullets for Data Scientist at Example Co"]');
    assert.ok(bullets);
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setValue?.call(bullets, 'Edited grounded bullet.');
      bullets!.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    assert.deepEqual(changes.at(-1)?.experience[0]?.bullets, ['Edited grounded bullet.']);

    await act(async () => root.unmount());
    container.remove();
  });

  globals.__DOM_TESTS_DONE__ = true;
}

void main();
