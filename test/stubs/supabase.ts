// Test double for the browser Supabase client. Records every .insert() payload on a global
// so a UI test can assert how many inserts actually fired, and resolves all queries to empty
// success so the component renders without a network or env. Not type-checked (outside the
// tsconfig include) — kept intentionally loose to mirror the chained query builder.
const inserts = [];
globalThis.__SUPABASE_INSERTS__ = inserts;
const updates = [];
globalThis.__SUPABASE_UPDATES__ = updates;
const upserts = [];
globalThis.__SUPABASE_UPSERTS__ = upserts;
const queries = [];
const queuedResponses = [];
globalThis.__SUPABASE_TEST__ = {
  queries,
  reset() {
    inserts.length = 0;
    updates.length = 0;
    upserts.length = 0;
    queries.length = 0;
    queuedResponses.length = 0;
  },
  enqueue(table, result, operation = 'select') {
    queuedResponses.push({ table, operation, result });
  },
  defer(table, operation = 'select') {
    let resolve;
    const result = new Promise((done) => {
      resolve = done;
    });
    queuedResponses.push({ table, operation, result });
    return { resolve };
  },
};
globalThis.__SUPABASE_ROWS__ = {
  profile: {
    id: 'user-1',
    full_name: 'Karan',
    email: 'owner@example.com',
    phone: null,
    current_title: 'Data engineer',
    current_company: 'Example Co',
    linkedin_url: null,
    github_url: null,
    resume_path: null,
    skills: ['SQL'],
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  },
  user_settings: {
    user_id: 'user-1',
    model: 'anthropic/claude-sonnet-4-6',
    no_log: true,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  },
  artifacts: [],
  outcomes: [],
  // A confirmed structured résumé so the tailor action runs the structured path (Wave B · B6.4).
  // Tests that want the "no résumé saved" gate set this to null before mounting.
  resume_structured: {
    user_id: 'user-1',
    content: {
      contact: { fullName: 'Karan', title: 'Data engineer', links: [] },
      summary: 'Builds reliable data pipelines.',
      awards: [],
      experience: [
        {
          org: 'Example Co',
          location: 'Remote',
          title: 'Data engineer',
          start: '2023',
          end: 'Present',
          bullets: ['Built SQL pipelines that cut report latency.'],
        },
      ],
      projects: [],
      education: [],
      skills: [{ items: ['SQL'] }],
    },
    source_filename: 'base-resume.pdf',
    parsed_at: '2026-06-20T00:00:00Z',
    confirmed_at: '2026-06-20T00:00:00Z',
    created_at: '2026-06-20T00:00:00Z',
    updated_at: '2026-06-20T00:00:00Z',
  },
};

function makeBuilder(table) {
  const rows = globalThis.__SUPABASE_ROWS__;
  let inserted = null;
  let upserted = null;
  let operation = 'select';
  let selected = null;
  let payload = null;
  let queryOptions = null;
  const filters = [];
  let ordering = null;
  let execution = null;

  function execute(defaultResult) {
    if (!execution) {
      const record = { table, operation, selected, filters: [...filters], order: ordering, payload };
      // Only upsert carries options ({onConflict}); omit the key elsewhere so existing deepEqual
      // assertions on the recorded query shape (e.g. TrackerPage's select/insert checks) still pass.
      if (operation === 'upsert') record.options = queryOptions;
      queries.push(record);
      const queuedIndex = queuedResponses.findIndex(
        (candidate) => candidate.table === table && candidate.operation === operation,
      );
      if (queuedIndex >= 0) {
        const [{ result }] = queuedResponses.splice(queuedIndex, 1);
        execution = Promise.resolve(result);
      } else {
        execution = Promise.resolve(defaultResult());
      }
    }
    return execution;
  }

  const builder = {
    select(columns = '*') {
      selected = columns;
      return builder;
    },
    eq(column, value) {
      filters.push({ column, value });
      return builder;
    },
    update(nextPayload) {
      operation = 'update';
      updates.push(nextPayload);
      payload = nextPayload;
      return builder;
    },
    delete() {
      operation = 'delete';
      return builder;
    },
    insert(nextPayload) {
      operation = 'insert';
      inserts.push(nextPayload);
      inserted = nextPayload;
      payload = nextPayload;
      return builder;
    },
    upsert(nextPayload, options = null) {
      operation = 'upsert';
      upserts.push(nextPayload);
      upserted = nextPayload;
      payload = nextPayload;
      queryOptions = options;
      return builder;
    },
    order(column, options) {
      ordering = { column, options };
      return builder;
    },
    maybeSingle() {
      return execute(() => ({ data: rows[table] ?? null, error: null }));
    },
    single() {
      return execute(() => {
        if (upserted) return { data: upserted, error: null };
        const data = inserted
          ? { id: `artifact-${inserts.length}`, created_at: '2026-06-28T00:00:00Z', ...inserted }
          : rows[table] ?? null;
        if (inserted && table === 'artifacts') rows.artifacts.push(data);
        return { data, error: null };
      });
    },
    // Thenable: `await supabase.from(...).select().eq()` (and .insert()) resolve here.
    then(onFulfilled, onRejected) {
      return execute(() => ({
        data: Array.isArray(rows[table]) ? rows[table] : [],
        error: null,
      })).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

function defaultDownloadBlob() {
  const bytes = new TextEncoder().encode('stub résumé bytes');
  return {
    async arrayBuffer() {
      return bytes.buffer;
    },
  };
}

function makeStorageBucket(bucket) {
  return {
    download(path) {
      const operation = 'download';
      queries.push({ table: bucket, operation, selected: null, filters: [{ column: 'path', value: path }], order: null, payload: null });
      const queuedIndex = queuedResponses.findIndex(
        (candidate) => candidate.table === bucket && candidate.operation === operation,
      );
      if (queuedIndex >= 0) {
        const [{ result }] = queuedResponses.splice(queuedIndex, 1);
        return Promise.resolve(result);
      }
      return Promise.resolve({ data: defaultDownloadBlob(), error: null });
    },
  };
}

export const supabase = {
  from(table) {
    return makeBuilder(table);
  },
  storage: {
    from(bucket) {
      return makeStorageBucket(bucket);
    },
  },
};
