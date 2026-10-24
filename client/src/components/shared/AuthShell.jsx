'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Shared layout for /login, /register, /forgot-password, /reset-password.
 *
 * Two-column on desktop (360px context aside + flexible form main), single
 * column on tablet/mobile (the aside hides below 768px — same breakpoint as
 * the original /login page's media query).
 *
 * The left aside is purely decorative context — same brand lockup + "How It
 * Works" block. Pass `asideChildren` to override per-page.
 *
 * The right main is a centered 380px column.
 */
export default function AuthShell({
  children,
  asideChildren,
  footerChildren,
}) {
  return (
    <div className="flex min-h-screen bg-[var(--bg-base)]">
      {/* LEFT CONTEXT PANEL */}
      <aside
        aria-hidden="false"
        className={cn(
          'relative hidden w-[360px] shrink-0 flex-col overflow-hidden',
          'border-r border-[var(--border-default)] bg-[var(--bg-surface-1)] p-10',
          // Hide the aside at tablet (768px) — there isn't enough room for
          // 360px aside + 380px form panel. Show only at lg (1024px)+.
          'lg:flex',
        )}
      >
        {/* Dot grid texture */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(35,43,56,0.7) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* Bottom gradient fade */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-[120px] z-[2]"
          style={{
            background:
              'linear-gradient(to bottom, transparent, var(--bg-surface-1))',
          }}
        />
        <div className="relative z-[1] flex flex-1 flex-col">
          {asideChildren}
        </div>
      </aside>

      {/* RIGHT FORM PANEL */}
      <main className="flex flex-1 items-center justify-center p-6 md:min-h-screen md:p-10">
        <div className="w-full max-w-[380px]">
          {children}
          {footerChildren && (
            <div className="mt-7 border-t border-[var(--border-hairline)] pt-5">
              {footerChildren}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * Shared alert/banner shown above auth forms.
 *
 * Tones:
 *  - 'error'    — red, for credentials / server errors
 *  - 'warning'  — amber, for disabled account / suspended org
 *  - 'success'  — green, for "redirecting…" states
 *
 * Accessibility: role="alert" + aria-live="polite" so screen readers announce.
 */
export function AuthAlert({ tone = 'error', children }) {
  const toneClasses = {
    error:
      'border-[var(--sev-serious-dim)] bg-[var(--sev-serious-bg)] text-[var(--sev-serious)]',
    warning:
      'border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.08)] text-[#f59e0b]',
    success:
      'border-[var(--sev-harmless-dim)] bg-[var(--sev-harmless-bg)] text-[var(--success-text,var(--sev-harmless))]',
  };
  const dotColor = {
    error: 'bg-[var(--sev-serious)]',
    warning: 'bg-[#f59e0b]',
    success: 'bg-[var(--sev-harmless)]',
  }[tone];

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'mb-5 flex items-start gap-2 px-[14px] py-[10px] border',
        toneClasses[tone],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-[4px] inline-block h-[5px] w-[5px] shrink-0 rounded-full',
          dotColor,
        )}
      />
      <span className="font-mono text-[11px] leading-relaxed">
        {children}
      </span>
    </div>
  );
}

/**
 * Shared footer link row (small uppercase mono).
 */
export function AuthFooterLink({ href, children }) {
  return (
    <Link
      href={href}
      className={cn(
        'font-mono text-[10px] tracking-[0.06em] text-[var(--fg-3)]',
        'hover:text-[var(--fg-1)] focus-visible:outline-none',
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Shared divider with "OR" label between primary submit + alt auth.
 */
export function OrDivider() {
  return (
    <div className="my-[22px] flex items-center gap-3">
      <div className="h-px flex-1 bg-[var(--border-hairline)]" />
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-4)]">
        or
      </span>
      <div className="h-px flex-1 bg-[var(--border-hairline)]" />
    </div>
  );
}
