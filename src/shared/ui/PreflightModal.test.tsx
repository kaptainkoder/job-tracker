import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import PreflightModal from './PreflightModal';
import { PRIVACY_CATEGORY_LABEL, type PrivacyManifest } from '../domain/privacy';

// Direct DOM coverage for the approve-before-send gate. This deliberately exercises the public
// PreflightModal surface: the busy lock that guards Escape/overlay dismissal mid-flight, the
// sent/withheld manifest rendering (including the zero-egress empty state), the approve/cancel
// wiring, and the a11y dialog contract — so a refactor that quietly breaks the egress gate fails
// the gate instead of shipping silently.
const state = ((globalThis as unknown as { __DOM_TEST_STATE__?: { failures: number } }).__DOM_TEST_STATE__ ??= {
  failures: 0,
});

const originalFetch = globalThis.fetch;
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
  globalThis.fetch = () => {
    throw new Error('network forbidden in preflight DOM tests');
  };
}

async function restoreEnvironment() {
  await cleanupMounted();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
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

async function pressEscape() {
  await act(async () => {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
}

function makeManifest(sent: PrivacyManifest['sent'], withheld: PrivacyManifest['withheld']): PrivacyManifest {
  return { sent, withheld };
}

interface Callbacks {
  onApprove: () => void;
  onCancel: () => void;
  approvals: () => number;
  cancels: () => number;
}

function makeCallbacks(): Callbacks {
  let approvals = 0;
  let cancels = 0;
  return {
    onApprove: () => {
      approvals += 1;
    },
    onCancel: () => {
      cancels += 1;
    },
    approvals: () => approvals,
    cancels: () => cancels,
  };
}

async function main() {
  await test('1: open=false renders null (no dialog element)', async () => {
    const { onApprove, onCancel } = makeCallbacks();
    const container = await mount(
      <PreflightModal
        open={false}
        targetLabel="OpenRouter"
        actionLabel="Ping the model"
        manifest={makeManifest([], [])}
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    );
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal(container.innerHTML, '');
  });

  await test('2: non-empty manifest.sent renders one <li> per category via the real label map', async () => {
    const { onApprove, onCancel } = makeCallbacks();
    const sent: PrivacyManifest['sent'] = ['resume', 'contact-info', 'skills'];
    const container = await mount(
      <PreflightModal
        open
        targetLabel="OpenRouter"
        actionLabel="Ping the model"
        manifest={makeManifest(sent, [])}
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    );
    const dialog = container.querySelector('[role="dialog"]');
    assert.ok(dialog);
    const sentList = dialog!.querySelectorAll('ul')[0];
    assert.ok(sentList);
    const items = [...sentList.querySelectorAll('li')].map((li) => li.textContent);
    assert.deepEqual(items, sent.map((category) => PRIVACY_CATEGORY_LABEL[category]));
  });

  await test('3: manifest.sent = [] renders no Sent <ul> and the exact empty-state copy', async () => {
    const { onApprove, onCancel } = makeCallbacks();
    const container = await mount(
      <PreflightModal
        open
        targetLabel="OpenRouter"
        actionLabel="Ping the model"
        manifest={makeManifest([], ['resume'])}
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    );
    const dialog = container.querySelector('[role="dialog"]');
    assert.ok(dialog);
    // Only the Not-sent column's <ul> should exist — zero <ul> would mean neither column rendered.
    const lists = dialog!.querySelectorAll('ul');
    assert.equal(lists.length, 1, 'only the Not-sent <ul> renders when Sent is empty');
    const paragraphs = [...dialog!.querySelectorAll('p')].map((p) => p.textContent);
    assert.ok(
      paragraphs.includes('Nothing from your profile — only a short test message.'),
      'empty-state copy must match exactly, including the em dash',
    );
  });

  await test('4: manifest.withheld renders one <li> per category via the real label map', async () => {
    const { onApprove, onCancel } = makeCallbacks();
    const withheld: PrivacyManifest['withheld'] = ['salary', 'education', 'work-history'];
    const container = await mount(
      <PreflightModal
        open
        targetLabel="OpenRouter"
        actionLabel="Ping the model"
        manifest={makeManifest(['skills'], withheld)}
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    );
    const dialog = container.querySelector('[role="dialog"]');
    assert.ok(dialog);
    const notSentList = dialog!.querySelectorAll('ul')[1];
    assert.ok(notSentList);
    const items = [...notSentList.querySelectorAll('li')].map((li) => li.textContent);
    assert.deepEqual(items, withheld.map((category) => PRIVACY_CATEGORY_LABEL[category]));
  });

  await test('5: Escape with busy=false calls onCancel once and onApprove zero times', async () => {
    const { onApprove, onCancel, approvals, cancels } = makeCallbacks();
    await mount(
      <PreflightModal
        open
        targetLabel="OpenRouter"
        actionLabel="Ping the model"
        manifest={makeManifest([], [])}
        busy={false}
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    );
    await pressEscape();
    assert.equal(cancels(), 1);
    assert.equal(approvals(), 0);
  });

  await test('6: Escape with busy=true is a no-op (onCancel zero times)', async () => {
    const { onApprove, onCancel, cancels } = makeCallbacks();
    await mount(
      <PreflightModal
        open
        targetLabel="OpenRouter"
        actionLabel="Ping the model"
        manifest={makeManifest([], [])}
        busy
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    );
    await pressEscape();
    assert.equal(cancels(), 0);
  });

  await test('7: clicking the outer overlay with busy=false calls onCancel once', async () => {
    const { onApprove, onCancel, cancels } = makeCallbacks();
    const container = await mount(
      <PreflightModal
        open
        targetLabel="OpenRouter"
        actionLabel="Ping the model"
        manifest={makeManifest([], [])}
        busy={false}
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    );
    const overlay = container.querySelector('.fixed.inset-0');
    assert.ok(overlay);
    await click(overlay);
    assert.equal(cancels(), 1);
  });

  await test('8: clicking the outer overlay with busy=true calls onCancel zero times', async () => {
    const { onApprove, onCancel, cancels } = makeCallbacks();
    const container = await mount(
      <PreflightModal
        open
        targetLabel="OpenRouter"
        actionLabel="Ping the model"
        manifest={makeManifest([], [])}
        busy
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    );
    const overlay = container.querySelector('.fixed.inset-0');
    assert.ok(overlay);
    await click(overlay);
    assert.equal(cancels(), 0);
  });

  await test('9: clicking inside the inner card does not cancel (stopPropagation holds)', async () => {
    const { onApprove, onCancel, cancels } = makeCallbacks();
    const container = await mount(
      <PreflightModal
        open
        targetLabel="OpenRouter"
        actionLabel="Ping the model"
        manifest={makeManifest([], [])}
        busy={false}
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    );
    const title = container.querySelector('#preflight-title');
    assert.ok(title);
    await click(title);
    assert.equal(cancels(), 0);
  });

  await test('10: busy=true disables both buttons and shows the Sending… label', async () => {
    const { onApprove, onCancel } = makeCallbacks();
    const container = await mount(
      <PreflightModal
        open
        targetLabel="OpenRouter"
        actionLabel="Ping the model"
        manifest={makeManifest([], [])}
        busy
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    );
    const buttons = [...container.querySelectorAll('button')];
    assert.equal(buttons.length, 2);
    const cancelButton = buttons.find((button) => button.textContent === 'Cancel');
    const approveButton = buttons.find((button) => button.textContent?.includes('Sending…'));
    assert.ok(cancelButton);
    assert.ok(approveButton);
    assert.equal(cancelButton!.disabled, true);
    assert.equal(approveButton!.disabled, true);
    assert.ok(approveButton!.textContent?.includes('Sending…'));
  });

  await test('11: busy=false shows Approve & send and neither button is disabled', async () => {
    const { onApprove, onCancel } = makeCallbacks();
    const container = await mount(
      <PreflightModal
        open
        targetLabel="OpenRouter"
        actionLabel="Ping the model"
        manifest={makeManifest([], [])}
        busy={false}
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    );
    const buttons = [...container.querySelectorAll('button')];
    const cancelButton = buttons.find((button) => button.textContent === 'Cancel');
    const approveButton = buttons.find((button) => button.textContent?.includes('Approve & send'));
    assert.ok(cancelButton);
    assert.ok(approveButton);
    assert.equal(cancelButton!.disabled, false);
    assert.equal(approveButton!.disabled, false);
  });

  await test('12: clicking the enabled Approve button calls onApprove once and onCancel zero', async () => {
    const { onApprove, onCancel, approvals, cancels } = makeCallbacks();
    const container = await mount(
      <PreflightModal
        open
        targetLabel="OpenRouter"
        actionLabel="Ping the model"
        manifest={makeManifest([], [])}
        busy={false}
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    );
    const approveButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Approve & send'),
    );
    assert.ok(approveButton);
    await click(approveButton!);
    assert.equal(approvals(), 1);
    assert.equal(cancels(), 0);
  });

  await test('13: clicking the enabled Cancel button calls onCancel once and onApprove zero', async () => {
    const { onApprove, onCancel, approvals, cancels } = makeCallbacks();
    const container = await mount(
      <PreflightModal
        open
        targetLabel="OpenRouter"
        actionLabel="Ping the model"
        manifest={makeManifest([], [])}
        busy={false}
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    );
    const cancelButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Cancel',
    );
    assert.ok(cancelButton);
    await click(cancelButton!);
    assert.equal(cancels(), 1);
    assert.equal(approvals(), 0);
  });

  await test('14: a11y dialog contract — role, aria-modal, aria-labelledby, and heading text', async () => {
    const { onApprove, onCancel } = makeCallbacks();
    const container = await mount(
      <PreflightModal
        open
        targetLabel="OpenRouter"
        actionLabel="Ping the model"
        manifest={makeManifest([], [])}
        onApprove={onApprove}
        onCancel={onCancel}
      />,
    );
    const dialog = container.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.equal(dialog!.getAttribute('aria-modal'), 'true');
    assert.equal(dialog!.getAttribute('aria-labelledby'), 'preflight-title');
    const title = container.querySelector('#preflight-title');
    assert.ok(title);
    assert.equal(title!.textContent, 'Approve before sending');
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
