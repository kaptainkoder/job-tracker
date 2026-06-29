// Persistence for the structured résumé source of truth (Wave B · B6.3). CRUD stays client-side
// over RLS (like profile + artifacts); the server only ever audits + streams the parse. The owner
// confirms the parsed StructuredResume on the Résumé screen, then saves it here.
import { supabase } from '../../shared/lib/supabase';
import type { ResumeStructuredRecord } from '../../shared/types';
import type { StructuredResume } from '../../shared/domain/resume';

export interface LoadResumeResult {
  record: ResumeStructuredRecord | null;
  error: string | null;
}

export async function loadStructuredResume(userId: string): Promise<LoadResumeResult> {
  const { data, error } = await supabase
    .from('resume_structured')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { record: null, error: error.message };
  return { record: (data as ResumeStructuredRecord | null) ?? null, error: null };
}

export interface SaveResumeResult {
  record: ResumeStructuredRecord | null;
  error: string | null;
}

// Upsert the confirmed StructuredResume. confirmed_at marks "this is now my source of truth"; we set
// parsed_at alongside it since the parse that produced this content happened moments ago in-session.
export async function saveStructuredResume(
  userId: string,
  content: StructuredResume,
  sourceFilename: string | null,
): Promise<SaveResumeResult> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('resume_structured')
    .upsert(
      {
        user_id: userId,
        content,
        source_filename: sourceFilename,
        parsed_at: now,
        confirmed_at: now,
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single();
  if (error) return { record: null, error: error.message };
  return { record: data as ResumeStructuredRecord, error: null };
}

// Fetch the stored base-résumé PDF bytes so the Résumé screen can parse it without a re-upload.
export async function downloadBaseResume(
  path: string,
): Promise<{ data: ArrayBuffer | null; error: string | null }> {
  const { data, error } = await supabase.storage.from('resumes').download(path);
  if (error || !data) return { data: null, error: error?.message ?? 'Could not download the base résumé.' };
  return { data: await data.arrayBuffer(), error: null };
}
