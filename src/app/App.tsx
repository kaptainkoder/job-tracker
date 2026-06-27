import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { Briefcase, ShieldCheck, UserRound } from 'lucide-react';
import ThemeToggle from '../shared/ui/ThemeToggle';
import TrackerPage from '../features/tracker/TrackerPage';
import ProfilePage from '../features/profile/ProfilePage';
import PrivacyPage from '../features/privacy/PrivacyPage';

const NAV = [
  { to: '/', label: 'Tracker', Icon: Briefcase, end: true },
  { to: '/profile', label: 'Profile', Icon: UserRound, end: false },
  { to: '/privacy', label: 'Privacy', Icon: ShieldCheck, end: false },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen">
        <header className="sticky top-0 z-10 border-b border-accent-soft/40 bg-canvas/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <span className="font-semibold text-ink">Job Tracker</span>
            <nav className="flex items-center gap-1">
              {NAV.map(({ to, label, Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                      isActive
                        ? 'bg-accent-soft/60 text-accent'
                        : 'text-ink-soft hover:bg-accent-soft/30'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </NavLink>
              ))}
              <div className="ml-1">
                <ThemeToggle />
              </div>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-8">
          <Routes>
            <Route path="/" element={<TrackerPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
