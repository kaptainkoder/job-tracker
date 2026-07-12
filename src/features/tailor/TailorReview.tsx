import { useState } from 'react';
import { Pencil, RotateCcw } from 'lucide-react';
import {
  diffTailored,
  resolveResumeSourceRef,
  type ResumeSourceRef,
  type TailoredOmission,
} from '../../shared/domain/tailor';
import type { StructuredResume } from '../../shared/domain/resume';
import Badge from '../../shared/ui/Badge';
import Button from '../../shared/ui/Button';

interface TailorReviewBaseProps {
  /** The confirmed source résumé — the restore target and the truth baseline. */
  source: StructuredResume;
  /** The applied tailored résumé that drives the preview AND the download (preview == download). */
  tailored: StructuredResume;
  /** JD skills the user could not evidence (foldResolutions().futureSuggestions labels) — shown as
   *  deliberately NOT claimed, never as silent omissions. */
  unsupportedJd: string[];
  /** Edits and restores produce a new tailored résumé; the parent re-renders preview + download. */
  onChange: (next: StructuredResume) => void;
  /** Restore-all also clears the plan's explicit-omission metadata in the parent. */
  onRestoreAllOmissions?: () => void;
}

// Backwards-compatible while TailorFlow adopts the editorial-plan result: when explicit omissions
// are supplied, their strict restore callback is required. Keeping that mutation in the parent
// ensures a restore cannot bypass width/layout validation or canonical artifact persistence.
type TailorReviewOmissionProps =
  | {
      omissions: readonly TailoredOmission[];
      onRestoreOmission: (ref: ResumeSourceRef) => void;
    }
  | {
      omissions?: undefined;
      onRestoreOmission?: undefined;
    };

export type TailorReviewProps = TailorReviewBaseProps & TailorReviewOmissionProps;

// Match a role by its LOCKED structural identity (org+title+dates), because applyTailoredResume can
// reorder roles — index matching would target the wrong one.
function sameRole(a: { org: string; title: string; start: string; end: string }, org: string, title: string): boolean {
  return a.org.trim() === org.trim() && a.title.trim() === title.trim();
}

function omissionContext(source: StructuredResume, ref: ResumeSourceRef): string {
  if (ref === 'summary') return 'Professional summary';

  let match = /^award:(\d+)$/.exec(ref);
  if (match) return `Award · ${source.awards[Number(match[1])]?.title ?? `#${Number(match[1]) + 1}`}`;

  match = /^experience:(\d+):(scope|bullet:(\d+))$/.exec(ref);
  if (match) {
    const role = source.experience[Number(match[1])];
    const roleLabel = role ? `${role.title} · ${role.org}` : `Experience #${Number(match[1]) + 1}`;
    return `${roleLabel} · ${match[2] === 'scope' ? 'Scope' : `Bullet ${Number(match[3]) + 1}`}`;
  }

  match = /^project:(\d+)(?::(scope|bullet:(\d+)))?$/.exec(ref);
  if (match) {
    const project = source.projects[Number(match[1])];
    const projectLabel = `Project · ${project?.name ?? `#${Number(match[1]) + 1}`}`;
    if (!match[2]) return projectLabel;
    return `${projectLabel} · ${match[2] === 'scope' ? 'Scope' : `Bullet ${Number(match[3]) + 1}`}`;
  }

  match = /^education:(\d+)$/.exec(ref);
  if (match) return `Education · ${source.education[Number(match[1])]?.school ?? `#${Number(match[1]) + 1}`}`;

  match = /^skill:(\d+):(\d+)$/.exec(ref);
  if (match) {
    const groupIndex = Number(match[1]);
    const itemIndex = Number(match[2]);
    const group = source.skills[groupIndex];
    return `${group?.label?.trim() || 'Skills'} · Item ${itemIndex + 1}`;
  }

  match = /^addition:(\d+)$/.exec(ref);
  if (match) return `Confirmed truthful addition · #${Number(match[1]) + 1}`;
  return ref;
}

