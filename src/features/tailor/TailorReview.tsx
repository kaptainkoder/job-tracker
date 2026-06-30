import { useState } from 'react';
import { Pencil, RotateCcw } from 'lucide-react';
import { diffTailored } from '../../shared/domain/tailor';
import type { StructuredResume } from '../../shared/domain/resume';
import Badge from '../../shared/ui/Badge';
import Button from '../../shared/ui/Button';

interface TailorReviewProps {
  /** The confirmed source résumé — the restore target and the truth baseline. */
  source: StructuredResume;
  /** The applied tailored résumé that drives the preview AND the download (preview == download). */
  tailored: StructuredResume;
  /** JD skills the user could not evidence (foldResolutions().futureSuggestions labels) — shown as
   *  deliberately NOT claimed, never as silent omissions. */
  unsupportedJd: string[];
  /** Edits and restores produce a new tailored résumé; the parent re-renders preview + download. */
  onChange: (next: StructuredResume) => void;
}

// Match a role by its LOCKED structural identity (org+title+dates), because applyTailoredResume can
// reorder roles — index matching would target the wrong one.
function sameRole(a: { org: string; title: string; start: string; end: string }, org: string, title: string): boolean {
  return a.org.trim() === org.trim() && a.title.trim() === title.trim();
}

// G3 — pre-download review. Surfaces exactly what tailoring changed (summary rewrite, new Skills,
// per-role before→after bullets, and JD asks left unclaimed) with restore + inline edit. Every
// control writes back through `onChange`, so the same StructuredResume feeds the canvas preview and
// the PDF download — there is never a hidden difference between what is reviewed and what is saved.
export default function TailorReview({ source, tailored, unsupportedJd, onChange }: TailorReviewProps) {
  const [editing, setEditing] = useState(false);
  const diff = diffTailored(source, tailored, { unsupportedJd });

  function restoreAll() {
    onChange(source);
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
          <Button variant="secondary" size="sm" disabled={diff.unchanged} onClick={restoreAll}>
            <RotateCcw className="h-3.5 w-3.5" /> Restore original
          </Button>
        </div>
      </div>

      {diff.unchanged ? (
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
