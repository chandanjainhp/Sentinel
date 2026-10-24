import Link from 'next/link';
import { Lock } from 'lucide-react';

/**
 * 403 — access denied.
 *
 * Server component (no 'use client'). Uses the Night Watch design tokens
 * via Tailwind utilities referencing CSS variables (e.g. `bg-[var(--bg-base)]`)
 * — consistent with the rest of the app's auth/error surfaces.
 */
export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-base)] px-6 py-12 text-center">
      <div className="w-full max-w-md border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-8">
        {/* Glyph — locked padlock on a tinted surface */}
        <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center border border-[var(--sev-serious-dim)] bg-[var(--sev-serious-bg)] text-[var(--sev-serious)]">
          <Lock size={28} strokeWidth={1.5} aria-hidden="true" />
        </div>

        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--sev-serious)]">
          Error 403
        </p>
        <h1 className="mt-3 font-sans text-[24px] font-semibold leading-tight text-[var(--fg-1)]">
          Access denied
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--fg-3)]">
          You don&apos;t have permission to view this page. If you believe
          this is an error, contact your platform administrator.
        </p>

        {/* Actions */}
        <div className="mt-7 flex flex-col items-stretch gap-2">
          <Link
            href="/overview"
            className="inline-flex h-11 items-center justify-center gap-2 bg-[var(--accent)] px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--bg-base)] transition-opacity hover:opacity-85 focus-visible:outline-none"
          >
            Return to overview
          </Link>
          <a
            href="mailto:support@sentinel.io?subject=Access%20Request"
            className="inline-flex h-11 items-center justify-center gap-2 border border-[var(--border-strong)] px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--fg-2)] transition-colors hover:bg-[var(--bg-surface-2)] hover:text-[var(--fg-1)] focus-visible:outline-none"
          >
            Request access
          </a>
        </div>
      </div>
    </div>
  );
}
