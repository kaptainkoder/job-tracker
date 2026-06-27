import type { Config } from 'tailwindcss';

// Dark mode is opt-in via a `dark` class on <html> (set by the no-flash script in
// index.html + the ThemeProvider). Semantic tokens resolve through CSS variables in
// src/app/index.css (:root = light, .dark = dark), so every /40 /20 opacity modifier
// keeps working. `stage` tokens are job-application pipeline stages.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
          muted: 'rgb(var(--accent-muted) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          soft: 'rgb(var(--ink-soft) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)',
        },
        stage: {
          lead: 'rgb(var(--stage-lead) / <alpha-value>)',
          applied: 'rgb(var(--stage-applied) / <alpha-value>)',
          interviewing: 'rgb(var(--stage-interviewing) / <alpha-value>)',
          offer: 'rgb(var(--stage-offer) / <alpha-value>)',
          rejected: 'rgb(var(--stage-rejected) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(14, 47, 77, 0.06), 0 1px 2px rgba(14, 47, 77, 0.04)',
        cardHover: '0 4px 14px rgba(14, 47, 77, 0.10)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        rise: 'rise 0.5s ease-out both',
      },
    },
  },
  plugins: [],
} satisfies Config;
