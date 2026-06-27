import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Keep installed-PWA browser chrome aligned with the design canvas in either theme.
const DARK_THEME_COLOR = '#0b1117';
const LIGHT_THEME_COLOR = '#fbfbfc';

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', t === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
}

// Theme system for the whole app (Wave H H6). The no-flash script in index.html has
// already applied the correct <html>.dark class synchronously before React mounts;
// we initialize from that class so there's no mismatch/flash and we don't re-read the
// system preference here. setTheme/toggleTheme update the class, persist the choice,
// sync the theme-color meta, and drive React state for any subscribed UI.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    try { localStorage.setItem('theme', t); } catch { /* storage unavailable — keep in-memory */ }
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
