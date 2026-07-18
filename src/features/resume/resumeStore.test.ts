// Direct coverage for the résumé persistence contracts (load/save/download). Runs through
// scripts/run-dom-test.mjs so its esbuild plugin substitutes the Supabase test double for the
// real client (see test/stubs/supabase.ts) — the plain esbuild|node test scripts would pull the
// real module, which throws on missing import.meta.env.
import assert from 'node:assert/strict';
import type { StructuredResume } from '../../shared/domain/resume';
import { downloadBaseResume, loadStructuredResume, saveStructuredResume } from './resumeStore';

const RESUME: StructuredResume = {
  contact: { fullName: 'Karan', title: 'Data engineer', links: [] },
  summary: 'Builds reliable data pipelines.',
  awards: [],
  experience: [],
  projects: [],
  education: [],
  skills: [],
};

interface QueryRecord {
  table: string;
  operation: string;
  selected: string | null;
  filters: Array<{ column: string; value: unknown }>;
  order: { column: string; options: unknown } | null;
  payload: unknown;
  options: unknown;
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

function lastQuery(table: string, operation: string) {
  const matches = controls().queries.filter((query) => query.table === table && query.operation === operation);
  return matches[matches.length - 1];
}

async function main() {
  await test('loadStructuredResume: returns the default resume_structured record on success', async () => {
    controls().reset();
    const result = await loadStructuredResume('user-1');
    assert.equal(result.error, null);
    assert.ok(result.record);
    assert.equal(result.record?.user_id, 'user-1');
    assert.equal(result.record?.source_filename, 'base-resume.pdf');
  });

  await test('loadStructuredResume: null row returns a null record with no error', async () => {
    controls().reset();
    controls().enqueue('resume_structured', { data: null, error: null }, 'select');
    const result = await loadStructuredResume('user-1');
    assert.deepEqual(result, { record: null, error: null });
  });

  await test('loadStructuredResume: query error maps error.message with a null record', async () => {
    controls().reset();
    controls().enqueue('resume_structured', { data: null, error: { message: 'boom' } }, 'select');
    const result = await loadStructuredResume('user-1');
    assert.deepEqual(result, { record: null, error: 'boom' });
  });

  await test('saveStructuredResume: success returns the upserted record', async () => {
    controls().reset();
    const content = structuredClone(RESUME);
    const result = await saveStructuredResume('user-1', content, 'base-resume.pdf');
    assert.equal(result.error, null);
    assert.equal(result.record?.user_id, 'user-1');
    assert.equal(result.record?.source_filename, 'base-resume.pdf');
    assert.deepEqual(result.record?.content, content);
  });

  await test('saveStructuredResume: recorded upsert payload and options are correct', async () => {
    controls().reset();
    const content = structuredClone(RESUME);
    await saveStructuredResume('user-1', content, 'base-resume.pdf');
    const upsertQuery = lastQuery('resume_structured', 'upsert');
    assert.ok(upsertQuery, 'expected an upsert query to be recorded');
    const payload = upsertQuery.payload as {
      user_id: string;
      content: unknown;
      source_filename: string | null;
      parsed_at: string;
      confirmed_at: string;
    };
    assert.equal(payload.user_id, 'user-1');
    assert.deepEqual(payload.content, content);
    assert.equal(payload.source_filename, 'base-resume.pdf');
    assert.equal(payload.parsed_at, payload.confirmed_at);
    assert.ok(!Number.isNaN(new Date(payload.parsed_at).getTime()), 'parsed_at should be a valid timestamp');
    assert.equal(new Date(payload.parsed_at).toISOString(), payload.parsed_at);
    assert.deepEqual(upsertQuery.options, { onConflict: 'user_id' });
  });

  await test('saveStructuredResume: source_filename passes through as null', async () => {
    controls().reset();
    const content = structuredClone(RESUME);
    const result = await saveStructuredResume('user-1', content, null);
    assert.equal(result.record?.source_filename, null);
    const upsertQuery = lastQuery('resume_structured', 'upsert');
    assert.equal((upsertQuery.payload as { source_filename: string | null }).source_filename, null);
  });

  await test('saveStructuredResume: error path maps error.message with a null record', async () => {
    controls().reset();
    controls().enqueue('resume_structured', { data: null, error: { message: 'save failed' } }, 'upsert');
    const content = structuredClone(RESUME);
    const result = await saveStructuredResume('user-1', content, 'base-resume.pdf');
    assert.deepEqual(result, { record: null, error: 'save failed' });
  });

  await test('downloadBaseResume: success returns an ArrayBuffer', async () => {
    controls().reset();
    const result = await downloadBaseResume('base-resume.pdf');
    assert.equal(result.error, null);
    assert.ok(result.data instanceof ArrayBuffer);
  });

  await test('downloadBaseResume: supabase error returns error.message with null data', async () => {
    controls().reset();
    controls().enqueue('resumes', { data: null, error: { message: 'nope' } }, 'download');
    const result = await downloadBaseResume('base-resume.pdf');
    assert.deepEqual(result, { data: null, error: 'nope' });
  });

  await test('downloadBaseResume: missing data with no error falls back to the exact message', async () => {
    controls().reset();
    controls().enqueue('resumes', { data: null, error: null }, 'download');
    const result = await downloadBaseResume('base-resume.pdf');
    assert.deepEqual(result, { data: null, error: 'Could not download the base résumé.' });
  });
}

void main().then(() => {
  (globalThis as unknown as { __DOM_TESTS_DONE__?: boolean }).__DOM_TESTS_DONE__ = true;
});
