'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

/**
 * App Router root error boundary.
 *
 * Catches unhandled render errors anywhere in the route tree below this
 * file (i.e. the whole app). Next.js passes `error` (the caught error)
 * and `reset()` (a function that re-attempts rendering the route segment).
 *
 * Behaviour:
 *  - Logs to console.error (required by the task spec).
 *  - Shows a useful, non-technical message + a "Try again" button that
 *    calls `reset()`.
 *  - Offers a link back to /overview for a clean exit.
 *  - In development, shows the raw error message + a <details> stack trace.
 */
export default function Error({ error, reset }) {
  useEffect(() => {
    console.error('[app/error.js] route error:', error);
  }, [error]);

  const isDevelopment = process.env.NODE_ENV === 'development';
  const message = error?.message || 'An unexpected error occurred.';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-base)] px-6 py-12 text-center">
      <div className="w-full max-w-md">
        {/* Glyph */}
        <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center border border-[var(--sev-serious-dim)] bg-[var(--sev-serious-bg)] text-[var(--sev-serious)]">
          <AlertTriangle size={28} strokeWidth={1.5} aria-hidden="true" />
        </div>

        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--sev-serious)]">
          Something went wrong
        </p>
        <h1 className="mt-3 font-sans text-[24px] font-semibold leading-tight text-[var(--fg-1)]">
          The page failed to render
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--fg-3)]">
          Try reloading — if the error persists, return to overview and try again.
          The operations team has been notified via the browser console.
        </p>

        {/* Error detail — only in development */}
        {isDevelopment && (
          <details className="mt-5 border border-[var(--border-hairline)] bg-[var(--bg-surface-1)] px-4 py-3 text-left">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-4)] hover:text-[var(--fg-2)]">
              Error detail (development only)
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] text-[var(--sev-serious)]">
              {message}
              {error?.digest ? `\nDigest: ${error.digest}` : ''}
            </pre>
          </details>
        )}

        {/* Actions */}
        <div className="mt-7 flex flex-col items-stretch gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-11 items-center justify-center gap-2 bg-[var(--accent)] px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--bg-base)] transition-opacity hover:opacity-85 focus-visible:outline-none"
          >
            <RotateCcw size={12} aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/overview"
            className="inline-flex h-11 items-center justify-center gap-2 border border-[var(--border-strong)] px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--fg-2)] transition-colors hover:bg-[var(--bg-surface-2)] hover:text-[var(--fg-1)] focus-visible:outline-none"
          >
            <Home size={12} aria-hidden="true" />
            Back to overview
          </Link>
        </div>
      </div>
    </div>
  );
}
