import { useState } from 'react';
import { Briefcase, LogOut, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Brand from '../shared/ui/Brand';
import ThemeToggle from '../shared/ui/ThemeToggle';
import { useAuth } from '../features/auth/AuthProvider';

const NAV: Array<{ to: string; label: string; Icon: LucideIcon }> = [
  { to: '/tracker', label: 'Tracker', Icon: Briefcase },
  { to: '/profile', label: 'Profile', Icon: UserRound },
  { to: '/privacy', label: 'Privacy', Icon: ShieldCheck },
];

// Canonical app-shell (Claude Design): 212px left sidebar nav + fluid content capped at
// 1180px on desktop; a slim sticky top bar + a bottom tab bar on mobile. Near-monochrome:
// the single blue accent marks only the active nav item.
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
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-sidebar flex-col border-r border-line bg-surface px-3 py-5 md:flex">
        <div className="px-2">
          <Brand compact />
        </div>
        <nav className="mt-7 flex flex-1 flex-col gap-1" aria-label="Application navigation">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
                }`
              }
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-2 flex flex-col gap-1 border-t border-line-soft pt-3">
          <ThemeToggle
            withLabel
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-surface-2 hover:text-ink"
          />
          <button
            type="button"
            onClick={handleSignOut}
            title={user?.email ? `Sign out (${user.email})` : 'Sign out'}
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={2} /> Sign out
          </button>
          {signOutError && (
            <p className="px-3 text-xs text-stage-rejected" role="alert">
              {signOutError}
            </p>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-3 backdrop-blur md:hidden">
        <Brand compact />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            title={user?.email ? `Sign out (${user.email})` : 'Sign out'}
            className="inline-flex items-center justify-center rounded-md p-2 text-ink-faint transition hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="pb-24 md:pb-0 md:pl-sidebar">
        <div className="mx-auto max-w-content px-5 py-7 sm:px-8 sm:py-9">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-line bg-surface/95 backdrop-blur md:hidden"
        aria-label="Application navigation"
      >
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-2xs font-medium transition ${
                isActive ? 'text-accent' : 'text-ink-faint hover:text-ink-soft'
              }`
            }
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
