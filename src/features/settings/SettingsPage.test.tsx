import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import SettingsPage from './SettingsPage';
import { settingsFormToPayload } from './settings';

// DOM coverage for the Settings page — the only page with no sibling test before this wave.
// Locks the model picker, no-log switch, save flow, and (the load-bearing guarantee) the
// pre-flight gate around the model ping: real OpenRouter egress must never fire un-gated, while
// the free echo test runs immediately. Copies the __SUPABASE_TEST__ enqueue/defer harness from
// TrackerPage.test.tsx.

interface QueryRecord {
  table: string;
  operation: string;
  selected: string | null;
  filters: Array<{ column: string; value: unknown }>;
  order: { column: string; options: unknown } | null;
  payload: unknown;
  options?: unknown;
}

interface SupabaseResult {
  data: unknown;
  error: { message: string } | null;
}

interface SupabaseTestControl {
  queries: QueryRecord[];
  reset: () => void;
  enqueue: (table: string, result: SupabaseResult, operation?: string) => void;
  defer: (table: string, operation?: string) => {
    resolve: (result: SupabaseResult) => void;
  };
}

const controls = () =>
  (globalThis as unknown as { __SUPABASE_TEST__: SupabaseTestControl }).__SUPABASE_TEST__;

globalThis.fetch = async () => {
  throw new Error('SettingsPage DOM tests must not make network requests');
};

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

function upsertPayloads() {
  return (globalThis as unknown as { __SUPABASE_UPSERTS__: unknown[] }).__SUPABASE_UPSERTS__;
}

function llmCalls() {
  return (globalThis as unknown as { __LLM_CALLS__: Array<{ action: string }> }).__LLM_CALLS__;
}

function settingsQueries(operation = 'select') {
  return controls().queries.filter(
    (query) => query.table === 'user_settings' && query.operation === operation,
  );
}

