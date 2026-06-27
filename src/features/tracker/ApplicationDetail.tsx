import {
  AlarmClock,
  ExternalLink,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Application, Outcome, Stage } from '../../shared/types';
import { STAGES, STAGE_LABEL, STAGE_PILL, STAGE_DOT, isStale } from '../../shared/domain/stages';
import { supabase } from '../../shared/lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import {
  OUTCOME_KINDS,
  OUTCOME_LABEL,
  OUTCOME_PILL,
  emptyOutcomeForm,
  outcomeFormToPayload,
  sortOutcomesDesc,
  suggestedStageForOutcome,
  validateOutcomeForm,
  type OutcomeFieldErrors,
  type OutcomeFormValues,
} from '../outcomes/outcomes';
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
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const stale = isStale(application.stage, application.last_activity_at);

  // Outcomes for this application (loaded + managed locally so logging one without a
  // stage change keeps the detail open and just refreshes the list).
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [outcomesLoading, setOutcomesLoading] = useState(true);
  const [logging, setLogging] = useState(false);
  const [form, setForm] = useState<OutcomeFormValues>(emptyOutcomeForm());
  const [formErrors, setFormErrors] = useState<OutcomeFieldErrors>({});
  const [alsoMove, setAlsoMove] = useState(true);
  const [savingOutcome, setSavingOutcome] = useState(false);

  useEffect(() => {
    let active = true;
    setOutcomesLoading(true);
    void supabase
      .from('outcomes')
      .select('*')
      .eq('application_id', application.id)
      .then(({ data }) => {
        if (!active) return;
        setOutcomes((data ?? []) as Outcome[]);
        setOutcomesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [application.id]);

  async function changeStage(next: Stage) {
    if (next === application.stage) return;
    setBusy(true);
    setError(null);
    const patch = applyStageChange(application, next);
    const { error: updateError } = await supabase.from('applications').update(patch).eq('id', application.id);
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
    const { error: deleteError } = await supabase.from('applications').delete().eq('id', application.id);
    setBusy(false);
    if (deleteError) {
      setError(`Could not delete the application. ${deleteError.message}`);
      return;
    }
    onChanged();
  }

  const suggestedStage = suggestedStageForOutcome(form.kind);
  const offerMove = suggestedStage && suggestedStage !== application.stage;

  function updateForm(field: keyof OutcomeFormValues, v: string) {
    setForm((current) => ({ ...current, [field]: v }));
    setFormErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleLogOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const errors = validateOutcomeForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSavingOutcome(true);
    setError(null);
    const { error: insertError } = await supabase
      .from('outcomes')
      .insert(outcomeFormToPayload(form, application.id, user.id));

    if (insertError) {
      setSavingOutcome(false);
      setError(`Could not log the outcome. ${insertError.message}`);
      return;
    }

    // Optionally advance the card to the stage this outcome implies.
    if (offerMove && alsoMove && suggestedStage) {
      const { error: stageError } = await supabase
        .from('applications')
        .update(applyStageChange(application, suggestedStage))
        .eq('id', application.id);
      setSavingOutcome(false);
      if (stageError) {
        setError(`Outcome logged, but the stage move failed. ${stageError.message}`);
        return;
      }
      onChanged(); // stage changed → refresh the board and close
      return;
    }

    // No stage move → refresh the local outcomes list and reset the form.
    const { data } = await supabase.from('outcomes').select('*').eq('application_id', application.id);
    setOutcomes((data ?? []) as Outcome[]);
    setSavingOutcome(false);
    setLogging(false);
    setForm(emptyOutcomeForm());
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
            <select id="stage-select" value={application.stage} disabled={busy} onChange={(e) => changeStage(e.target.value as Stage)} className="input w-auto py-2">
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

        {/* Outcome loop */}
        <section aria-labelledby="outcomes-heading">
          <div className="mb-2 flex items-center justify-between">
            <h4 id="outcomes-heading" className="text-sm font-semibold text-ink">Outcomes</h4>
            {!logging && (
              <button type="button" onClick={() => { setLogging(true); setForm(emptyOutcomeForm()); }} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-surface-2 hover:text-ink">
                <Plus className="h-3.5 w-3.5" /> Log outcome
              </button>
            )}
          </div>

          {logging && (
            <form onSubmit={handleLogOutcome} noValidate className="mb-3 rounded-xl border border-line-soft bg-surface-2/40 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="outcome-kind" className="text-xs font-medium text-ink-soft">Outcome</label>
                  <select id="outcome-kind" value={form.kind} onChange={(e) => updateForm('kind', e.target.value)} className="input mt-1.5">
                    {OUTCOME_KINDS.map((k) => <option key={k} value={k}>{OUTCOME_LABEL[k]}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="outcome-date" className="text-xs font-medium text-ink-soft">Date</label>
                  <input id="outcome-date" type="date" value={form.occurred_on} onChange={(e) => updateForm('occurred_on', e.target.value)} className={`input mt-1.5 ${formErrors.occurred_on ? 'border-stage-rejected' : ''}`} />
                  {formErrors.occurred_on && <span className="mt-1 block text-xs text-stage-rejected">{formErrors.occurred_on}</span>}
                </div>
              </div>
              <div className="mt-3">
                <label htmlFor="outcome-notes" className="text-xs font-medium text-ink-soft">Note (optional)</label>
                <input id="outcome-notes" value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} placeholder="Recruiter call scheduled, took-home sent, …" className="input mt-1.5" />
              </div>
              {offerMove && (
                <label className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
                  <input type="checkbox" checked={alsoMove} onChange={(e) => setAlsoMove(e.target.checked)} className="h-4 w-4 rounded border-line text-accent" />
                  Also move this application to <span className="font-medium text-ink">{STAGE_LABEL[suggestedStage]}</span>
                </label>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => { setLogging(false); setFormErrors({}); }} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-soft hover:bg-surface-2">Cancel</button>
                <button type="submit" disabled={savingOutcome} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60">
                  {savingOutcome && <LoaderCircle className="h-4 w-4 animate-spin" />} Log
                </button>
              </div>
            </form>
          )}

          {outcomesLoading ? (
            <p className="px-1 text-sm text-ink-faint">Loading outcomes…</p>
          ) : outcomes.length === 0 ? (
            <p className="px-1 text-sm text-ink-faint">No outcomes logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {sortOutcomesDesc(outcomes).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 rounded-xl border border-line-soft px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`pill ${OUTCOME_PILL[o.kind]}`}>{OUTCOME_LABEL[o.kind]}</span>
                    {o.notes && <span className="truncate text-sm text-ink-soft">{o.notes}</span>}
                  </div>
                  <span className="shrink-0 text-xs text-ink-faint">{formatRelativeActivity(o.occurred_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

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
