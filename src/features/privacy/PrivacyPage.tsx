import { LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { PrivacyLogEntry } from '../../shared/types';
import { supabase } from '../../shared/lib/supabase';
import Badge from '../../shared/ui/Badge';
import { useAuth } from '../auth/AuthProvider';
import {
  computePrivacyMetrics,
  formatPrivacyAction,
  formatPrivacyCost,
  shortenPayloadHash,
} from './privacyPresentation';

const TARGET_LABEL: Record<PrivacyLogEntry['target'], string> = {
  openrouter: 'OpenRouter',
  enhancecv: 'EnhanceCV',
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      }).format(date);
}

function MetricCard({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-1 text-stat font-semibold text-ink">
        {value}{suffix && <span className="ml-1 text-xs font-normal text-ink-faint">{suffix}</span>}
      </p>
    </div>
  );
}

export default function PrivacyPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<PrivacyLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setLoadError(null);
    void supabase
      .from('privacy_log')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setLoadError(error.message);
        else setEntries((data ?? []) as PrivacyLogEntry[]);
        setLoading(false);
      });
    return () => { active = false; };
  }, [user]);

  const metrics = useMemo(() => computePrivacyMetrics(entries), [entries]);

  return (
    <div className="animate-rise space-y-6">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-accent">Provable egress</p>
        <h1 className="mt-1 text-h1 font-semibold text-ink">Privacy</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">
          Every third-party call records what was sent, what was withheld, its model, integrity hash, and cost. We store the manifest + hash—never the payload.
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center" role="status">
          <LoaderCircle className="h-6 w-6 animate-spin text-accent" />
          <span className="sr-only">Loading privacy log</span>
        </div>
      ) : loadError ? (
        <div className="card max-w-xl p-6" role="alert"><p className="text-sm text-stage-rejected">{loadError}</p></div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Privacy metrics">
            <MetricCard label="Total spend" value={formatPrivacyCost(metrics.totalSpendUsd)} />
            <MetricCard label="Outbound calls" value={metrics.outboundCalls} />
            <MetricCard label="Egress targets" value={metrics.egressTargets} suffix="/ 2 possible" />
          </section>

          {entries.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center" aria-labelledby="privacy-empty-heading">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-ink-faint"><ShieldCheck className="h-6 w-6" /></span>
              <h2 id="privacy-empty-heading" className="mt-4 text-h3 font-semibold text-ink">Nothing has left your database yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">
                When you tailor a résumé or cover letter, every outbound call lands here—what was sent, what was withheld, the cost, and a hash. The payload itself is never stored.
              </p>
            </section>
          ) : (
            <>
              <section className="card overflow-hidden" aria-label="Outbound call log">
                <div className="hidden grid-cols-[6.5rem_7.25rem_minmax(0,1fr)_8.25rem_5.5rem] gap-3 border-b border-line bg-surface-2 px-4 py-3 text-2xs font-semibold uppercase tracking-[0.12em] text-ink-faint md:grid">
                  <span>Time</span><span>Target</span><span>Action · manifest</span><span>Model</span><span className="text-right">Cost</span>
                </div>
                <div className="divide-y divide-line-soft">
                  {entries.map((entry) => (
                    <article key={entry.id} className="grid gap-4 px-4 py-4 md:grid-cols-[6.5rem_7.25rem_minmax(0,1fr)_8.25rem_5.5rem] md:gap-3">
                      <div>
                        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-faint md:hidden">Time</span>
                        <p className="mt-1 text-xs leading-5 text-ink-faint md:mt-0">{formatWhen(entry.created_at)}</p>
                      </div>
                      <div>
                        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-faint md:hidden">Target</span>
                        <span className="mt-1 inline-flex items-center gap-1.5 rounded-sm border border-line bg-surface-2 px-2 py-1 text-xs text-ink-soft md:mt-0">
                          <span className="h-1.5 w-1.5 rounded-full bg-stage-applied" />
                          {TARGET_LABEL[entry.target] ?? entry.target}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-ink">{formatPrivacyAction(entry.action)}</h2>
                        <div className="mt-3">
                          <Badge tone="eyebrow">Sent</Badge>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {entry.sent_manifest.length ? entry.sent_manifest.map((item) => (
                              <span key={item} className="rounded-sm bg-stage-applied/15 px-2 py-1 text-xs text-stage-applied">{item}</span>
                            )) : <span className="text-xs text-ink-faint">None</span>}
                          </div>
                        </div>
                        <div className="mt-3">
                          <Badge tone="eyebrow">Withheld</Badge>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {entry.withheld_manifest.length ? entry.withheld_manifest.map((item) => (
                              <span key={item} className="rounded-sm border border-line bg-surface-2 px-2 py-1 text-xs text-ink-faint line-through">{item}</span>
                            )) : <span className="text-xs text-ink-faint">None</span>}
                          </div>
                        </div>
                        <p className="mt-3 break-all font-mono text-micro text-ink-faint" title={entry.payload_sha256}>sha256 · {shortenPayloadHash(entry.payload_sha256)}</p>
                      </div>
                      <div>
                        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-faint md:hidden">Model</span>
                        <p className="mt-1 break-words text-xs leading-5 text-ink-soft md:mt-0">{entry.model ?? 'Not applicable'}</p>
                      </div>
                      <div>
                        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-faint md:hidden">Cost</span>
                        <p className="mt-1 text-sm font-semibold text-ink md:mt-0 md:text-right">{formatPrivacyCost(entry.cost_usd)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <p className="flex items-center justify-center gap-2 text-center text-xs text-ink-faint">
                <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
                We store a manifest + hash, never the payload. The only possible egress targets are OpenRouter and EnhanceCV.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