function clickButton(text: string, exact = true) {
  const button = [...document.querySelectorAll('button')].find((candidate) =>
    exact ? candidate.textContent?.trim() === text : candidate.textContent?.includes(text),
  );
  assert.ok(button, `expected a button ${exact ? 'equal to' : 'containing'} "${text}"`);
  button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function radios() {
  return [...document.querySelectorAll('[role="radiogroup"] [role="radio"]')];
}

function radioByLabel(label: string) {
  const radio = radios().find((candidate) => candidate.textContent?.includes(label));
  assert.ok(radio, `expected a radio for "${label}"`);
  return radio;
}

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<SettingsPage />);
  });
  return {
    container,
    async cleanup() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function main() {
  await test('1: loads and renders without hanging (smoke)', async () => {
    controls().reset();
    const mounted = await mount();
    try {
      assert.match(document.body.textContent ?? '', /Settings/);
    } finally {
      await mounted.cleanup();
    }
  });

  await test('2: loading spinner renders while deferred, then Settings heading after resolve', async () => {
    controls().reset();
    const request = controls().defer('user_settings');
    const mounted = await mount();
    try {
      const status = document.querySelector('[role="status"]');
      assert.ok(status, 'loading status should be present while the settings request is pending');
      assert.match(status.textContent ?? '', /Loading settings/);
      assert.equal([...document.querySelectorAll('h1')].length, 0, 'Settings heading should not render yet');

      await act(async () => {
        request.resolve({
          data: {
            user_id: 'user-1',
            model: 'anthropic/claude-sonnet-4-6',
            no_log: true,
            created_at: '2026-06-01T00:00:00Z',
            updated_at: '2026-06-01T00:00:00Z',
          },
          error: null,
        });
      });

      const heading = document.querySelector('h1');
      assert.ok(heading);
      assert.equal(heading.textContent, 'Settings');
      assert.equal(document.querySelector('[role="status"]'), null);
    } finally {
      await mounted.cleanup();
    }
  });

  await test('3: loaded model radiogroup checks the stub row model and unchecks the rest', async () => {
    controls().reset();
    const mounted = await mount();
    try {
      await act(async () => {});
      const active = radioByLabel('Claude Sonnet 4.6');
      assert.equal(active.getAttribute('aria-checked'), 'true');
      const others = radios().filter((radio) => radio !== active);
      assert.ok(others.length > 0);
      for (const radio of others) {
        assert.equal(radio.getAttribute('aria-checked'), 'false');
      }
    } finally {
      await mounted.cleanup();
    }
  });

  await test('4: no-log switch reflects the loaded no_log=true', async () => {
    controls().reset();
    const mounted = await mount();
    try {
      await act(async () => {});
      const switchEl = document.querySelector('[role="switch"]');
      assert.ok(switchEl);
      assert.equal(switchEl.getAttribute('aria-checked'), 'true');
    } finally {
      await mounted.cleanup();
    }
  });

  await test('5: selecting a different model radio moves aria-checked', async () => {
    controls().reset();
    const mounted = await mount();
    try {
      await act(async () => {});
      const sonnet = radioByLabel('Claude Sonnet 4.6');
      const opus = radioByLabel('Claude Opus 4.8');
      assert.equal(sonnet.getAttribute('aria-checked'), 'true');
      assert.equal(opus.getAttribute('aria-checked'), 'false');

      await act(async () => {
        opus.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      });

      assert.equal(radioByLabel('Claude Opus 4.8').getAttribute('aria-checked'), 'true');
      assert.equal(radioByLabel('Claude Sonnet 4.6').getAttribute('aria-checked'), 'false');
    } finally {
      await mounted.cleanup();
    }
  });

  await test('6: toggling the no-log switch flips aria-checked true to false', async () => {
    controls().reset();
    const mounted = await mount();
    try {
      await act(async () => {});
      const switchEl = document.querySelector('[role="switch"]');
      assert.ok(switchEl);
      assert.equal(switchEl.getAttribute('aria-checked'), 'true');

      await act(async () => {
        switchEl.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      });

      assert.equal(document.querySelector('[role="switch"]')?.getAttribute('aria-checked'), 'false');
    } finally {
      await mounted.cleanup();
    }
  });

  await test('7: save success fires exactly one upsert matching settingsFormToPayload and shows the success message', async () => {
    controls().reset();
    const mounted = await mount();
    try {
      await act(async () => {});
      const form = document.querySelector('form');
      assert.ok(form);
      await act(async () => {
        form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      });

      assert.equal(upsertPayloads().length, 1, 'save should upsert exactly once');
      assert.deepEqual(
        upsertPayloads()[0],
        settingsFormToPayload('user-1', { model: 'anthropic/claude-sonnet-4-6', no_log: true }),
      );
      const upsertQuery = settingsQueries('upsert')[0];
      assert.ok(upsertQuery);
      assert.deepEqual(upsertQuery.options, { onConflict: 'user_id' });
      assert.match(document.body.textContent ?? '', /Settings saved\./);
    } finally {
      await mounted.cleanup();
    }
  });

  await test('8: save error renders the alert with the server message and no success text', async () => {
    controls().reset();
    const mounted = await mount();
    try {
      await act(async () => {});
      controls().enqueue('user_settings', { data: null, error: { message: 'boom' } }, 'upsert');

      const form = document.querySelector('form');
      assert.ok(form);
      await act(async () => {
        form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      });

      const alert = document.querySelector('[role="alert"]');
      assert.ok(alert);
      assert.equal(alert.textContent, 'Could not save settings. boom');
      assert.doesNotMatch(document.body.textContent ?? '', /Settings saved\./);
    } finally {
      await mounted.cleanup();
    }
  });

  await test('9: saving state disables the Save button and reads Saving… until resolve', async () => {
    controls().reset();
    const mounted = await mount();
    try {
      await act(async () => {});
      const request = controls().defer('user_settings', 'upsert');

      const form = document.querySelector('form');
      assert.ok(form);
      await act(async () => {
        form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      });

      const saveButton = [...document.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Saving…'),
      );
      assert.ok(saveButton, 'expected a Saving… button while the upsert is in flight');
      assert.equal(saveButton.disabled, true);

      await act(async () => {
        request.resolve({
          data: { user_id: 'user-1', model: 'anthropic/claude-sonnet-4-6', no_log: true },
          error: null,
        });
      });

      const restoredButton = [...document.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Save settings'),
      );
      assert.ok(restoredButton);
      assert.equal(restoredButton.disabled, false);
    } finally {
      await mounted.cleanup();
    }
  });

  await test('10: load error alerts with Try again, which fires a fresh select', async () => {
    controls().reset();
    controls().enqueue('user_settings', { data: null, error: { message: 'nope' } }, 'select');
    const mounted = await mount();
    try {
      await act(async () => {});
      const alert = document.querySelector('[role="alert"]');
      assert.ok(alert);
      assert.match(alert.textContent ?? '', /We couldn.t load your settings/);
      assert.match(alert.textContent ?? '', /nope/);
      assert.equal(settingsQueries().length, 1);

      await act(async () => {
        clickButton('Try again');
      });
      await act(async () => {});

      assert.equal(settingsQueries().length, 2, 'Try again should issue exactly one fresh select');
    } finally {
      await mounted.cleanup();
    }
  });

  await test('11: echo runs ungated, opens no dialog, and renders the stream output', async () => {
    controls().reset();
    const mounted = await mount();
    try {
      await act(async () => {});
      const before = llmCalls().length;

      await act(async () => {
        clickButton('Test streaming (free)');
      });

      assert.equal(document.querySelector('[role="dialog"]'), null);
      assert.equal(llmCalls().length, before + 1);
      const call = llmCalls()[llmCalls().length - 1];
      assert.equal(call.action, 'echo');
      assert.match(document.body.textContent ?? '', /Generated echo output\./);
    } finally {
      await mounted.cleanup();
    }
  });

  await test('12: first ping opens the PreflightModal and calls streamLlm zero times', async () => {
    controls().reset();
    const mounted = await mount();
    try {
      await act(async () => {});

      await act(async () => {
        clickButton('Ping the model', false);
      });

      assert.ok(document.querySelector('[role="dialog"]'), 'the pre-flight dialog should open on first ping');
      assert.equal(
        llmCalls().some((call) => call.action === 'ping'),
        false,
        'no ungated ping call should reach streamLlm',
      );
    } finally {
      await mounted.cleanup();
    }
  });

  await test('13: approving the ping closes the dialog, calls streamLlm once, and a second ping stays ungated', async () => {
    controls().reset();
    const mounted = await mount();
    try {
      await act(async () => {});

      await act(async () => {
        clickButton('Ping the model', false);
      });
      assert.ok(document.querySelector('[role="dialog"]'));

      await act(async () => {
        clickButton('Approve & send', false);
      });

      assert.equal(document.querySelector('[role="dialog"]'), null, '13a: approving should close the dialog');
      assert.equal(
        llmCalls().filter((call) => call.action === 'ping').length,
        1,
        '13a: approving should call streamLlm exactly once with action ping',
      );
      assert.match(document.body.textContent ?? '', /Logged to your privacy log\./);

      const pingCallsBeforeSecond = llmCalls().filter((call) => call.action === 'ping').length;
      await act(async () => {
        clickButton('Ping the model', false);
      });

      assert.equal(
        document.querySelector('[role="dialog"]'),
        null,
        '13b: a second ping in the same mount must not reopen the dialog',
      );
      assert.equal(
        llmCalls().filter((call) => call.action === 'ping').length,
        pingCallsBeforeSecond + 1,
        '13b: the second ping should call streamLlm directly',
      );
    } finally {
      await mounted.cleanup();
    }
  });

  await test('14: cancelling the ping closes the dialog, adds no ping call, and leaves stream output empty', async () => {
    controls().reset();
    const mounted = await mount();
    try {
      await act(async () => {});

      await act(async () => {
        clickButton('Ping the model', false);
      });
      assert.ok(document.querySelector('[role="dialog"]'));

      const pingCallsBeforeCancel = llmCalls().filter((call) => call.action === 'ping').length;
      await act(async () => {
        clickButton('Cancel', false);
      });

      assert.equal(document.querySelector('[role="dialog"]'), null);
      assert.equal(
        llmCalls().filter((call) => call.action === 'ping').length,
        pingCallsBeforeCancel,
        'cancelling must not add a ping call',
      );
      assert.doesNotMatch(document.body.textContent ?? '', /Generated ping output\./);
    } finally {
      await mounted.cleanup();
    }
  });
}

void main().then(() => {
  (globalThis as unknown as { __DOM_TESTS_DONE__?: boolean }).__DOM_TESTS_DONE__ = true;
});
