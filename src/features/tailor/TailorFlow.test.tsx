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
  __SUPABASE_UPDATES__: Array<Record<string, unknown>>;
  __SUPABASE_ROWS__: Record<string, ({ content?: unknown } & Record<string, unknown>) | null>;
  __COPIED_TEXT__?: string;
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

async function mount(onClose: () => void = () => {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TailorFlow application={APPLICATION} onClose={onClose} onArtifactSaved={() => {}} />);
  });
  await waitForText(/Approve before anything is sent/i);
  return async () => {
    await act(async () => root.unmount());
    container.remove();
  };
}

async function main() {
  await test('privacy review precedes the gap pause and cancelled exact-call approval causes zero egress', async () => {
    globals.__LLM_CALLS__.length = 0;
    globals.__SUPABASE_INSERTS__.length = 0;
    const cleanup = await mount();

    assert.doesNotMatch(document.body.textContent ?? '', /What demonstrates Python/i);
    assert.match(document.body.textContent ?? '', /manifest \+ SHA-256/i);
    assert.equal(globals.__LLM_CALLS__.length, 0, 'unresolved gap must block generation');
    await act(async () => click('Review privacy & continue'));
    await waitForText(/Nothing is claimed automatically/i);
    assert.match(document.body.textContent ?? '', /Python/);
    await act(async () => click('Not in my experience'));
    await act(async () => click('Generate the kit'));
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

    await act(async () => click('Review privacy & continue'));
    await act(async () => click('Not in my experience'));
    await act(async () => click('Generate the kit'));
    await act(async () => click('Approve & send'));
    await waitForText(/Cover letter sends a request/);
    await act(async () => click('Approve & send'));
    await waitForText(/Interview prep sends a request/);
    await act(async () => click('Approve & send'));
    await waitForText(/Your saved tailoring kit/i);

    assert.deepEqual(globals.__LLM_CALLS__.map((call) => call.action), ['tailor', 'cover', 'prep']);
    assert.equal(globals.__SUPABASE_INSERTS__.length, 3);
    assert.deepEqual(
      globals.__SUPABASE_INSERTS__.map((row) => row.kind),
      ['tailored-resume', 'cover-letter', 'prep'],
    );
    // The résumé action runs the STRUCTURED path (B6.4): the tab shows the flattened, readable
    // tailored résumé (not raw JSON, not the prose stub), and the persisted artifact is its JSON.
    assert.match(document.body.textContent ?? '', /Builds reliable data pipelines/);
    assert.match(document.body.textContent ?? '', /Example Co/);
    assert.doesNotMatch(document.body.textContent ?? '', /Generated tailor output/);
    assert.doesNotMatch(document.body.textContent ?? '', /"contact"/);
    const tailorRow = globals.__SUPABASE_INSERTS__.find((row) => row.kind === 'tailored-resume');
    assert.ok(tailorRow, 'expected a tailored-resume artifact');
    const persisted = JSON.parse(String(tailorRow!.content));
    assert.equal(persisted.contact.fullName, 'Karan', 'tailored résumé persists as StructuredResume JSON');
    assert.doesNotMatch(document.body.textContent ?? '', /Generated cover output/);
    await act(async () => click('Cover letter'));
    assert.match(document.body.textContent ?? '', /Generated cover output/);
    await act(async () => click('Interview prep'));
    assert.match(document.body.textContent ?? '', /Generated prep output/);
    assert.match(document.body.textContent ?? '', /Copy/);
    assert.match(document.body.textContent ?? '', /Download PDF/);
    await act(async () => click('Download PDF'));
    await waitForText(/client-side render/i);
    const preview = document.querySelector('[data-testid="resume-a4-preview"]');
    assert.ok(preview);
    // B6.4-R: the preview renders the ACTUAL generated PDF bytes to a <canvas> (preview == download).
    assert.ok(preview!.querySelector('canvas'), 'preview must paint the PDF onto a canvas');

    // The in-preview Download re-saves the cached bytes — no import()/fetch() on the click. Wait for
    // the bytes to load (button enables), then prove the click goes through the cached-bytes save path.
    const overlay = document.querySelector('[role="dialog"][aria-labelledby="pdf-preview-heading"]');
    assert.ok(overlay);
    const previewDownload = [...overlay!.querySelectorAll('button')].find((b) => b.textContent?.includes('Download PDF'));
    assert.ok(previewDownload, 'preview must offer its own Download PDF');
    for (let i = 0; i < 20 && (previewDownload as HTMLButtonElement).disabled; i += 1) {
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    }
    assert.equal((previewDownload as HTMLButtonElement).disabled, false, 'Download enables once bytes are ready');
    let savedFromCache = false;
    const urlApi = globalThis.URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const realCreate = urlApi.createObjectURL;
    const realRevoke = urlApi.revokeObjectURL;
    urlApi.createObjectURL = () => { savedFromCache = true; return '#'; }; // '#' avoids jsdom navigation
    urlApi.revokeObjectURL = () => {};
    try {
      await act(async () => previewDownload!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    } finally {
      urlApi.createObjectURL = realCreate;
      urlApi.revokeObjectURL = realRevoke;
    }
    assert.ok(savedFromCache, 'in-preview Download saves cached bytes (no click-time network)');
    await cleanup();
  });

  await test('Escape closes only the PDF preview and keeps saved Tailor results open', async () => {
    let flowCloseCount = 0;
    const cleanup = await mount(() => { flowCloseCount += 1; });

    await act(async () => click('Review privacy & continue'));
    await act(async () => click('Not in my experience'));
    await act(async () => click('Generate the kit'));
    await act(async () => click('Approve & send'));
    await waitForText(/Cover letter sends a request/);
    await act(async () => click('Approve & send'));
    await waitForText(/Interview prep sends a request/);
    await act(async () => click('Approve & send'));
    await waitForText(/Your saved tailoring kit/i);
    await act(async () => click('Download PDF'));
    await waitForText(/client-side render/i);

    await act(async () => {
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    assert.equal(flowCloseCount, 0, 'Escape from the PDF overlay must not close the Tailor flow');
    assert.match(document.body.textContent ?? '', /Your saved tailoring kit/i);
    assert.equal(document.querySelector('[aria-labelledby="pdf-preview-heading"]'), null);
    await act(async () => click('Download PDF'));
    await waitForText(/client-side render/i);
    assert.ok(document.querySelector('[data-testid="resume-a4-preview"]'), 'PDF preview should reopen');
    await cleanup();
  });

  await test('with no confirmed structured résumé the tailor action is gated and makes zero résumé egress', async () => {
    globals.__LLM_CALLS__.length = 0;
    globals.__SUPABASE_INSERTS__.length = 0;
    const savedResume = globals.__SUPABASE_ROWS__.resume_structured;
    globals.__SUPABASE_ROWS__.resume_structured = null;
    try {
      const cleanup = await mount();
      await act(async () => click('Review privacy & continue'));
      await act(async () => click('Not in my experience'));
      await act(async () => click('Generate the kit'));
      // The chain starts at the cover letter — the résumé action never fires.
      await act(async () => click('Approve & send'));
      await waitForText(/Interview prep sends a request/);
      await act(async () => click('Approve & send'));
      await waitForText(/Your saved tailoring kit/i);

      assert.deepEqual(globals.__LLM_CALLS__.map((call) => call.action), ['cover', 'prep']);
      assert.deepEqual(
        globals.__SUPABASE_INSERTS__.map((row) => row.kind),
        ['cover-letter', 'prep'],
      );
      await act(async () => click('Tailored résumé'));
      assert.match(document.body.textContent ?? '', /Set up your résumé first/i);
      // No structured résumé → the Download PDF action is disabled (nothing to render).
      const download = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Download PDF'));
      assert.ok((download as HTMLButtonElement | undefined)?.disabled, 'Download must be disabled with no résumé');
      await cleanup();
    } finally {
      globals.__SUPABASE_ROWS__.resume_structured = savedResume;
    }
  });

  await test('G3-persist: restoring in the review re-persists the source résumé byte-for-byte', async () => {
    globals.__LLM_CALLS__.length = 0;
    globals.__SUPABASE_INSERTS__.length = 0;
    globals.__SUPABASE_UPDATES__.length = 0;
    const cleanup = await mount();

    await act(async () => click('Review privacy & continue'));
    await act(async () => click('Not in my experience'));
    await act(async () => click('Generate the kit'));
    await act(async () => click('Approve & send'));
    await waitForText(/Cover letter sends a request/);
    await act(async () => click('Approve & send'));
    await waitForText(/Interview prep sends a request/);
    await act(async () => click('Approve & send'));
    await waitForText(/Your saved tailoring kit/i);

    // The tailor tab is active; the review shows the reworded bullet as a change, so restore is live.
    assert.match(document.body.textContent ?? '', /What tailoring changed/i);
    // No re-persist has fired yet — the initial save at generation is the only write so far.
    assert.equal(globals.__SUPABASE_UPDATES__.length, 0, 'no edit yet ⇒ no re-persist');

    await act(async () => click('Restore original'));

    // Restoring re-persists onto the SAME artifact row, byte-equal to the confirmed source résumé.
    assert.ok(globals.__SUPABASE_UPDATES__.length >= 1, 'restore must re-persist the edit');
    const last = globals.__SUPABASE_UPDATES__[globals.__SUPABASE_UPDATES__.length - 1];
    const persisted = JSON.parse(String(last.content));
    const source = globals.__SUPABASE_ROWS__.resume_structured?.content;
    assert.deepEqual(persisted, source, 'restored tailored résumé equals the source byte-for-byte');
    // The review now reports no outstanding changes (preview == download == saved).
    assert.match(document.body.textContent ?? '', /nothing was added, reworded, or dropped/i);
    await cleanup();
  });

  globals.__DOM_TESTS_DONE__ = true;
}

void main();
