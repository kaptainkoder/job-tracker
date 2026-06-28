import type { InputHTMLAttributes, ReactNode } from 'react';

// Canonical Input (Claude Design): label + optional honesty helper (calm ink-faint copy
// that states a truthful default, e.g. "Leave blank if unspecified") + inline error that
// recolors the border. Optional leading icon for the email/search style.
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  error?: string;
  /** Calm helper line under the field — used for honesty notes; hidden when there's an error. */
  helper?: string;
  icon?: ReactNode;
}

export default function Input({
  label,
  id,
  error,
  helper,
  icon,
  className = '',
  ...props
}: InputProps) {
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-ink-soft">
        {label}
      </label>
      <div className="relative mt-2">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
            {icon}
          </span>
        )}
        <input
          {...props}
          id={id}
          className={`input ${icon ? 'pl-10' : ''} ${
            error ? 'border-stage-rejected focus:border-stage-rejected focus-visible:ring-stage-rejected' : ''
          } ${className}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : helper ? helperId : undefined}
        />
      </div>
      {error ? (
        <span id={errorId} className="mt-1.5 block text-xs text-stage-rejected">
          {error}
        </span>
      ) : helper ? (
        <span id={helperId} className="mt-1.5 block text-xs text-ink-faint">
          {helper}
        </span>
      ) : null}
    </div>
  );
}
