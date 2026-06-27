import { AlarmClock, LoaderCircle, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Application } from '../../shared/types';
import { STAGE_LABEL, STAGE_PILL, STAGE_DOT, isStale } from '../../shared/domain/stages';
import { supabase } from '../../shared/lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { countStale, formatRelativeActivity, formatSalary, groupByStage } from './applications';
import ApplicationForm from './ApplicationForm';
import ApplicationDetail from './ApplicationDetail';

type Modal =
  | { type: 'closed' }
  | { type: 'add' }
  | { type: 'edit'; app: Application }
  | { type: 'detail'; app: Application };

const PRIORITY_DOT: Record<Application['priority'], string> = {
  high: 'bg-stage-rejected',
  medium: 'bg-stage-applied',
  low: 'bg-ink-faint',
};

export default function TrackerPage() {
  const { user } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [modal, setModal] = useState<Modal>({ type: 'closed' });

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setLoadError(null);

    void supabase
      .from('applications')
      .select('*')
      .eq('user_id', user.id)
      .order('last_activity_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setLoadError(error.message);
        else setApps((data ?? []) as Application[]);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey, user]);

  function refetch() {
    setReloadKey((key) => key + 1);
  }

  // Keep the detail modal showing fresh data after an in-place change.
  function refetchAndSync() {
    refetch();
    setModal({ type: 'closed' });
  }

  const groups = groupByStage(apps);
  const staleCount = countStale(apps);

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center" role="status">
        <LoaderCircle className="h-6 w-6 animate-spin text-accent" />
        <span className="sr-only">Loading applications</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <section className="card max-w-xl p-6" role="alert">
        <h1 className="text-xl font-semibold text-ink">We couldn’t load your applications</h1>
        <p className="mt-2 text-sm text-stage-rejected">{loadError}</p>
        <button type="button" onClick={refetch} className="mt-5 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-strong">
          Try again
        </button>
      </section>
    );
  }

  return (
    <div className="animate-rise space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Tracker</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Every application, by stage.
            {staleCount > 0 && (
              <span className="ml-1 inline-flex items-center gap-1 text-stage-applied">
                <AlarmClock className="h-3.5 w-3.5" />
                {staleCount} need{staleCount === 1 ? 's' : ''} follow-up
              </span>
            )}
          </p>
        </div>
        <button type="button" onClick={() => setModal({ type: 'add' })} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-card transition hover:bg-accent-strong">
          <Plus className="h-4 w-4" /> Add application
        </button>
      </header>

      {apps.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-base font-medium text-ink">No applications yet</p>
          <p className="max-w-sm text-sm text-ink-soft">
            Paste a job description, a recruiter InMail, or just a link — we’ll capture what we can and you fill in the rest.
          </p>
          <button type="button" onClick={() => setModal({ type: 'add' })} className="mt-1 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-strong">
            <Plus className="h-4 w-4" /> Add your first application
          </button>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map(({ stage, apps: stageApps }) => (
            <section key={stage}>
              <div className="mb-3 flex items-center gap-2">
                <span className={`pill ${STAGE_PILL[stage]}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[stage]}`} />
                  {STAGE_LABEL[stage]}
                </span>
                <span className="text-xs text-ink-faint">{stageApps.length}</span>
              </div>
              {stageApps.length === 0 ? (
                <p className="px-1 text-sm text-ink-faint">No applications in this stage.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {stageApps.map((app) => (
                    <ApplicationCard key={app.id} app={app} onOpen={() => setModal({ type: 'detail', app })} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {modal.type === 'add' && (
        <ApplicationForm mode="add" onClose={() => setModal({ type: 'closed' })} onSaved={refetchAndSync} />
      )}
      {modal.type === 'edit' && (
        <ApplicationForm mode="edit" application={modal.app} onClose={() => setModal({ type: 'detail', app: modal.app })} onSaved={refetchAndSync} />
      )}
      {modal.type === 'detail' && (
        <ApplicationDetail
          application={modal.app}
          onClose={() => setModal({ type: 'closed' })}
          onEdit={() => setModal({ type: 'edit', app: modal.app })}
          onChanged={refetchAndSync}
        />
      )}
    </div>
  );
}

function ApplicationCard({ app, onOpen }: { app: Application; onOpen: () => void }) {
  const stale = isStale(app.stage, app.last_activity_at);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card group p-4 text-left transition hover:shadow-cardHover focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{app.company}</p>
          <p className="truncate text-sm text-ink-soft">{app.role}</p>
        </div>
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[app.priority]}`} title={`${app.priority} priority`} />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-ink-faint">
        <span>{formatSalary(app)}</span>
        <span className={stale ? 'flex items-center gap-1 text-stage-applied' : ''}>
          {stale && <AlarmClock className="h-3 w-3" />}
          {formatRelativeActivity(app.last_activity_at)}
        </span>
      </div>
    </button>
  );
}
