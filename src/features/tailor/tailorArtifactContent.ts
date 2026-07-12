import type { Artifact, ArtifactKind } from '../../shared/types';
import type { TailorAction } from '../../shared/domain/tailor';
import type { StructuredResume } from '../../shared/domain/resume';

export const ARTIFACT_KIND_BY_ACTION: Record<TailorAction, ArtifactKind> = {
  tailor: 'tailored-resume',
  cover: 'cover-letter',
  prep: 'prep',
};

export interface ArtifactInsertInput {
  userId: string;
  applicationId: string;
  action: TailorAction;
  content: string;
  model: string;
}

export interface ArtifactUpdateInput {
  artifactId: string;
  content: string;
}

export function serializeTailoredResumeArtifact(resume: StructuredResume): string {
  const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, sortKeys(item)]),
      );
    }
    return value;
  };
  return JSON.stringify(sortKeys(resume));
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

export function artifactUpdatePayload(input: ArtifactUpdateInput) {
  return { content: input.content };
}

export function verifyUpdatedArtifact(input: ArtifactUpdateInput, value: unknown): Artifact {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Artifact update returned no row.');
  }
  const artifact = value as Artifact;
  if (artifact.id !== input.artifactId) throw new Error('Artifact update returned the wrong row.');
  if (artifact.content !== input.content) {
    throw new Error('Artifact update verification failed: persisted content does not match.');
  }
  return artifact;
}
