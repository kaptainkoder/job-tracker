import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';

// Reusable theme toggle (Wave H H6). Used in the app shell, the Settings appearance
// row, and the landing page. Defaults to a compact icon button; pass `size` to nudge
// the icon. It carries an aria-label that names the action and is keyboard-operable
// as a native <button>.
export default function ThemeToggle({
  className = '',
  size = 16,
  withLabel = false,
}: {
  className?: string;
  size?: number;
  // When true, also render a text label next to the icon (used in the sidebar row).
  withLabel?: boolean;
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Light mode' : 'Dark mode';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={
        className ||
        'inline-flex items-center justify-center rounded-lg p-2 text-ink-faint transition hover:bg-accent-soft/40 hover:text-ink-soft'
      }
    >
      {isDark ? <Sun size={size} /> : <Moon size={size} />}
      {withLabel && <span>{label}</span>}
    </button>
  );
}
