import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Artifact } from '../../shared/types';
import type { StructuredResume } from '../../shared/domain/resume';
import {
  artifactInsertPayload,
  artifactUpdatePayload,
  serializeTailoredResumeArtifact,
  verifyUpdatedArtifact,
} from './tailorArtifactContent';

const resume: StructuredResume = {
  contact: { fullName: 'Karan', title: 'Data Scientist', links: [] },
  summary: 'Builds truthful models.',
  awards: [],
  experience: [{
    org: 'Example Co', title: 'Data Scientist', start: '2023', end: 'Present',
    bullets: ['Built a model that drove $15M in annual incremental revenue.'],
  }],
  projects: [],
  education: [],
  skills: [{ label: 'Technology', items: ['Python', 'SQL'] }],
};

test('tailored résumé serialization is stable and round-trips the canonical preview source', () => {
  const reordered = {
    skills: resume.skills,
    education: resume.education,
    projects: resume.projects,
    experience: resume.experience,
    awards: resume.awards,
    summary: resume.summary,
    contact: resume.contact,
  } as StructuredResume;

  const content = serializeTailoredResumeArtifact(resume);
  assert.equal(serializeTailoredResumeArtifact(reordered), content);
  assert.deepEqual(JSON.parse(content), resume);
});

test('insert and update payloads carry the exact same canonical résumé content', () => {
  const content = serializeTailoredResumeArtifact(resume);
  const insert = artifactInsertPayload({
    userId: 'user-1',
    applicationId: 'app-1',
    action: 'tailor',
    content,
    model: 'anthropic/claude-sonnet-4-6',
  });
  const update = artifactUpdatePayload({ artifactId: 'artifact-1', content });

  assert.equal(insert.content, content);
  assert.equal(update.content, content);
  assert.deepEqual(update, { content });
});

test('updated rows are returned only when id and persisted content match the requested revision', () => {
  const input = {
    artifactId: 'artifact-1',
    content: serializeTailoredResumeArtifact(resume),
  };
  const row = {
    id: input.artifactId,
    user_id: 'user-1',
    application_id: 'app-1',
    kind: 'tailored-resume',
    content: input.content,
    model: 'anthropic/claude-sonnet-4-6',
    created_at: '2026-07-02T00:00:00Z',
  } satisfies Artifact;

  assert.equal(verifyUpdatedArtifact(input, row), row);
  assert.throws(
    () => verifyUpdatedArtifact(input, { ...row, id: 'artifact-2' }),
    /wrong row/i,
  );
  assert.throws(
    () => verifyUpdatedArtifact(input, { ...row, content: '{}' }),
    /persisted content does not match/i,
  );
  assert.throws(() => verifyUpdatedArtifact(input, null), /no row/i);
});
