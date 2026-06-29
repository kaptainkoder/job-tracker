import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { StructuredResume } from '../../shared/domain/resume';
import ResumeReviewPage from './ResumeReviewPage';

const LINKEDIN = 'https://www.linkedin.com/in/karan-example';
const RESUME: StructuredResume = {
  contact: {
    fullName: 'Karan Mahajan',
    title: 'Data Science Manager',
    location: 'Gurgaon, India',
    links: [{ label: 'LinkedIn', url: LINKEDIN }],
  },
  summary: 'A confirmed summary.',
  experience: [{ org: 'Acme', title: 'Manager', start: '2025', end: 'Present', bullets: ['Built X.'] }],
  education: [{ school: 'Example University', degree: 'MSc', start: '2018', end: '2020' }],
  awards: [{ title: 'Confirmed award' }],
  projects: [{ name: 'Confirmed project', bullets: ['Built Y.'] }],
  skills: [{ label: 'Technology', items: ['SQL'] }],
};

interface SupabaseRows {
  resume_structured?: unknown;
}

function rows(): SupabaseRows {
  return (globalThis as unknown as { __SUPABASE_ROWS__: SupabaseRows }).__SUPABASE_ROWS__;
}

const state = ((globalThis as unknown as { __DOM_TEST_STATE__?: { failures: number } }).__DOM_TEST_STATE__ ??= {
  failures: 0,
});

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

async function waitForText(text: RegExp) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (text.test(document.body.textContent ?? '')) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  assert.match(document.body.textContent ?? '', text);
}

async function mount() {
  rows().resume_structured = {
    user_id: 'user-1',
    content: structuredClone(RESUME),
    source_filename: 'base-resume.pdf',
    parsed_at: '2026-06-29T00:00:00Z',
    confirmed_at: '2026-06-29T00:00:00Z',
    created_at: '2026-06-29T00:00:00Z',
    updated_at: '2026-06-29T00:00:00Z',
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<ResumeReviewPage />));
  await waitForText(/Karan Mahajan/);
  return {
    async cleanup() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function sectionFor(heading: string): HTMLElement {
  const node = [...document.querySelectorAll('section h2')].find((el) => el.textContent?.trim() === heading);
  const section = node?.closest('section');
  assert.ok(section, `expected section ${heading}`);
  return section as HTMLElement;
}

function buttonIn(root: ParentNode, label: string): HTMLButtonElement {
  const button = [...root.querySelectorAll('button')].find((el) => el.textContent?.trim() === label);
  assert.ok(button, `expected ${label} button`);
  return button as HTMLButtonElement;
}

async function assertNewEntryCancelIsProvisional(heading: string) {
  const section = sectionFor(heading);
  const before = section.textContent;
  const save = buttonIn(document, 'Save résumé');
  assert.equal(save.disabled, true, 'loaded résumé starts clean');

  await act(async () => buttonIn(section, '+ Add').click());
  assert.ok(section.querySelector('input'), `${heading} new editor should open`);
  assert.equal(save.disabled, true, '+ Add must not dirty or mutate the résumé');

  await act(async () => buttonIn(section, 'Cancel').click());
  assert.equal(section.textContent, before, `${heading} must return to its exact prior rendered state`);
  assert.equal(section.querySelector('input'), null, `${heading} editor should close`);
  assert.doesNotMatch(document.body.textContent ?? '', /Untitled/, 'no provisional blank card may remain');
  assert.equal(save.disabled, true, 'Cancel must leave the source clean and unsaveable');
}

async function main() {
  for (const heading of ['Experience', 'Education', 'Honors & awards', 'Projects']) {
    await test(`${heading}: cancelling a new + Add editor never creates a blank record`, async () => {
      const { cleanup } = await mount();
      await assertNewEntryCancelIsProvisional(heading);
      await cleanup();
    });
  }

  await test('a recovered LinkedIn URL renders as a real safe link', async () => {
    const { cleanup } = await mount();
    const link = document.querySelector(`a[href="${LINKEDIN}"]`);
    assert.ok(link, 'LinkedIn annotation should remain clickable in the review header');
    assert.equal(link?.textContent, 'LinkedIn');
    assert.equal(link?.getAttribute('target'), '_blank');
    await cleanup();
  });
}

void main().then(() => {
  (globalThis as unknown as { __DOM_TESTS_DONE__?: boolean }).__DOM_TESTS_DONE__ = true;
});
