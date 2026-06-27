import {
  AlarmClock,
  ExternalLink,
  LoaderCircle,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Application, Stage } from '../../shared/types';
import { STAGES, STAGE_LABEL, STAGE_PILL, STAGE_DOT, isStale } from '../../shared/domain/stages';
import { supabase } from '../../shared/lib/supabase';
import { applyStageChange, formatRelativeActivity, formatSalary } from './applications';
import { ModalShell } from './ApplicationForm';

interface ApplicationDetailProps {
  application: Application;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line-soft py-2.5 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

const UNSPECIFIED = <span className="text-ink-faint">unspecified</span>;
const value = (v: string | null | undefined) => (v && v.trim() ? v : UNSPECIFIED);

export default function ApplicationDetail({ application, onClose, onEdit, onChanged }: ApplicationDetailProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const stale = isStale(application.stage, application.last_activity_at);

  async function changeStage(next: Stage) {
    if (next === application.stage) return;
    setBusy(true);
    setError(null);
    const patch = applyStageChange(application, next);
    const { error: updateError } = await supabase
      .from('applications')
      .update(patch)
      .eq('id', application.id);
    setBusy(false);
    if (updateError) {
      setError(`Could not update the stage. ${updateError.message}`);
      return;
    }
    onChanged();
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const { error: deleteError } = await supabase
      .from('applications')
      .delete()
      .eq('id', application.id);
    setBusy(false);
    if (deleteError) {
      setError(`Could not delete the application. ${deleteError.message}`);
      return;
    }
    onChanged();
  }

  return (
    <ModalShell title="Application" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-ink">{application.company}</h3>
            <p className="text-sm text-ink-soft">{application.role}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`pill ${STAGE_PILL[application.stage]}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[application.stage]}`} />
                {STAGE_LABEL[application.stage]}
              </span>
              {stale && (
                <span className="pill bg-stage-applied/15 text-stage-applied">
                  <AlarmClock className="h-3 w-3" /> needs follow-up
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="stage-select" className="sr-only">Change stage</label>
            <select
              id="stage-select"
              value={application.stage}
              disabled={busy}
              onChange={(e) => changeStage(e.target.value as Stage)}
              className="input w-auto py-2"
            >
              {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
            <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-surface-2 hover:text-ink">
              <Pencil className="h-4 w-4" /> Edit
            </button>
          </div>
        </div>

        <dl className="rounded-xl border border-line-soft bg-surface-2/40 px-4">
          <Row label="Priority">{application.priority}</Row>
          <Row label="Salary">{formatSalary(application)}</Row>
          <Row label="Location">{value(application.job_location)}</Row>
          <Row label="Job link">
            {application.job_url ? (
              <a href={application.job_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                Open posting <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : UNSPECIFIED}
          </Row>
          <Row label="Applied on">{value(application.date_applied)}</Row>
          <Row label="Last activity">{formatRelativeActivity(application.last_activity_at)}</Row>
          <Row label="Notes">{value(application.notes)}</Row>
        </dl>

        <div className="flex flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5" aria-live="polite">
            {error && <p className="text-sm text-stage-rejected" role="alert">{error}</p>}
          </div>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-soft">Delete this application?</span>
              <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-soft hover:bg-surface-2">Cancel</button>
              <button type="button" disabled={busy} onClick={handleDelete} className="inline-flex items-center gap-1.5 rounded-xl bg-stage-rejected px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Confirm delete
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 self-start rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink-faint transition hover:border-stage-rejected hover:text-stage-rejected">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
