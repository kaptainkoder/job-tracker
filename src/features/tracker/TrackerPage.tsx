import { LoaderCircle, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Application } from '../../shared/types';
import { isStale } from '../../shared/domain/stages';
import { supabase } from '../../shared/lib/supabase';
import Button from '../../shared/ui/Button';
import StatCard from '../../shared/ui/StatCard';
import StagePill from '../../shared/ui/StagePill';
import JobCard from '../../shared/ui/JobCard';
import { useAuth } from '../auth/AuthProvider';
import {
  computeMetrics,
  countStale,
  formatRelativeActivity,
  formatResponseRate,
  formatSalary,
  groupByStage,
} from './applications';
import ApplicationForm from './ApplicationForm';
import ApplicationDetail from './ApplicationDetail';

type Modal =
  | { type: 'closed' }
  | { type: 'add' }
  | { type: 'edit'; app: Application }
  | { type: 'detail'; app: Application };

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
  const metrics = computeMetrics(apps);

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
      <section className="card max-w-reading p-6" role="alert">
        <h1 className="text-h2 font-semibold text-ink">We couldn’t load your applications</h1>
        <p className="mt-2 text-sm text-stage-rejected">{loadError}</p>
        <Button size="lg" className="mt-5" onClick={refetch}>
          Try again
        </Button>
      </section>
    );
  }

  return (
    <div className="animate-rise space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold text-ink">Tracker</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Every application, by stage.
            {staleCount > 0 && (
              <span className="ml-1 text-stage-interviewing">
                {staleCount} need{staleCount === 1 ? 's' : ''} follow-up.
              </span>
            )}
          </p>
        </div>
        <Button size="lg" onClick={() => setModal({ type: 'add' })}>
          <Plus className="h-4 w-4" /> Add application
        </Button>
      </header>

      {/* Dashboard metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total applications" value={metrics.total} />
        <StatCard label="In interview" value={metrics.interviewing} dotClass="bg-stage-interviewing" />
        <StatCard label="Offers" value={metrics.offers} dotClass="bg-stage-offer" />
        <StatCard
          label="Response rate"
          value={formatResponseRate(metrics.responseRate)}
          sub="interviews + offers ÷ submitted"
        />
      </div>

      {apps.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-h3 font-medium text-ink">No applications yet</p>
          <p className="max-w-sm text-sm text-ink-soft">
            Paste a job description, a recruiter InMail, or just a link — we’ll capture what we can
            and you fill in the rest.
          </p>
          <Button className="mt-1" onClick={() => setModal({ type: 'add' })}>
            <Plus className="h-4 w-4" /> Add your first application
          </Button>
        </div>
      ) : (
        // Kanban board: one column per stage. Horizontally scrolls on mobile; fits the
        // content width on desktop (columns become equal-width).
        <div className="flex gap-3 overflow-x-auto pb-2 md:overflow-visible">
          {groups.map(({ stage, apps: stageApps }) => (
            <section
              key={stage}
              className="flex w-[78vw] shrink-0 flex-col gap-2.5 rounded-xl bg-surface-2/60 p-2.5 sm:w-64 md:w-auto md:min-w-0 md:flex-1"
            >
              <div className="px-1 pt-1">
                <StagePill stage={stage} dotOnly count={stageApps.length} />
              </div>
              {stageApps.length === 0 ? (
                <p className="px-1 pb-2 text-xs text-ink-faint">Nothing here.</p>
              ) : (
                stageApps.map((app) => (
                  <JobCard
                    key={app.id}
                    company={app.company}
                    role={app.role}
                    location={app.job_location}
                    salary={formatSalary(app)}
                    last={formatRelativeActivity(app.last_activity_at)}
                    priority={app.priority}
                    stale={isStale(app.stage, app.last_activity_at)}
                    onOpen={() => setModal({ type: 'detail', app })}
                  />
                ))
              )}
            </section>
          ))}
        </div>
      )}

      {modal.type === 'add' && (
        <ApplicationForm mode="add" onClose={() => setModal({ type: 'closed' })} onSaved={refetchAndSync} />
      )}
      {modal.type === 'edit' && (
        <ApplicationForm
          mode="edit"
          application={modal.app}
          onClose={() => setModal({ type: 'detail', app: modal.app })}
          onSaved={refetchAndSync}
        />
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
