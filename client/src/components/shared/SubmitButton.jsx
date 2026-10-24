'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Shared submit button.
 *
 * Variants:
 *  - 'primary' (default) — Signal Amber background, dark text
 *  - 'secondary' — bordered, transparent, light text
 *  - 'danger' — red bg, red text (used inside ConfirmDialog)
 *
 * Loading state:
 *  - When `isLoading` is true, button is disabled, aria-busy is set, and a
 *    spinner replaces the children (or prepends if `loadingLabel` is set).
 *
 * Props:
 *  - isLoading:  boolean
 *  - loadingLabel: string — optional label shown next to the spinner
 *  - children:   ReactNode — the idle label
 */
export default function SubmitButton({
  isLoading = false,
  loadingLabel,
  children,
  variant = 'primary',
  className,
  ...rest
}) {
  const variantClasses = {
    primary:
      'border-transparent bg-[var(--accent)] text-[var(--bg-base)] hover:opacity-85',
    secondary:
      'border border-[var(--border-strong)] bg-transparent text-[var(--fg-2)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--fg-1)]',
    danger:
      'border border-[var(--sev-serious-dim)] bg-[var(--sev-serious-bg)] text-[var(--sev-serious)] hover:opacity-85',
  };

  return (
    <button
      type="submit"
      disabled={isLoading}
      aria-busy={isLoading}
      className={cn(
        'inline-flex h-[46px] w-full items-center justify-center gap-2',
        'font-mono text-[11px] font-semibold uppercase tracking-[0.12em]',
        'border transition-opacity focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-40',
        variantClasses[variant],
        className,
      )}
      {...rest}
    >
      {isLoading && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
      {isLoading ? loadingLabel || children : children}
    </button>
  );
}
