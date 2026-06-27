import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export default function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas" role="status">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
        <span className="sr-only">Checking your session</span>
      </div>
    );
  }

  if (status === 'anonymous') {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/sign-in?next=${encodeURIComponent(next)}`} replace />;
  }

  return <Outlet />;
}
