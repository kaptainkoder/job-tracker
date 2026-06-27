import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Liveness + readiness probe. `ok` reflects only that the runtime is up, so it stays
// true even before Supabase env is wired or the migration is applied (a hard dependency
// check here would make the app look "down" during setup). When the server-side env IS
// present, it does a cheap HEAD count against `profile` to confirm the schema is
// reachable — `schemaReachable` is null (unknown) until then.
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseConfigured = Boolean(url && key);

  let schemaReachable: boolean | null = null;
  let detail: string | undefined;

  if (supabaseConfigured) {
    try {
      // Service role bypasses RLS; HEAD count touches no rows, just proves the table exists.
      const supabase = createClient(url!, key!, { auth: { persistSession: false } });
      const { error } = await supabase
        .from('profile')
        .select('id', { head: true, count: 'exact' });
      schemaReachable = !error;
      if (error) detail = error.message;
    } catch (e) {
      schemaReachable = false;
      detail = e instanceof Error ? e.message : String(e);
    }
  }

  res.status(200).json({
    ok: true,
    supabaseConfigured,
    schemaReachable,
    ...(detail ? { detail } : {}),
    timestamp: new Date().toISOString(),
  });
}
