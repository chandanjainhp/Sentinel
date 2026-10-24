'use client';

import Link from 'next/link';
import { AlertCircle, ArrowRight, Inbox, Search } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Shared empty state.
 *
 * Replaces the old Tailwind-based EmptyState that referenced broken
 * `text-severity-serious` classes. Uses CSS variables directly so it
 * works on the dark Night Watch palette out of the box.
 *
 * Props:
 *  - title:       string — required
 *  - description:  string — optional body text
 *  - icon:        'inbox' | 'search' | 'alert-circle' | custom ReactNode
 *  - action:      { label, href, onClick } — optional CTA
 *  - className:   string
 */
const ICONS = {
  inbox: Inbox,
  search: Search,
  'alert-circle': AlertCircle,
};

export default function EmptyState({
  title,
  description,
  icon = 'inbox',
  action,
  className,
}) {
  const IconComponent = typeof icon === 'string' ? ICONS[icon] : null;
  const iconNode = IconComponent ? (
    <IconComponent
      size={28}
      strokeWidth={1.25}
      className="text-[var(--fg-4)]"
      aria-hidden="true"
    />
  ) : (
    icon
  );

  return (
    <div
      role="status"
      className={cn(
        'flex w-full flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      {iconNode && <div className="mb-1">{iconNode}</div>}
      <p className="font-sans text-sm font-medium text-[var(--fg-2)]">
        {title}
      </p>
      {description && (
        <p className="max-w-xs text-xs leading-relaxed text-[var(--fg-3)]">
          {description}
        </p>
      )}
      {action && (
        <>
          {action.href ? (
            <Link
              href={action.href}
              className={cn(
                'mt-2 inline-flex h-9 items-center gap-2 px-4',
                'font-mono text-[10px] font-semibold uppercase tracking-[0.14em]',
                'border border-[var(--border-strong)] text-[var(--fg-2)]',
                'hover:bg-[var(--bg-surface-2)] hover:text-[var(--fg-1)]',
                'focus-visible:outline-none',
              )}
            >
              {action.label}
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className={cn(
                'mt-2 inline-flex h-9 items-center gap-2 px-4',
                'font-mono text-[10px] font-semibold uppercase tracking-[0.14em]',
                'border border-[var(--border-strong)] text-[var(--fg-2)]',
                'hover:bg-[var(--bg-surface-2)] hover:text-[var(--fg-1)]',
                'focus-visible:outline-none',
              )}
            >
              {action.label}
              <ArrowRight size={12} aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
