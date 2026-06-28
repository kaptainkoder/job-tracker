import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Application } from '../../shared/types';
import { todayISODate } from '../outcomes/outcomes';
import ApplicationDetail from './ApplicationDetail';

// UI-level regression for the B-D0 #9 future-date bug: production accepted a tomorrow-dated
// outcome and closed the form instead of blocking it. This test renders the real component,
// opens the outcome form, drives the date input through React's controlled-input path, submits,
// and asserts the inline error shows, the form stays open, and ZERO Supabase inserts fired.
// (Supabase + AuthProvider are stubbed by scripts/run-dom-test.mjs; the insert stub records
// every payload on globalThis.__SUPABASE_INSERTS__.)

interface InsertSink {
  __SUPABASE_INSERTS__: unknown[];
}
const inserts = () => (globalThis as unknown as InsertSink).__SUPABASE_INSERTS__;
const rows = () => (globalThis as unknown as { __SUPABASE_ROWS__: { artifacts: unknown[] } }).__SUPABASE_ROWS__;

// Tiny deterministic harness. We don't use node:test here because its exitCode is only set
// asynchronously at process end, which races the runner's forced exit (React keeps the loop
// alive, so the runner must exit explicitly). This harness counts failures synchronously so
// scripts/run-dom-test.mjs can read the result and exit with the right code.
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

const APP: Application = {
  id: 'app-1',
  user_id: 'user-1',
  company: 'Acme',
  role: 'Engineer',
  stage: 'applied',
  priority: 'medium',
  source: null,
  job_url: null,
  jd_text: null,
  job_location: null,
  work_mode: null,
  employment_type: null,
  salary_min: null,
  salary_max: null,
  salary_currency: null,
  salary_period: null,
  contact_name: null,
  contact_email: null,
  date_applied: '2026-06-01',
  deadline: null,
  next_action_date: null,
  notes: null,
  created_at: '2026-06-01T00:00:00Z',
  last_activity_at: '2026-06-20T00:00:00Z',
};

function tomorrowISO(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// Set a controlled input's value the way a real keystroke does, so React's onChange fires.
function setInputValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}

function clickByText(text: string) {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  assert.ok(btn, `expected a button containing "${text}"`);
  btn!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

async function waitForText(text: RegExp) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (text.test(document.body.textContent ?? '')) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  assert.match(document.body.textContent ?? '', text);
}

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ApplicationDetail application={APP} onClose={() => {}} onEdit={() => {}} onChanged={() => {}} />,
    );
  });
  return {
    async cleanup() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function main() {
await test('future outcome date is blocked: inline error, form stays open, zero inserts', async () => {
  inserts().length = 0;
  rows().artifacts = [];
  const { cleanup } = await mount();

  // Open the outcome form.
  await act(async () => clickByText('Log outcome'));
  const dateInput = document.getElementById('outcome-date') as HTMLInputElement | null;
  assert.ok(dateInput, 'outcome date input should be present after opening the form');

  // Native guard is in place...
  assert.equal(dateInput!.getAttribute('max'), todayISODate(), 'date input keeps the native max=today');

  // ...but drive a future date through React state and submit anyway.
  await act(async () => setInputValue(dateInput!, tomorrowISO()));
  const form = document.querySelector('form');
  assert.ok(form, 'outcome form should be rendered');
  await act(async () => {
    form!.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  });

  // The fix: nothing was inserted, the form is still open, and the inline error is shown.
  assert.equal(inserts().length, 0, 'no Supabase insert should fire for a future date');
  assert.ok(document.getElementById('outcome-date'), 'the form stays open on a validation error');
  assert.match(document.body.textContent ?? '', /in the future/, 'inline future-date error is shown');

  await cleanup();
});

await test('control: a valid (today) outcome date does insert exactly once', async () => {
  inserts().length = 0;
  rows().artifacts = [];
  const { cleanup } = await mount();

  await act(async () => clickByText('Log outcome'));
  const dateInput = document.getElementById('outcome-date') as HTMLInputElement | null;
  assert.ok(dateInput);

  await act(async () => setInputValue(dateInput!, todayISODate()));
  const form = document.querySelector('form');
  await act(async () => {
    form!.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  });

  // Proves the harness genuinely drives the submit path — so the zero-insert above is meaningful.
  assert.equal(inserts().length, 1, 'a valid date inserts exactly one outcome');

  await cleanup();
});

await test('saved tailored résumé opens and closes its PDF preview without another LLM run', async () => {
  inserts().length = 0;
  rows().artifacts = [{
    id: 'artifact-resume-1',
    user_id: 'user-1',
    application_id: APP.id,
    kind: 'tailored-resume',
    content: '# Karan\n\n## Experience\n\n- Built a tested data pipeline.',
    model: 'anthropic/claude-sonnet-4-6',
    created_at: '2026-06-29T00:00:00Z',
  }];
  const { cleanup } = await mount();
  await waitForText(/1 artifact/);

  await act(async () => clickByText('Preview PDF'));
  await waitForText(/client-side render/i);
  assert.ok(document.querySelector('iframe[title="A4 résumé preview"]'));
  assert.equal(inserts().length, 0, 'previewing a saved artifact must not insert or regenerate anything');

  await act(async () => {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  assert.match(document.body.textContent ?? '', /Saved tailoring/);
  assert.equal(document.querySelector('[aria-labelledby="pdf-preview-heading"]'), null);

  await cleanup();
});
}

// Run sequentially (each test mounts/unmounts its own root), then signal the runner. Reached
// even if a test failed — the harness records failures rather than throwing.
void main().then(() => {
  (globalThis as unknown as { __DOM_TESTS_DONE__?: boolean }).__DOM_TESTS_DONE__ = true;
});
