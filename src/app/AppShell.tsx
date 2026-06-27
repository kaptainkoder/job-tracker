import { useState } from 'react';
import { Briefcase, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Brand from '../shared/ui/Brand';
import ThemeToggle from '../shared/ui/ThemeToggle';
import { useAuth } from '../features/auth/AuthProvider';

const NAV = [
  { to: '/tracker', label: 'Tracker', Icon: Briefcase },
  { to: '/profile', label: 'Profile', Icon: UserRound },
  { to: '/privacy', label: 'Privacy', Icon: ShieldCheck },
];

export default function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleSignOut() {
    setSignOutError(null);
    try {
      await signOut();
      navigate('/', { replace: true });
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Could not sign out.');
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Brand compact />
          <nav className="flex items-center gap-1" aria-label="Application navigation">
            {NAV.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition ${isActive ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-surface-2 hover:text-ink'}`}>
                <Icon className="h-4 w-4" /><span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
            <ThemeToggle />
            <button type="button" onClick={handleSignOut} title={`Sign out${user?.email ? ` (${user.email})` : ''}`} className="inline-flex items-center gap-1.5 rounded-xl p-2 text-ink-faint transition hover:bg-surface-2 hover:text-ink sm:px-3">
              <LogOut className="h-4 w-4" /><span className="hidden text-sm sm:inline">Sign out</span>
            </button>
          </nav>
        </div>
        {signOutError && <p className="border-t border-line-soft bg-surface px-4 py-2 text-center text-xs text-stage-rejected" role="alert">{signOutError}</p>}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8"><Outlet /></main>
    </div>
  );
}
