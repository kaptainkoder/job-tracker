import type { Artifact, ArtifactKind } from '../../shared/types';
import type { TailorAction } from '../../shared/domain/tailor';
import { supabase } from '../../shared/lib/supabase';

export const ARTIFACT_KIND_BY_ACTION: Record<TailorAction, ArtifactKind> = {
  tailor: 'tailored-resume',
  cover: 'cover-letter',
  prep: 'prep',
};

export const ARTIFACT_KIND_LABEL: Record<ArtifactKind, string> = {
  'tailored-resume': 'Tailored résumé',
  'cover-letter': 'Cover letter',
  prep: 'Interview prep',
};

export interface ArtifactInsertInput {
  userId: string;
  applicationId: string;
  action: TailorAction;
  content: string;
  model: string;
}

export function artifactInsertPayload(input: ArtifactInsertInput) {
  return {
    user_id: input.userId,
    application_id: input.applicationId,
    kind: ARTIFACT_KIND_BY_ACTION[input.action],
    content: input.content,
    model: input.model,
  };
}

export async function loadTailorArtifacts(applicationId: string): Promise<Artifact[]> {
  const { data, error } = await supabase
    .from('artifacts')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Artifact[];
}

export async function insertTailorArtifact(input: ArtifactInsertInput): Promise<Artifact> {
  const { data, error } = await supabase
    .from('artifacts')
    .insert(artifactInsertPayload(input))
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Artifact insert returned no row.');
  return data as Artifact;
}

// G3-persistence: the tailored-résumé artifact is saved at generation, but the pre-download review
// lets the user restore/edit the tailored StructuredResume. This re-persists those edits onto the
// SAME row so the stored artifact always equals what the preview renders and the PDF downloads
// (preview == download == saved). Owner scoping is enforced by RLS; the id already came from an
// owner-scoped insert this session.
export interface ArtifactUpdateInput {
  artifactId: string;
  content: string;
}

export async function updateTailorArtifact(input: ArtifactUpdateInput): Promise<void> {
  const { error } = await supabase
    .from('artifacts')
    .update({ content: input.content })
    .eq('id', input.artifactId);
  if (error) throw new Error(error.message);
}
