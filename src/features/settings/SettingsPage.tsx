import {
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  Radio,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Square,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { UserSettings } from '../../shared/types';
import { supabase } from '../../shared/lib/supabase';
import { streamLlm } from '../../shared/lib/llmClient';
import Badge from '../../shared/ui/Badge';
import Button from '../../shared/ui/Button';
import { useAuth } from '../auth/AuthProvider';
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
  const abortRef = useRef<AbortController | null>(null);

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

  const activeModel = MODEL_OPTIONS.find((option) => option.value === values.model);

  return (
    <div className="animate-rise max-w-reading space-y-6">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-accent">Tailoring engine</p>
        <h1 className="mt-1 text-h1 font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm leading-6 text-ink-soft">
          Choose the model that writes your tailored documents and how its provider handles your data.
        </p>
      </div>

      <form onSubmit={handleSave} className="card overflow-hidden">
        <div className="flex items-start gap-3 border-b border-line-soft px-5 py-4 sm:px-6">
          <span className="rounded-xl bg-accent-soft p-2 text-accent"><SlidersHorizontal className="h-5 w-5" /></span>
          <div>
            <h2 className="font-semibold text-ink">Language model</h2>
            <p className="mt-0.5 text-sm text-ink-soft">Used for tailored resumes, cover letters, and prep.</p>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <label htmlFor="model" className="text-xs font-medium text-ink-soft">Model</label>
          <select
            id="model"
            className="input mt-2"
            value={values.model}
            onChange={(event) => update('model', event.target.value)}
          >
            {MODEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {activeModel && <p className="mt-1.5 text-xs text-ink-faint">{activeModel.note}</p>}

          <p className="mt-4 flex items-start gap-2 rounded-xl border border-line-soft bg-surface-2 px-4 py-3 text-xs leading-5 text-ink-soft">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
            <span>
              Your OpenRouter key is stored as a server secret and never reaches this browser. The model
              choice above is the only part you control here.
            </span>
          </p>
        </div>

        <div className="flex items-start gap-3 border-y border-line-soft px-5 py-4 sm:px-6">
          <span className="rounded-xl bg-surface-2 p-2 text-ink-soft"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <h2 className="font-semibold text-ink">Provider privacy</h2>
            <p className="mt-0.5 text-sm text-ink-soft">Route only to providers that don’t retain your data.</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
          <div>
            <p className="text-sm font-medium text-ink">No-log / zero-retention providers</p>
            <p className="mt-0.5 text-xs text-ink-faint">On by default. Requests deny provider data collection.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={values.no_log}
            aria-label="No-log providers"
            onClick={() => update('no_log', !values.no_log)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              values.no_log ? 'bg-accent' : 'bg-surface-2 border border-line'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-card transition ${
                values.no_log ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="flex flex-col gap-3 border-t border-line-soft bg-surface-2/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-h-5" aria-live="polite">
            {formError && <p className="text-sm text-stage-rejected" role="alert">{formError}</p>}
            {formSuccess && <p className="flex items-center gap-1.5 text-sm text-stage-offer"><CheckCircle2 className="h-4 w-4" />{formSuccess}</p>}
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
          <Button variant="secondary" disabled={streaming} onClick={() => runStream('ping')}>
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
        </div>
      </section>
    </div>
  );
}
