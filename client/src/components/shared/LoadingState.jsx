'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Skeleton / spinner loading state.
 *
 * Variants:
 *  - variant="spinner" (default for short loads) — spinner + label
 *  - variant="skeleton" — n shimmering rectangles, ideal for tables/lists
 *  - variant="block" — full-viewport centered block (page-level)
 *
 * All variants respect prefers-reduced-motion (tw-animate-css ships the
 * `animate-pulse` rule that gracefully degrades).
 */
export default function LoadingState({
  variant = 'spinner',
  label = 'Loading…',
  rows = 4,
  className,
  'aria-live': ariaLive = 'polite',
  ...rest
}) {
  if (variant === 'skeleton') {
    return (
      <div
        role="status"
        aria-live={ariaLive}
        aria-label={label}
        className={cn('flex w-full flex-col gap-2 py-3', className)}
        {...rest}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-full animate-pulse bg-[var(--bg-surface-2)]"
            aria-hidden="true"
          />
        ))}
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (variant === 'block') {
    return (
      <div
        role="status"
        aria-live={ariaLive}
        aria-label={label}
        className={cn(
          'flex min-h-[60vh] w-full items-center justify-center',
          'flex-col gap-3 text-center',
          className,
        )}
        {...rest}
      >
        <Loader2
          size={20}
          className="animate-spin text-[var(--accent)]"
          aria-hidden="true"
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--fg-4)]">
          {label}
        </span>
      </div>
    );
  }

  // default: inline spinner + label
  return (
    <div
      role="status"
      aria-live={ariaLive}
      className={cn(
        'flex items-center justify-center gap-2 py-6',
        'font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--fg-3)]',
        className,
      )}
      {...rest}
    >
      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
