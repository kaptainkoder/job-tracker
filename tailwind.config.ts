import type { Config } from 'tailwindcss';

// Canonical Claude Design token system. Dark mode is opt-in via a `dark` class on <html>
// (set by the no-flash script in index.html + the ThemeProvider). Semantic colors resolve
// through `--ds-*` CSS variables in src/app/index.css (:root = light, .dark = dark), so
// every /40 /20 opacity modifier keeps working. The non-color scales below (typography,
// spacing, radii, two shadow tiers, motion) are the design's documented values.
// `stage` tokens are job-application pipeline stages — dots / tint-pills only.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--ds-canvas) / <alpha-value>)',
        surface: 'rgb(var(--ds-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--ds-surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--ds-surface-3) / <alpha-value>)',
        line: {
          DEFAULT: 'rgb(var(--ds-border) / <alpha-value>)',
          soft: 'rgb(var(--ds-border-soft) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--ds-accent) / <alpha-value>)',
          strong: 'rgb(var(--ds-accent-strong) / <alpha-value>)',
          soft: 'rgb(var(--ds-accent-soft) / <alpha-value>)',
          muted: 'rgb(var(--ds-accent-muted) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ds-ink) / <alpha-value>)',
          soft: 'rgb(var(--ds-ink-soft) / <alpha-value>)',
          faint: 'rgb(var(--ds-ink-faint) / <alpha-value>)',
        },
        stage: {
          lead: 'rgb(var(--ds-stage-lead) / <alpha-value>)',
          applied: 'rgb(var(--ds-stage-applied) / <alpha-value>)',
          interviewing: 'rgb(var(--ds-stage-interviewing) / <alpha-value>)',
          offer: 'rgb(var(--ds-stage-offer) / <alpha-value>)',
          rejected: 'rgb(var(--ds-stage-rejected) / <alpha-value>)',
        },
      },
      fontFamily: {
        // Inter only (mono reserved for privacy-log hashes/key fragments).
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        // Design type scale (added alongside Tailwind's base/sm/xs, which the app already
        // uses: sm=14 == the design's body size). Headings carry tight tracking.
        display: ['3.25rem', { lineHeight: '1.06', letterSpacing: '-0.03em' }],
        stat: ['1.625rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        h1: ['1.375rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        h2: ['1.1875rem', { lineHeight: '1.25', letterSpacing: '-0.01em' }],
        h3: ['1rem', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        '2xs': ['0.6875rem', { lineHeight: '1.4' }],
        micro: ['0.65625rem', { lineHeight: '1.3' }],
      },
      spacing: {
        // 212px sidebar (the desktop app-shell nav rail).
        sidebar: '13.25rem',
      },
      maxWidth: {
        content: '1180px', // fluid content cap
        reading: '760px', // long-form / single-column reading width
      },
      boxShadow: {
        // Two shadow tiers only: card (resting) + pop (raised: modals, sticky dock).
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        cardHover: '0 4px 14px rgba(15, 23, 42, 0.10)',
        pop: '0 12px 32px rgba(15, 23, 42, 0.14)',
        panel: '0 12px 32px rgba(15, 23, 42, 0.14)', // alias of pop
      },
      borderRadius: {
        // Design radii: sm 7 / md 9 / lg 11 / xl 13 / 2xl 16 / full pill.
        sm: '0.4375rem',
        md: '0.5625rem',
        lg: '0.6875rem',
        xl: '0.8125rem',
        '2xl': '1rem',
      },
      keyframes: {
        // Fade-only motion; translate is tiny and degrades to fully-visible.
        rise: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        rise: 'rise 0.18s ease-out both',
        fade: 'fade 0.16s ease-out both',
      },
    },
  },
  plugins: [],
} satisfies Config;
