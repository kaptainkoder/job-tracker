import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PrivacyLogEntry } from '../../shared/types';
import { supabase } from '../../shared/lib/supabase';
import { useAuth } from '../auth/AuthProvider';

const TARGET_LABEL: Record<PrivacyLogEntry['target'], string> = {
  openrouter: 'OpenRouter',
  enhancecv: 'EnhanceCV',
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
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
    // select('*') so the screen works whether or not the 0002 `model` column is applied yet.
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
    return () => {
      active = false;
    };
  }, [user]);

  return (
    <div className="animate-rise space-y-6">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-accent">What leaves your machine</p>
        <h1 className="mt-1 text-h1 font-semibold text-ink">Privacy</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">
          Every call this app makes to a third party (OpenRouter, EnhanceCV) is logged here with a
          plain-English manifest of what was sent, what was withheld, the model, an integrity hash,
          and the cost. Payloads themselves are never stored.
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center" role="status">
          <LoaderCircle className="h-6 w-6 animate-spin text-accent" />
          <span className="sr-only">Loading privacy log</span>
        </div>
      ) : loadError ? (
        <div className="card max-w-xl p-6" role="alert">
          <p className="text-sm text-stage-rejected">{loadError}</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <span className="rounded-xl bg-accent-soft p-2.5 text-accent"><ShieldCheck className="h-6 w-6" /></span>
          <p className="text-base font-medium text-ink">Nothing has left your data yet</p>
          <p className="max-w-md text-sm text-ink-soft">
            This log fills in once tailoring and document generation start making outbound calls
            (Wave B). Until then, no third party has received any of your data.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-line-soft text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Sent</th>
                <th className="px-4 py-3 font-medium">Withheld</th>
                <th className="px-4 py-3 font-medium">Hash</th>
                <th className="px-4 py-3 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-line-soft last:border-0 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-ink-soft">{formatWhen(e.created_at)}</td>
                  <td className="px-4 py-3 text-ink">{TARGET_LABEL[e.target] ?? e.target}</td>
                  <td className="px-4 py-3 text-ink">{e.action}</td>
                  <td className="px-4 py-3 text-ink-soft">{e.model ?? <span className="text-ink-faint">—</span>}</td>
                  <td className="px-4 py-3 text-ink-soft">{e.sent_manifest.join(', ') || <span className="text-ink-faint">—</span>}</td>
                  <td className="px-4 py-3 text-ink-soft">{e.withheld_manifest.join(', ') || <span className="text-ink-faint">—</span>}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-faint">{e.payload_sha256.slice(0, 10)}…</td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-soft">{e.cost_usd == null ? '—' : `$${e.cost_usd}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
