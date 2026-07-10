import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import ApplicationForm from './ApplicationForm';

// UI-level regression coverage for the Add/Edit application modal (Job Tracker's most-used
// interactive component, currently the one form in src/features/tracker/ with zero test
// coverage). Renders the real component and drives it through user interactions: required-field
// validation blocking submit, a successful save calling back exactly once, the quick-add parse
// merge never clobbering a field the user already typed, and Escape closing the modal.
// (Supabase + AuthProvider are stubbed by scripts/run-dom-test.mjs.)

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

// Set a controlled input's value the way a real keystroke does, so React's onChange fires.
function setInputValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}

// Same, for the controlled paste textarea (a different DOM prototype than HTMLInputElement).
function setTextareaValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}

function clickByText(text: string) {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  assert.ok(btn, `expected a button containing "${text}"`);
  btn!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

async function mount(onSaved: () => void = () => {}, onClose: () => void = () => {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ApplicationForm mode="add" onClose={onClose} onSaved={onSaved} />);
  });
  return {
    async cleanup() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function main() {
await test('add mode: required-field validation blocks submit and shows inline errors', async () => {
  let saved = 0;
  const { cleanup } = await mount(() => {
    saved += 1;
  });

  const form = document.querySelector('form');
  assert.ok(form, 'the add-application form should be rendered');
  await act(async () => {
    form!.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  });

  assert.equal(saved, 0, 'submit with blank required fields must not call onSaved');
  assert.match(document.body.textContent ?? '', /Company is required\./);
  assert.match(document.body.textContent ?? '', /Role is required\./);

  await cleanup();
});

await test('add mode: filling required fields and submitting calls onSaved exactly once', async () => {
  let saved = 0;
  const { cleanup } = await mount(() => {
    saved += 1;
  });

  const companyInput = document.getElementById('company') as HTMLInputElement | null;
  const roleInput = document.getElementById('role') as HTMLInputElement | null;
  assert.ok(companyInput, 'company input should be present');
  assert.ok(roleInput, 'role input should be present');
  await act(async () => setInputValue(companyInput!, 'Acme Corp'));
  await act(async () => setInputValue(roleInput!, 'Senior Engineer'));

  const form = document.querySelector('form');
  assert.ok(form, 'the add-application form should be rendered');
  await act(async () => {
    form!.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  });

  assert.equal(saved, 1, 'a valid submit calls onSaved exactly once');

  await cleanup();
});

await test('quick-add parse fills blank fields but never overwrites a field the user already typed', async () => {
  const { cleanup } = await mount();

  const companyInput = document.getElementById('company') as HTMLInputElement | null;
  assert.ok(companyInput, 'company input should be present');
  await act(async () => setInputValue(companyInput!, 'Already Typed Inc'));

  const pasteInput = document.getElementById('paste-input') as HTMLTextAreaElement | null;
  assert.ok(pasteInput, 'paste-input textarea should be present in add mode');
  await act(async () =>
    setTextareaValue(pasteInput!, 'Senior Engineer at Acme Corp\nhttps://example.com/job/123'),
  );

  await act(async () => clickByText('Parse'));

  assert.equal(
    companyInput!.value,
    'Already Typed Inc',
    'parse merge must never overwrite a field the user already typed',
  );

  await cleanup();
});

await test('Escape key closes the modal (ModalShell behavior)', async () => {
  let closed = 0;
  const { cleanup } = await mount(() => {}, () => {
    closed += 1;
  });

  await act(async () => {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });

  assert.equal(closed, 1, 'Escape should call onClose exactly once');

  await cleanup();
});
}

// Run sequentially (each test mounts/unmounts its own root), then signal the runner. Reached
// even if a test failed — the harness records failures rather than throwing.
void main().then(() => {
  (globalThis as unknown as { __DOM_TESTS_DONE__?: boolean }).__DOM_TESTS_DONE__ = true;
});
