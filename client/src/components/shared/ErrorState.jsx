'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Shared error / retry state for failed data fetches.
 *
 * Props:
 *  - title:       string — default 'Something went wrong'
 *  - message:     string — human-readable error context. Defaults to the
 *                  raw error message if provided, otherwise a generic note.
 *  - error:       Error — optional; its `.message` is shown only if `message` is unset.
 *  - onRetry:     () => void — required for the Retry button.
 *  - retryLabel:  string — default 'Retry'
 *  - className:   string
 *
 * The error block uses role="alert" + aria-live="assertive" so screen readers
 * announce it immediately. The Retry button is a real <button> with a clear
 * accessible name.
 */
export default function ErrorState({
  title = 'Could not load this view',
  message,
  error,
  onRetry,
  retryLabel = 'Retry',
  className,
}) {
  const displayMessage =
    message ||
    (error?.message ? error.message : null) ||
    'An unexpected error occurred. Please try again.';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'flex w-full flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-10 w-10 items-center justify-center border border-[var(--sev-serious-dim)] bg-[var(--sev-serious-bg)] text-[var(--sev-serious)]"
      >
        <AlertCircle size={18} />
      </span>
      <p className="font-sans text-sm font-semibold text-[var(--fg-1)]">
        {title}
      </p>
      <p className="max-w-md font-mono text-[11px] leading-relaxed text-[var(--fg-3)] break-words">
        {displayMessage}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            'mt-2 inline-flex h-9 items-center gap-2 px-4',
            'font-mono text-[10px] font-semibold uppercase tracking-[0.14em]',
            'border border-[var(--sev-serious-dim)] text-[var(--sev-serious)]',
            'hover:bg-[var(--sev-serious-bg)] hover:opacity-85',
            'focus-visible:outline-none',
          )}
        >
          <RefreshCw size={12} aria-hidden="true" />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
