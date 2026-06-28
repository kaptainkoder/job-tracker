import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Application } from '../../shared/types';
import TailorFlow from './TailorFlow';

interface TestGlobals {
  __DOM_TEST_STATE__?: { failures: number };
  __DOM_TESTS_DONE__?: boolean;
  __LLM_CALLS__: Array<{ action: string }>;
  __SUPABASE_INSERTS__: Array<Record<string, unknown>>;
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

const APPLICATION: Application = {
  id: 'app-1', user_id: 'user-1', company: 'Acme', role: 'Data engineer', stage: 'applied',
  priority: 'medium', source: null, job_url: null,
  jd_text: 'Python and SQL are required for this role.', job_location: null, work_mode: null,
  employment_type: null, salary_min: null, salary_max: null, salary_currency: null,
  salary_period: null, contact_name: null, contact_email: null, date_applied: '2026-06-01',
  deadline: null, next_action_date: null, notes: null, created_at: '2026-06-01T00:00:00Z',
  last_activity_at: '2026-06-20T00:00:00Z',
};

function click(text: string) {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(text));
  assert.ok(button, `expected button containing "${text}"`);
  button!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
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
    root.render(<TailorFlow application={APPLICATION} onClose={() => {}} onArtifactSaved={() => {}} />);
  });
  await waitForText(/Before anything is generated/i);
  return async () => {
    await act(async () => root.unmount());
    container.remove();
  };
}

async function main() {
  await test('gap pause and cancelled preflight cause zero egress and zero artifact writes', async () => {
    globals.__LLM_CALLS__.length = 0;
    globals.__SUPABASE_INSERTS__.length = 0;
    const cleanup = await mount();

    assert.match(document.body.textContent ?? '', /Python/);
    assert.equal(globals.__LLM_CALLS__.length, 0, 'unresolved gap must block generation');
    await act(async () => click('Not in my experience'));
    await act(async () => click('Continue to privacy review'));
    await waitForText(/Approve before sending/);
    await act(async () => click('Cancel'));

    assert.equal(globals.__LLM_CALLS__.length, 0, 'cancelled preflight must make zero LLM calls');
    assert.equal(globals.__SUPABASE_INSERTS__.length, 0, 'cancelled preflight must persist nothing');
    await cleanup();
  });

  await test('approved tailor, cover, and prep each stream and persist before advancing', async () => {
    globals.__LLM_CALLS__.length = 0;
    globals.__SUPABASE_INSERTS__.length = 0;
    const cleanup = await mount();

    await act(async () => click('Not in my experience'));
    await act(async () => click('Continue to privacy review'));
    await act(async () => click('Approve & send'));
    await waitForText(/Cover letter sends a request/);
    await act(async () => click('Approve & send'));
    await waitForText(/Interview prep sends a request/);
    await act(async () => click('Approve & send'));
    await waitForText(/Done/);

    assert.deepEqual(globals.__LLM_CALLS__.map((call) => call.action), ['tailor', 'cover', 'prep']);
    assert.equal(globals.__SUPABASE_INSERTS__.length, 3);
    assert.deepEqual(
      globals.__SUPABASE_INSERTS__.map((row) => row.kind),
      ['tailored-resume', 'cover-letter', 'prep'],
    );
    assert.match(document.body.textContent ?? '', /Generated tailor output/);
    assert.match(document.body.textContent ?? '', /Generated cover output/);
    assert.match(document.body.textContent ?? '', /Generated prep output/);
    await cleanup();
  });

  globals.__DOM_TESTS_DONE__ = true;
}

void main();
