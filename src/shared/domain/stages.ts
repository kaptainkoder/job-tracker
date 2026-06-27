// Single source of truth for the application pipeline stages: order, labels, and the
// design-token color each maps to. Pure/env-neutral so both UI and api/ can use it.
import type { Stage } from '../types';

export const STAGES: Stage[] = ['lead', 'applied', 'interviewing', 'offer', 'rejected'];

export const STAGE_LABEL: Record<Stage, string> = {
  lead: 'Lead',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
};

// Literal Tailwind classes per stage. Must be full static strings (NOT built with
// `bg-${...}`) so Tailwind's JIT scanner sees them and doesn't purge them.
export const STAGE_PILL: Record<Stage, string> = {
  lead: 'bg-stage-lead/15 text-stage-lead',
  applied: 'bg-stage-applied/15 text-stage-applied',
  interviewing: 'bg-stage-interviewing/15 text-stage-interviewing',
  offer: 'bg-stage-offer/15 text-stage-offer',
  rejected: 'bg-stage-rejected/15 text-stage-rejected',
};
export const STAGE_DOT: Record<Stage, string> = {
  lead: 'bg-stage-lead',
  applied: 'bg-stage-applied',
  interviewing: 'bg-stage-interviewing',
  offer: 'bg-stage-offer',
  rejected: 'bg-stage-rejected',
};

// Stages still "in play" — a rejected/offer application is terminal and never stale.
export const ACTIVE_STAGES: Stage[] = ['lead', 'applied', 'interviewing'];

// An application is stale if it's still active and untouched for N+ days.
export const STALE_AFTER_DAYS = 10;

export function isStale(stage: Stage, lastActivityISO: string, now: Date = new Date()): boolean {
  if (!ACTIVE_STAGES.includes(stage)) return false;
  const last = new Date(lastActivityISO).getTime();
  const days = (now.getTime() - last) / (1000 * 60 * 60 * 24);
  return days >= STALE_AFTER_DAYS;
}
