import type { ButtonHTMLAttributes } from 'react';

// Canonical Button (Claude Design): one blue accent marks every primary action; secondary
// is a quiet bordered surface; ghost is chromeless; danger is the only other solid fill
// (destructive confirm). Radius 9 (rounded-md), heights 28/34/40 for sm/md/lg.
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white shadow-card hover:bg-accent-strong',
  secondary:
    'border border-line bg-surface text-ink-soft hover:bg-surface-2 hover:text-ink',
  ghost: 'text-ink-soft hover:bg-surface-2 hover:text-ink',
  danger: 'bg-stage-rejected text-white hover:opacity-90',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 gap-1.5 px-2.5 text-xs',
  md: 'h-[2.125rem] gap-2 px-3.5 text-sm',
  lg: 'h-10 gap-2 px-5 text-sm',
};

const BASE =
  'inline-flex items-center justify-center rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-60';

/** Shared class string so react-router <Link>/<a> CTAs match the Button look exactly. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra = '',
): string {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]} ${extra}`.trim();
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    // eslint-disable-next-line react/button-has-type
    <button type={type} className={buttonClasses(variant, size, className)} {...props} />
  );
}
