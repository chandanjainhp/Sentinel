'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * Shared form-field wrapper — label + control + error.
 *
 * Layout:
 *  ┌─────────────────────────────────┐
 *  │ LABEL (mono uppercase)           │
 *  │ [input passed as children]       │
 *  │ error text (red) when error set  │
 *  └─────────────────────────────────┘
 *
 * Accessibility:
 *  - label is real <label htmlFor> — clicking focuses the input
 *  - error message has role="alert" + aria-live
 *  - input should pass id + aria-describedby=`${id}-error`
 *
 * Props:
 *  - label:    string (required)
 *  - htmlFor:  string — pass same id as the input
 *  - error:    string — when set, label turns red + error renders
 *  - hint:     string — optional small helper text shown under input
 *  - required: boolean — adds asterisk + `required` to label
 */
export default function FormField({
  label,
  htmlFor,
  error,
  hint,
  required = false,
  children,
  className,
}) {
  const hintId = useId();
  const errorId = htmlFor ? `${htmlFor}-error` : useId();

  return (
    <div className={cn('flex flex-col gap-[7px]', className)}>
      <label
        htmlFor={htmlFor}
        className={cn(
          'font-mono text-[10px] font-semibold uppercase tracking-[0.12em]',
          error ? 'text-[var(--sev-serious)]' : 'text-[var(--fg-3)]',
        )}
      >
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-[var(--accent)]">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p
          id={hintId}
          className="font-mono text-[10px] leading-relaxed text-[var(--fg-4)]"
        >
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="font-mono text-[10px] text-[var(--sev-serious)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
