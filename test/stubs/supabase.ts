// Test double for the browser Supabase client. Records every .insert() payload on a global
// so a UI test can assert how many inserts actually fired, and resolves all queries to empty
// success so the component renders without a network or env. Not type-checked (outside the
// tsconfig include) — kept intentionally loose to mirror the chained query builder.
const inserts = [];
globalThis.__SUPABASE_INSERTS__ = inserts;
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
};

function makeBuilder(table) {
  const rows = globalThis.__SUPABASE_ROWS__;
  let inserted = null;
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    update() {
      return builder;
    },
    delete() {
      return builder;
    },
    insert(payload) {
      inserts.push(payload);
      inserted = payload;
      return builder;
    },
    order() {
      return builder;
    },
    maybeSingle() {
      return Promise.resolve({ data: rows[table] ?? null, error: null });
    },
    single() {
      const data = inserted
        ? { id: `artifact-${inserts.length}`, created_at: '2026-06-28T00:00:00Z', ...inserted }
        : rows[table] ?? null;
      if (inserted && table === 'artifacts') rows.artifacts.push(data);
      return Promise.resolve({ data, error: null });
    },
    // Thenable: `await supabase.from(...).select().eq()` (and .insert()) resolve here.
    then(onFulfilled, onRejected) {
      const data = Array.isArray(rows[table]) ? rows[table] : [];
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

export const supabase = {
  from(table) {
    return makeBuilder(table);
  },
};
