// Test double for the browser Supabase client. Records every .insert() payload on a global
// so a UI test can assert how many inserts actually fired, and resolves all queries to empty
// success so the component renders without a network or env. Not type-checked (outside the
// tsconfig include) — kept intentionally loose to mirror the chained query builder.
const inserts = [];
globalThis.__SUPABASE_INSERTS__ = inserts;

function makeBuilder(resolveValue) {
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
      return builder;
    },
    // Thenable: `await supabase.from(...).select().eq()` (and .insert()) resolve here.
    then(onFulfilled, onRejected) {
      return Promise.resolve(resolveValue).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

export const supabase = {
  from() {
    return makeBuilder({ data: [], error: null });
  },
};
