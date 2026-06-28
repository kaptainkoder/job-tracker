import { supabase } from './supabase';
import { buildPrivacyLogRow, type AuditInput } from '../domain/privacy';

// Audit write (Wave B · B1). Inserts exactly ONE owner-scoped privacy_log row after an external
// call completes. Row shaping (incl. the labelled sent/withheld manifests) is the tested pure
// function buildPrivacyLogRow — this file is just the Supabase insert. The raw payload is never
// passed in or stored; only its SHA-256 hash (computed by the caller via payloadHash) is recorded.
//
// RLS constrains the insert to the authenticated owner; the live owner-only / anon-denied /
// cross-UID 42501 proof is a Codex check (no paired auth in this session).

export interface WritePrivacyLogResult {
  ok: boolean;
  error: string | null;
}

export async function writePrivacyLog(input: AuditInput): Promise<WritePrivacyLogResult> {
  const { error } = await supabase.from('privacy_log').insert(buildPrivacyLogRow(input));
  return { ok: !error, error: error?.message ?? null };
}
