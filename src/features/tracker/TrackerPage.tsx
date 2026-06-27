import { STAGES, STAGE_LABEL, STAGE_PILL, STAGE_DOT } from '../../shared/domain/stages';

// A0 placeholder: proves the design-token system + stage model render. The real
// dashboard (cards from Supabase, last-activity, stale surfacing) lands in chunk A4.
export default function TrackerPage() {
  return (
    <div className="animate-rise space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Tracker</h1>
        <p className="text-sm text-ink-soft">
          Every application, by stage. Live data arrives in chunk A4.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {STAGES.map((s) => (
          <span key={s} className={`pill ${STAGE_PILL[s]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[s]}`} />
            {STAGE_LABEL[s]}
          </span>
        ))}
      </div>

      <div className="card max-w-md p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium text-ink">Stripe</p>
            <p className="text-sm text-ink-soft">Senior Backend Engineer</p>
          </div>
          <span className={`pill ${STAGE_PILL.interviewing}`}>Interviewing</span>
        </div>
        <p className="mt-3 text-xs text-ink-faint">last activity 2d ago · salary unspecified</p>
      </div>
    </div>
  );
}
