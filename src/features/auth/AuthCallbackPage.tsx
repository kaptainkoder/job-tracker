import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { safeNextPath } from '../../shared/domain/auth';
import Brand from '../../shared/ui/Brand';
import { useAuth } from './AuthProvider';

export default function AuthCallbackPage() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNextPath(params.get('next'));
  const [timedOut, setTimedOut] = useState(false);
  const providerError = useMemo(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    return hash.get('error_description') ?? params.get('error_description');
  }, [params]);

  useEffect(() => {
    if (status === 'authenticated') navigate(next, { replace: true });
  }, [navigate, next, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);

  const failed = Boolean(providerError) || (status === 'anonymous' && timedOut);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="card w-full max-w-sm p-7 text-center">
        <Brand />
        {failed ? (
          <>
            <h1 className="mt-6 text-lg font-semibold">That link didn’t work</h1>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{providerError ?? 'The link may have expired or already been used.'}</p>
            <Link to={`/sign-in?next=${encodeURIComponent(next)}`} className="mt-5 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-strong">Send a fresh link</Link>
          </>
        ) : (
          <>
            <span className="mx-auto mt-6 block h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
            <h1 className="mt-4 text-lg font-semibold">Signing you in…</h1>
            <p className="mt-1 text-sm text-ink-soft">Verifying your magic link.</p>
          </>
        )}
      </div>
    </main>
  );
}
