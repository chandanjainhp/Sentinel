import Link from 'next/link';
import { ArrowRight, Compass } from 'lucide-react';

/**
 * 404 — unknown URL.
 *
 * Server component (no 'use client' needed — pure presentation + Link).
 * Uses the Night Watch design tokens directly so it renders with the dark
 * theme even before any client JS hydrates.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-base)] px-6 py-12 text-center">
      <div className="w-full max-w-md">
        {/* Glyph */}
        <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center border border-[var(--border-strong)] bg-[var(--bg-surface-1)] text-[var(--accent)]">
          <Compass size={28} strokeWidth={1.5} aria-hidden="true" />
        </div>

        {/* 404 — display caps */}
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Error 404
        </p>
        <h1 className="mt-3 font-sans text-[28px] font-semibold leading-tight text-[var(--fg-1)]">
          Page not found
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--fg-3)]">
          The page you tried to reach doesn&apos;t exist, or may have moved.
          Return to operations overview to get back on track.
        </p>

        {/* CTA */}
        <div className="mt-7 flex flex-col items-stretch gap-2">
          <Link
            href="/overview"
            className="inline-flex h-11 items-center justify-center gap-2 bg-[var(--accent)] px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--bg-base)] transition-opacity hover:opacity-85 focus-visible:outline-none"
          >
            Back to overview
            <ArrowRight size={12} aria-hidden="true" />
          </Link>
          <Link
            href="/docs"
            className="inline-flex h-11 items-center justify-center gap-2 border border-[var(--border-strong)] px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--fg-2)] transition-colors hover:bg-[var(--bg-surface-2)] hover:text-[var(--fg-1)] focus-visible:outline-none"
          >
            Read the docs
          </Link>
        </div>
      </div>
    </div>
  );
}
