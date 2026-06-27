import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, LockKeyhole, Mail } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { safeNextPath } from '../../shared/domain/auth';
import { supabase } from '../../shared/lib/supabase';
import Brand from '../../shared/ui/Brand';
import ThemeToggle from '../../shared/ui/ThemeToggle';
import { useAuth } from './AuthProvider';

export default function SignInPage() {
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const navigate = useNavigate();
  const { status } = useAuth();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') navigate(next, { replace: true });
  }, [navigate, next, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const callback = new URL('/auth/callback', window.location.origin);
    callback.searchParams.set('next', next);
    const normalizedEmail = email.trim().toLowerCase();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: callback.toString(), shouldCreateUser: true },
    });

    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    setSentTo(normalizedEmail);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <ThemeToggle className="absolute right-5 top-5 inline-flex rounded-xl p-2 text-ink-faint transition hover:bg-surface-2 hover:text-ink" />
      <div className="w-full max-w-[380px] animate-rise">
        <div className="mb-7 text-center"><Brand /></div>
        <section className="card p-7">
          {sentTo ? (
            <div className="text-center" aria-live="polite">
              <CheckCircle2 className="mx-auto h-9 w-9 text-stage-offer" />
              <h1 className="mt-4 text-xl font-semibold">Check your inbox</h1>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                We sent a sign-in link to <strong className="font-medium text-ink">{sentTo}</strong>.
                It will return you here and open your tracker.
              </p>
              <button type="button" className="mt-5 text-sm font-medium text-accent hover:text-accent-strong" onClick={() => setSentTo(null)}>
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-center text-xl font-semibold">Sign in</h1>
              <p className="mb-6 mt-1 text-center text-sm text-ink-soft">We’ll email you a magic link. No passwords.</p>
              <form onSubmit={handleSubmit}>
                <label htmlFor="email" className="text-xs font-medium text-ink-soft">Email</label>
                <div className="relative mt-2">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                  <input id="email" name="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="input pl-10" />
                </div>
                {error && <p className="mt-3 text-sm text-stage-rejected" role="alert">{error}</p>}
                <button type="submit" disabled={submitting} className="mt-4 w-full rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white shadow-card transition hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60">
                  {submitting ? 'Sending…' : 'Email me a link'}
                </button>
              </form>
              <div className="mt-5 flex items-center gap-2 border-t border-line-soft pt-4 text-xs text-ink-faint">
                <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
                Row-level secured. Only you can read your data.
              </div>
            </>
          )}
        </section>
        <Link to="/" className="mx-auto mt-5 flex w-fit items-center gap-1.5 text-sm text-ink-faint transition hover:text-ink-soft">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to home
        </Link>
      </div>
    </main>
  );
}
