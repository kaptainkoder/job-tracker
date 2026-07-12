import type { Artifact, ArtifactKind } from '../../shared/types';
import { supabase } from '../../shared/lib/supabase';
import {
  artifactInsertPayload,
  artifactUpdatePayload,
  verifyUpdatedArtifact,
  type ArtifactInsertInput,
  type ArtifactUpdateInput,
} from './tailorArtifactContent';

export {
  ARTIFACT_KIND_BY_ACTION,
  artifactInsertPayload,
  artifactUpdatePayload,
  serializeTailoredResumeArtifact,
  verifyUpdatedArtifact,
  type ArtifactInsertInput,
  type ArtifactUpdateInput,
} from './tailorArtifactContent';

export const ARTIFACT_KIND_LABEL: Record<ArtifactKind, string> = {
  'tailored-resume': 'Tailored résumé',
  'cover-letter': 'Cover letter',
  prep: 'Interview prep',
};

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
export async function updateTailorArtifact(input: ArtifactUpdateInput): Promise<Artifact> {
  const { data, error } = await supabase
    .from('artifacts')
    .update(artifactUpdatePayload(input))
    .eq('id', input.artifactId)
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Artifact update returned no row.');
  return verifyUpdatedArtifact(input, data);
}
