import type { VercelRequest, VercelResponse } from '@vercel/node';

// Liveness probe. A0 has no schema yet, so this intentionally does NOT query a table
// (that would 503 before the migration exists). It reports the runtime is up and
// whether the server-side Supabase env is wired. Chunk A1 deepens this into a real
// schema-reachability check once the tables exist.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  const supabaseConfigured = Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  res.status(200).json({
    ok: true,
    supabaseConfigured,
    timestamp: new Date().toISOString(),
  });
}
