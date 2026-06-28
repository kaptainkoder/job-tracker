import {
  Check,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  Radio,
  Save,
  ShieldCheck,
  Square,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { UserSettings } from '../../shared/types';
import { supabase } from '../../shared/lib/supabase';
import { streamLlm } from '../../shared/lib/llmClient';
import {
  buildManifest,
  preflightKey,
  requiresPreflight,
} from '../../shared/domain/privacy';
import Badge from '../../shared/ui/Badge';
import Button from '../../shared/ui/Button';
import PreflightModal from '../../shared/ui/PreflightModal';
import { useAuth } from '../auth/AuthProvider';

// A ping carries no personal data — only a short test message — so its manifest sends nothing
// from the profile and withholds everything. The gate still fires (first-of-type egress to a
// third party), proving no external call ships un-gated or un-logged.
const PING_MANIFEST = buildManifest([]);
const PING_KEY = preflightKey('openrouter', 'ping');
import {
  DEFAULT_SETTINGS_FORM,
  MODEL_OPTIONS,
  settingsFormToPayload,
  settingsToForm,
  type UserSettingsFormValues,
} from './settings';

export default function SettingsPage() {
  const { user, session } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [values, setValues] = useState<UserSettingsFormValues>(DEFAULT_SETTINGS_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Streaming connection test.
  const [streaming, setStreaming] = useState(false);
  const [streamOutput, setStreamOutput] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [auditNote, setAuditNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Pre-flight gate: (target, action) pairs approved this session, plus the open dialog flag.
  const [approvedKeys, setApprovedKeys] = useState<string[]>([]);
  const [preflightOpen, setPreflightOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setLoadError(null);

    void supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setLoadError(error.message);
        } else {
          setValues(settingsToForm(data as UserSettings | null));
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey, user]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function update<K extends keyof UserSettingsFormValues>(field: K, value: UserSettingsFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setFormError(null);
    setFormSuccess(null);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setFormError(null);
    setFormSuccess(null);

    const { data, error } = await supabase
      .from('user_settings')
      .upsert(settingsFormToPayload(user.id, values), { onConflict: 'user_id' })
      .select('*')
      .single();
    setSaving(false);

    if (error) {
      setFormError(`Could not save settings. ${error.message}`);
      return;
    }
    setValues(settingsToForm(data as UserSettings));
    setFormSuccess('Settings saved.');
  }

  // Echo has zero egress, so it runs ungated. Ping egresses to OpenRouter, so it must clear the
  // pre-flight gate first; the click handler decides whether the dialog is required.
  function onPingClick() {
    setStreamError(null);
    setAuditNote(null);
    if (requiresPreflight({ target: 'openrouter', action: 'ping', manifest: PING_MANIFEST, approvedKeys })) {
      setPreflightOpen(true);
    } else {
      void runStream('ping');
    }
  }

  function approvePreflight() {
    setApprovedKeys((keys) => (keys.includes(PING_KEY) ? keys : [...keys, PING_KEY]));
    setPreflightOpen(false);
    void runStream('ping');
  }

  async function runStream(action: 'echo' | 'ping') {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    setStreamError(null);
    setStreamOutput('');

    try {
      await streamLlm({
        action,
        model: values.model,
        noLog: values.no_log,
        accessToken: session?.access_token ?? null,
        signal: controller.signal,
        onToken: (token) => setStreamOutput((current) => current + token),
      });
      if (action === 'ping') setAuditNote('Logged to your privacy log.');
    } catch (error) {
      if (controller.signal.aborted) return;
      setStreamError(error instanceof Error ? error.message : 'Streaming failed.');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setStreaming(false);
      }
    }

  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center" role="status">
        <LoaderCircle className="h-6 w-6 animate-spin text-accent" />
        <span className="sr-only">Loading settings</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <section className="card max-w-reading p-6" role="alert">
        <h1 className="text-h2 font-semibold text-ink">We couldn’t load your settings</h1>
        <p className="mt-2 text-sm text-stage-rejected">{loadError}</p>
        <Button size="lg" className="mt-5" onClick={() => setReloadKey((key) => key + 1)}>
          Try again
        </Button>
      </section>
    );
  }

  return (
    <div className="animate-rise max-w-reading space-y-6">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-accent">Tailoring engine</p>
        <h1 className="mt-1 text-h1 font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm leading-6 text-ink-soft">
          Choose the model that writes your tailored documents and how its provider handles your data.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <section className="card p-5 sm:p-6" aria-labelledby="model-heading">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="model-heading" className="font-semibold text-ink">Language model</h2>
              <p className="mt-1 text-sm leading-6 text-ink-soft">Pick the model every tailor and prep call uses. The stored value remains a real OpenRouter slug.</p>
            </div>
            <Badge tone="accent" className="shrink-0">Via OpenRouter</Badge>
          </div>

          <div className="mt-4 space-y-2" role="radiogroup" aria-label="Language model">
            {MODEL_OPTIONS.map((option) => {
              const active = values.model === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => update('model', option.value)}
                  className={`flex w-full items-center justify-between gap-4 rounded-md border px-4 py-3 text-left transition ${
                    active ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2'
                  }`}
                >
                  <span>
                    <span className="block text-sm font-medium text-ink">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-ink-faint">{option.note}</span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-accent" />}
                </button>
              );
            })}
          </div>
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="privacy-settings-heading">
          <div className="flex items-center gap-2.5">
            <span className="rounded-md bg-surface-2 p-2 text-ink-soft"><ShieldCheck className="h-4 w-4" /></span>
            <h2 id="privacy-settings-heading" className="font-semibold text-ink">Privacy</h2>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 border-b border-line-soft pb-4">
            <div>
              <p className="text-sm font-medium text-ink">No-log / zero-retention providers only</p>
              <p className="mt-0.5 text-xs leading-5 text-ink-faint">On by default. Routes calls only to providers that do not retain or train on your data.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={values.no_log}
              aria-label="No-log providers"
              onClick={() => update('no_log', !values.no_log)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                values.no_log ? 'bg-accent' : 'border border-line bg-surface-2'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-card transition ${values.no_log ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="flex items-start gap-3 pt-4">
            <span className="rounded-md bg-surface-2 p-2 text-ink-soft"><LockKeyhole className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">OpenRouter key is a server secret</p>
              <p className="mt-1 text-xs leading-5 text-ink-soft">
                The API key lives only in the server function—it never reaches the browser and is never stored in your database. You do not paste it here.
              </p>
              <p className="mt-2 inline-flex max-w-full items-center rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-ink-faint">
                sk-or-•••• managed server-side · not editable
              </p>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-xs text-ink-faint" aria-live="polite">
            {formError && <p className="text-sm text-stage-rejected" role="alert">{formError}</p>}
            {formSuccess && <p className="flex items-center gap-1.5 text-sm text-stage-offer"><CheckCircle2 className="h-4 w-4" />{formSuccess}</p>}
            {!formError && !formSuccess && <p>Stored per-user under row-level security.</p>}
          </div>
          <Button type="submit" size="lg" disabled={saving}>
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </form>

      <section className="card p-5 sm:p-6" aria-labelledby="connection-heading">
        <div className="flex items-start gap-3">
          <span className="h-fit rounded-xl bg-surface-2 p-2 text-ink-soft"><Radio className="h-5 w-5" /></span>
          <div>
            <h2 id="connection-heading" className="font-semibold text-ink">Connection test</h2>
            <p className="mt-0.5 max-w-xl text-sm leading-6 text-ink-soft">
              Confirm streaming works end-to-end. The echo test sends nothing to any provider; the model
              ping makes one tiny real call to verify your key and routing (a few tokens).
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" disabled={streaming} onClick={() => runStream('echo')}>
            <Square className="h-4 w-4" /> Test streaming (free)
          </Button>
          <Button variant="secondary" disabled={streaming} onClick={onPingClick}>
            <Radio className="h-4 w-4" /> Ping the model (uses a few tokens)
          </Button>
          {streaming && (
            <Button variant="ghost" onClick={() => abortRef.current?.abort()}>Stop</Button>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-line-soft bg-surface-2 px-4 py-3">
          <div className="flex items-center justify-between">
            <Badge tone="eyebrow">Stream output</Badge>
            {streaming && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-accent" />}
          </div>
          <p className="mt-2 min-h-10 whitespace-pre-wrap text-sm leading-6 text-ink">
            {streamOutput || <span className="text-ink-faint">Output appears here, token by token.</span>}
          </p>
        </div>
        <div className="mt-2 min-h-5" aria-live="polite">
          {streamError && <p className="text-sm text-stage-rejected" role="alert">{streamError}</p>}
          {auditNote && <p className="text-sm text-ink-soft">{auditNote}</p>}
        </div>
      </section>

      <PreflightModal
        open={preflightOpen}
        targetLabel="OpenRouter"
        actionLabel="Ping the model"
        manifest={PING_MANIFEST}
        onApprove={approvePreflight}
        onCancel={() => setPreflightOpen(false)}
      />
    </div>
  );
}
