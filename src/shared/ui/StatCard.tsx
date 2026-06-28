import type { ReactNode } from 'react';

// Canonical StatCard (Claude Design): a calm metric tile — small label, a 26px number
// (text-stat), an optional sub-line, and an optional leading dot to carry a single stage
// hue (e.g. amber for "in interview"). Near-monochrome: the number stays ink, not accent.
export default function StatCard({
  label,
  value,
  sub,
  dotClass,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  /** Optional stage-hue dot, e.g. "bg-stage-interviewing". */
  dotClass?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        {dotClass && <span className={`h-2 w-2 rounded-full ${dotClass}`} />}
        <p className="text-xs font-medium text-ink-soft">{label}</p>
      </div>
      <p className="mt-2 text-stat font-semibold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-faint">{sub}</p>}
    </div>
  );
}
