// Outcome-loop domain contract (A5). Pure / env-neutral: no DOM, no network. An outcome
// is a logged real-world result for an application (callback, rejection, offer, …); the
// artifact link (which tailored resume produced it) wires in at Wave B.
import type { Outcome, OutcomeKind, Stage } from '../../shared/types';

export const OUTCOME_KINDS: OutcomeKind[] = ['callback', 'rejected', 'offer', 'ghosted', 'withdrew'];

export const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  callback: 'Callback',
  rejected: 'Rejected',
  offer: 'Offer',
  ghosted: 'Ghosted',
  withdrew: 'Withdrew',
};

// Reuse the stage palette tokens so outcomes read consistently with the board.
export const OUTCOME_PILL: Record<OutcomeKind, string> = {
  callback: 'bg-stage-interviewing/15 text-stage-interviewing',
  rejected: 'bg-stage-rejected/15 text-stage-rejected',
  offer: 'bg-stage-offer/15 text-stage-offer',
  ghosted: 'bg-stage-lead/15 text-stage-lead',
  withdrew: 'bg-stage-lead/15 text-stage-lead',
};

export interface OutcomeFormValues {
  kind: OutcomeKind;
  occurred_on: string; // yyyy-mm-dd from a date input
  notes: string;
}

export type OutcomeFieldErrors = Partial<Record<keyof OutcomeFormValues, string>>;

/** Local yyyy-mm-dd for "today" (date inputs are timezone-naive). */
export function todayISODate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function emptyOutcomeForm(now: Date = new Date()): OutcomeFormValues {
  return { kind: 'callback', occurred_on: todayISODate(now), notes: '' };
}

export function validateOutcomeForm(values: OutcomeFormValues, now: Date = new Date()): OutcomeFieldErrors {
  const errors: OutcomeFieldErrors = {};
  if (!OUTCOME_KINDS.includes(values.kind)) errors.kind = 'Choose an outcome.';

  const date = values.occurred_on.trim();
  if (!date) {
    errors.occurred_on = 'Pick a date.';
  } else {
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      errors.occurred_on = 'Enter a valid date.';
    } else if (parsed.getTime() > new Date(`${todayISODate(now)}T23:59:59`).getTime()) {
      errors.occurred_on = 'The date can’t be in the future.';
    }
  }
  return errors;
}

export interface OutcomePayload {
  application_id: string;
  user_id: string;
  kind: OutcomeKind;
  occurred_at: string; // ISO timestamp
  notes: string | null;
  artifact_id: null; // wired in Wave B
}

export function outcomeFormToPayload(
  values: OutcomeFormValues,
  applicationId: string,
  userId: string,
): OutcomePayload {
  return {
    application_id: applicationId,
    user_id: userId,
    kind: values.kind,
    occurred_at: new Date(`${values.occurred_on}T12:00:00`).toISOString(),
    notes: values.notes.trim() || null,
    artifact_id: null,
  };
}

/** Most recent outcome by occurred_at, or null when there are none. */
export function latestOutcome(outcomes: Outcome[]): Outcome | null {
  if (outcomes.length === 0) return null;
  return outcomes.reduce((latest, o) =>
    new Date(o.occurred_at).getTime() > new Date(latest.occurred_at).getTime() ? o : latest,
  );
}

export function sortOutcomesDesc(outcomes: Outcome[]): Outcome[] {
  return [...outcomes].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
}

/**
 * The stage an outcome implies, when logging it should offer to move the card.
 * Only the unambiguous ones map; callback/ghosted/withdrew don't force a stage.
 */
export function suggestedStageForOutcome(kind: OutcomeKind): Stage | null {
  if (kind === 'offer') return 'offer';
  if (kind === 'rejected') return 'rejected';
  return null;
}
