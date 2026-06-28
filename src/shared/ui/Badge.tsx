import type { ReactNode } from 'react';

// Canonical Badge (Claude Design). Three tones only:
//  - neutral: quiet surface chip (counts, meta)
//  - accent:  the one blue, for an active/selected marker
//  - eyebrow: letter-spaced uppercase micro-label (section eyebrows, SENT/WITHHELD manifest
//             headers in the privacy log) — no fill, just tinted text.
export type BadgeTone = 'neutral' | 'accent' | 'eyebrow';

const TONE: Record<BadgeTone, string> = {
  neutral: 'inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-ink-soft',
  accent: 'inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent',
  eyebrow: 'inline-flex items-center text-2xs font-semibold uppercase tracking-[0.16em] text-ink-faint',
};

export default function Badge({
  tone = 'neutral',
  className = '',
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={`${TONE[tone]} ${className}`.trim()}>{children}</span>;
}