// G3 — pre-download review. Surfaces exactly what tailoring changed (summary rewrite, new Skills,
// per-role before→after bullets, and JD asks left unclaimed) with restore + inline edit. Every
// control writes back through `onChange`, so the same StructuredResume feeds the canvas preview and
// the PDF download — there is never a hidden difference between what is reviewed and what is saved.
export default function TailorReview(props: TailorReviewProps) {
  const { source, tailored, unsupportedJd, onChange } = props;
  const omissions = props.omissions ?? [];
  const [editing, setEditing] = useState(false);
  const diff = diffTailored(source, tailored, { unsupportedJd });
  const unchanged = diff.unchanged && omissions.length === 0;

  function restoreAll() {
    onChange(source);
    props.onRestoreAllOmissions?.();
  }
  function restoreSummary() {
    onChange({ ...tailored, summary: source.summary });
  }
  function restoreSkills() {
    onChange({ ...tailored, skills: source.skills });
  }
  function restoreRole(org: string, title: string) {
    const src = source.experience.find((e) => sameRole(e, org, title));
    if (!src) return;
    onChange({
      ...tailored,
      experience: tailored.experience.map((e) => (sameRole(e, org, title) ? { ...e, bullets: src.bullets } : e)),
    });
  }
  function editSummary(value: string) {
    onChange({ ...tailored, summary: value });
  }
  function editRoleBullets(org: string, title: string, text: string) {
    const bullets = text.split('\n').map((b) => b.trim()).filter(Boolean);
    onChange({
      ...tailored,
      experience: tailored.experience.map((e) => (sameRole(e, org, title) ? { ...e, bullets } : e)),
    });
  }

  return (
    <section
      className="mb-4 rounded-xl border border-line bg-surface-2/40 p-4 sm:p-5"
      aria-labelledby="tailor-review-heading"
      data-testid="tailor-review"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line-soft pb-3">
        <div>
          <Badge tone="eyebrow">Review before you download</Badge>
          <h4 id="tailor-review-heading" className="mt-2 font-semibold text-ink">What tailoring changed</h4>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-soft">
            Everything here is grounded in your résumé and confirmed evidence. Restore or edit anything—your
            changes apply to both the preview and the downloaded PDF.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
            <Pencil className="h-3.5 w-3.5" /> {editing ? 'Done editing' : 'Edit'}
          </Button>
          <Button variant="secondary" size="sm" disabled={unchanged} onClick={restoreAll}>
            <RotateCcw className="h-3.5 w-3.5" /> Restore original
          </Button>
        </div>
      </div>

      {unchanged ? (
        <p className="mt-3 text-sm text-ink-soft">
          Tailoring kept your résumé as-is for this role—nothing was added, reworded, or dropped.
        </p>
      ) : (
        <div className="mt-3 space-y-4 text-sm">
          {diff.summary && (
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Summary reworded</span>
                <Button variant="ghost" size="sm" onClick={restoreSummary}><RotateCcw className="h-3 w-3" /> Restore</Button>
              </div>
              {editing ? (
                <textarea
                  aria-label="Edit tailored summary"
                  value={tailored.summary}
                  onChange={(e) => editSummary(e.target.value)}
                  rows={3}
                  className="input mt-1.5 resize-y"
                />
              ) : (
                <p className="mt-1 leading-6 text-ink">{diff.summary.after}</p>
              )}
            </div>
          )}

          {diff.skillAdditions.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Skills added (you confirmed these)</span>
                <Button variant="ghost" size="sm" onClick={restoreSkills}><RotateCcw className="h-3 w-3" /> Restore</Button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {diff.skillAdditions.map((skill) => (
                  <span key={skill} className="rounded-full border border-stage-offer/40 bg-stage-offer/10 px-2.5 py-0.5 text-xs text-ink">{skill}</span>
                ))}
              </div>
            </div>
          )}

          {diff.roles.map((role) => (
            <div key={`${role.org}|${role.title}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{role.title} · {role.org}</span>
                <Button variant="ghost" size="sm" onClick={() => restoreRole(role.org, role.title)}><RotateCcw className="h-3 w-3" /> Restore role</Button>
              </div>
              {editing ? (
                <textarea
                  aria-label={`Edit bullets for ${role.title} at ${role.org}`}
                  value={role.after.join('\n')}
                  onChange={(e) => editRoleBullets(role.org, role.title, e.target.value)}
                  rows={Math.max(2, role.after.length)}
                  className="input mt-1.5 resize-y"
                />
              ) : (
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  <ul className="space-y-1 rounded-lg border border-line-soft bg-surface p-2.5 text-xs text-ink-faint">
                    <li className="font-medium text-ink-soft">Original</li>
                    {role.before.map((b, i) => <li key={i} className="line-through decoration-ink-faint/40">{b}</li>)}
                  </ul>
                  <ul className="space-y-1 rounded-lg border border-accent/30 bg-accent-soft/40 p-2.5 text-xs text-ink">
                    <li className="font-medium text-ink-soft">Tailored</li>
                    {role.after.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {omissions.length > 0 && (
        <div className="mt-4 border-t border-line-soft pt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Explicit omissions</span>
          <p className="mt-1 text-xs leading-5 text-ink-soft">
            These source items were deliberately left out. Each remains visible and individually reversible.
          </p>
          <ul className="mt-2 space-y-2" aria-label="Explicit résumé omissions">
            {omissions.map((omission) => {
              const sourceText = resolveResumeSourceRef(source, omission.sourceRef);
              return (
                <li
                  key={omission.sourceRef}
                  className="rounded-lg border border-line-soft bg-surface p-3"
                  data-source-ref={omission.sourceRef}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-ink-soft">
                          {omissionContext(source, omission.sourceRef)}
                        </span>
                        <Badge tone="eyebrow">
                          {omission.jdBased ? 'JD-based omission' : 'Editorial omission'}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-xs leading-5 text-ink line-through decoration-ink-faint/50">
                        {sourceText ?? `Source item ${omission.sourceRef}`}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ink-soft">
                        <span className="font-medium text-ink">Reason:</span> {omission.reason}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Restore omitted ${omission.sourceRef}`}
                      onClick={() => props.onRestoreOmission?.(omission.sourceRef)}
                    >
                      <RotateCcw className="h-3 w-3" /> Restore
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {diff.unsupportedJd.length > 0 && (
        <div className="mt-4 border-t border-line-soft pt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Asked by the job, left unclaimed</span>
          <p className="mt-1 text-xs leading-5 text-ink-soft">
            You couldn&apos;t evidence these, so tailoring did not claim them: {diff.unsupportedJd.join(', ')}.
          </p>
        </div>
      )}
    </section>
  );
}
