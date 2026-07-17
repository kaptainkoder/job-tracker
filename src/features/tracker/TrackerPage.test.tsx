import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Application } from '../../shared/types';
import TrackerPage from './TrackerPage';

interface QueryRecord {
  table: string;
  operation: string;
  selected: string | null;
  filters: Array<{ column: string; value: unknown }>;
  order: { column: string; options: unknown } | null;
  payload: unknown;
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
  throw new Error('TrackerPage DOM tests must not make network requests');
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

const BASE_APP: Application = {
  id: 'app-applied',
  user_id: 'user-1',
  company: 'Applied Systems',
  role: 'Platform Engineer',
  stage: 'applied',
  priority: 'high',
  source: null,
  job_url: null,
  jd_text: null,
  job_location: 'Remote',
  work_mode: 'remote',
  employment_type: 'full-time',
  salary_min: 100000,
  salary_max: 120000,
  salary_currency: 'USD',
  salary_period: 'year',
  contact_name: null,
  contact_email: null,
  date_applied: '2000-01-01',
  deadline: null,
  next_action_date: null,
  notes: null,
  created_at: '2000-01-01T00:00:00.000Z',
  last_activity_at: '2000-01-01T00:00:00.000Z',
};

const POPULATED_APPS: Application[] = [
  BASE_APP,
  {
    ...BASE_APP,
    id: 'app-interview',
    company: 'Interview Works',
    role: 'Data Engineer',
    stage: 'interviewing',
    priority: 'medium',
    last_activity_at: '2999-01-01T00:00:00.000Z',
  },
  {
    ...BASE_APP,
    id: 'app-offer',
    company: 'Offer Labs',
    role: 'Staff Engineer',
    stage: 'offer',
    priority: 'low',
  },
  {
    ...BASE_APP,
    id: 'app-lead',
    company: 'Lead Studio',
    role: 'Frontend Engineer',
    stage: 'lead',
    priority: 'medium',
    date_applied: null,
    last_activity_at: '2999-01-01T00:00:00.000Z',
  },
];

function applicationQueries(operation = 'select') {
  return controls().queries.filter(
    (query) => query.table === 'applications' && query.operation === operation,
  );
}

function clickButton(text: string, exact = true) {
  const button = [...document.querySelectorAll('button')].find((candidate) =>
    exact ? candidate.textContent?.trim() === text : candidate.textContent?.includes(text),
  );
  assert.ok(button, `expected a button ${exact ? 'equal to' : 'containing'} "${text}"`);
  button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

async function waitFor(condition: () => boolean, message: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (condition()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  assert.ok(condition(), message);
}

async function waitForText(text: RegExp) {
  await waitFor(() => text.test(document.body.textContent ?? ''), `expected body text to match ${text}`);
}

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TrackerPage />);
  });
  return {
    async cleanup() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function metricValue(label: string) {
  const labelElement = [...document.querySelectorAll('p')].find(
    (candidate) => candidate.textContent === label,
  );
  assert.ok(labelElement, `expected metric label "${label}"`);
  const valueElement = labelElement.parentElement?.nextElementSibling;
  assert.ok(valueElement, `expected a value for metric "${label}"`);
  return valueElement.textContent;
}

function assertStageContains(stage: string, company: string) {
  const section = [...document.querySelectorAll('section')].find((candidate) =>
    candidate.querySelector('span')?.textContent?.includes(stage),
  );
  assert.ok(section, `expected the ${stage} stage column`);
  assert.match(section.textContent ?? '', new RegExp(company));
}

async function main() {
  await test('initial request is user-scoped and loading remains until it resolves', async () => {
    controls().reset();
    const request = controls().defer('applications');
    const mounted = await mount();
    try {
      const status = document.querySelector('[role="status"]');
      assert.ok(status, 'loading status should be present while the applications request is pending');
      assert.match(status.textContent ?? '', /Loading applications/);

      assert.equal(applicationQueries().length, 1);
      assert.deepEqual(applicationQueries()[0], {
        table: 'applications',
        operation: 'select',
        selected: '*',
        filters: [{ column: 'user_id', value: 'user-1' }],
        order: { column: 'last_activity_at', options: { ascending: false } },
        payload: null,
      });

      await act(async () => {
        request.resolve({ data: [], error: null });
      });
      await waitForText(/No applications yet/);
      assert.equal(document.querySelector('[role="status"]'), null);
    } finally {
      await mounted.cleanup();
    }
  });

  await test('empty success shows the zero state and both add entry points offline', async () => {
    controls().reset();
    controls().enqueue('applications', { data: [], error: null });
    const mounted = await mount();
    try {
      await waitForText(/No applications yet/);
      assert.equal(applicationQueries().length, 1);
      assert.equal(
        [...document.querySelectorAll('button')].filter(
          (button) => button.textContent?.trim() === 'Add application',
        ).length,
        1,
      );
      assert.equal(
        [...document.querySelectorAll('button')].filter(
          (button) => button.textContent?.trim() === 'Add your first application',
        ).length,
        1,
      );
    } finally {
      await mounted.cleanup();
    }
  });

  await test('populated success renders metrics, stages, and both stale-count grammar tails', async () => {
    controls().reset();
    controls().enqueue('applications', { data: POPULATED_APPS, error: null });
    const singular = await mount();
    try {
      await waitForText(/1 needs follow-up\./);
      assert.equal(metricValue('Total applications'), '4');
      assert.equal(metricValue('In interview'), '1');
      assert.equal(metricValue('Offers'), '1');
      assert.equal(metricValue('Response rate'), '67%');
      assertStageContains('Lead', 'Lead Studio');
      assertStageContains('Applied', 'Applied Systems');
      assertStageContains('Interviewing', 'Interview Works');
      assertStageContains('Offer', 'Offer Labs');
    } finally {
      await singular.cleanup();
    }

    controls().reset();
    controls().enqueue('applications', {
      data: POPULATED_APPS.map((app) =>
        app.id === 'app-lead' ? { ...app, last_activity_at: '2000-01-02T00:00:00.000Z' } : app,
      ),
      error: null,
    });
    const plural = await mount();
    try {
      await waitForText(/2 need follow-up\./);
      assert.doesNotMatch(document.body.textContent ?? '', /2 needs follow-up\./);
    } finally {
      await plural.cleanup();
    }
  });

  await test('failed load alerts, and Try again issues exactly one successful retry', async () => {
    controls().reset();
    controls().enqueue('applications', {
      data: null,
      error: { message: 'Synthetic applications failure' },
    });
    controls().enqueue('applications', { data: [BASE_APP], error: null });
    const mounted = await mount();
    try {
      await waitForText(/Synthetic applications failure/);
      const alert = document.querySelector('[role="alert"]');
      assert.ok(alert);
      assert.match(alert.textContent ?? '', /We couldn’t load your applications/);
      assert.equal(applicationQueries().length, 1);

      await act(async () => clickButton('Try again'));
      await waitForText(/Applied Systems/);
      assert.equal(applicationQueries().length, 2, 'Try again should add exactly one request');
      assert.equal(document.querySelector('[role="alert"]'), null);
    } finally {
      await mounted.cleanup();
    }
  });

  await test('detail closes back to the board and add opens in place', async () => {
    controls().reset();
    controls().enqueue('applications', { data: [BASE_APP], error: null });
    let beforeUnload = 0;
    const onBeforeUnload = () => {
      beforeUnload += 1;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    const mounted = await mount();
    try {
      await waitForText(/Applied Systems/);
      await act(async () => clickButton('Applied Systems', false));
      await waitFor(() => Boolean(document.querySelector('[role="dialog"][aria-label="Application"]')), 'detail modal should open');
      assert.match(document.querySelector('[role="dialog"]')?.textContent ?? '', /Platform Engineer/);

      const close = document.querySelector('[role="dialog"] button[aria-label="Close"]');
      assert.ok(close, 'detail modal should expose its real close button');
      await act(async () => close.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
      assert.equal(document.querySelector('[role="dialog"]'), null);
      assert.match(document.body.textContent ?? '', /Applied Systems/);

      await act(async () => clickButton('Add application'));
      assert.ok(document.querySelector('[role="dialog"][aria-label="Add application"]'));
      assert.ok(document.getElementById('company'));
      assert.equal(applicationQueries().length, 1, 'opening either modal should not reload the board');
      assert.equal(beforeUnload, 0, 'the modal flows should not initiate a page navigation');
    } finally {
      window.removeEventListener('beforeunload', onBeforeUnload);
      await mounted.cleanup();
    }
  });

  await test('successful real-form add closes and performs exactly one in-place refetch', async () => {
    controls().reset();
    controls().enqueue('applications', { data: [], error: null });
    controls().enqueue('applications', { data: [BASE_APP], error: null });
    const mounted = await mount();
    try {
      await waitForText(/No applications yet/);
      assert.equal(applicationQueries().length, 1);
      await act(async () => clickButton('Add your first application'));

      const company = document.getElementById('company') as HTMLInputElement | null;
      const role = document.getElementById('role') as HTMLInputElement | null;
      assert.ok(company);
      assert.ok(role);
      await act(async () => setInputValue(company, 'Synthetic Signal Co'));
      await act(async () => setInputValue(role, 'Test Engineer'));

      const form = document.querySelector('[role="dialog"] form');
      assert.ok(form, 'the real add form should be rendered');
      await act(async () => {
        form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      });
      await waitForText(/Applied Systems/);

      assert.equal(document.querySelector('[role="dialog"]'), null, 'successful save should close the modal');
      assert.equal(applicationQueries('insert').length, 1, 'the form should insert once');
      assert.equal(applicationQueries().length, 2, 'save should add exactly one board refetch');
      const insertQuery = applicationQueries('insert')[0];
      assert.deepEqual(insertQuery.filters, []);
      const { last_activity_at: lastActivityAt, ...insertPayload } = insertQuery.payload as Record<
        string,
        unknown
      >;
      assert.match(String(lastActivityAt), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      assert.deepEqual(insertPayload, {
        company: 'Synthetic Signal Co',
        role: 'Test Engineer',
        stage: 'lead',
        priority: 'medium',
        job_url: null,
        jd_text: null,
        job_location: null,
        salary_min: null,
        salary_max: null,
        salary_currency: null,
        notes: null,
        user_id: 'user-1',
      });
    } finally {
      await mounted.cleanup();
    }
  });
}

void main().then(() => {
  (globalThis as unknown as { __DOM_TESTS_DONE__?: boolean }).__DOM_TESTS_DONE__ = true;
});
