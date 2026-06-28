import { AlarmClock } from 'lucide-react';
import type { Priority } from '../types';

// Canonical JobCard (Claude Design). Lives inside a Kanban column, so it carries NO
// StagePill — the column IS the stage. Shows company / role / "location · salary" /
// a priority eyebrow / last-touched, plus an amber stale dot when follow-up is overdue.
// Presentational only: all strings are pre-formatted by the caller (salary → "unspecified"
// when unknown, never a guess), keeping the shared layer free of feature/domain imports.

// Priority hue per the design: high → rejected-red, medium → amber, low → ink-faint.
const PRIORITY_DOT: Record<Priority, string> = {
  high: 'bg-stage-rejected',
  medium: 'bg-stage-interviewing',
  low: 'bg-ink-faint',
};
const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export default function JobCard({
  company,
  role,
  location,
  salary,
  last,
  priority,
  stale,
  onOpen,
}: {
  company: string;
  role: string;
  location: string | null;
  salary: string;
  last: string;
  priority: Priority;
  stale: boolean;
  onOpen: () => void;
}) {
  // "location · salary" — drop the separator when location is unknown.
  const meta = location && location.trim() ? `${location} · ${salary}` : salary;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card group w-full p-3 text-left transition hover:shadow-cardHover"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[priority]}`} />
          {PRIORITY_LABEL[priority]}
        </span>
        {stale && (
          <span className="inline-flex items-center" title="Needs follow-up">
            <span className="h-1.5 w-1.5 rounded-full bg-stage-interviewing" />
          </span>
        )}
      </div>
      <p className="mt-1.5 truncate font-medium text-ink">{company}</p>
      <p className="truncate text-sm text-ink-soft">{role}</p>
      <p className="mt-2 truncate text-xs text-ink-faint">{meta}</p>
      <p className="mt-1 flex items-center gap-1 text-2xs text-ink-faint">
        {stale && <AlarmClock className="h-3 w-3 text-stage-interviewing" />}
        {last}
      </p>
    </button>
  );
}
