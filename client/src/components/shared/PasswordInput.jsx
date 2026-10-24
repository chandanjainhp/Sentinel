'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Shared password input with a consistent show/hide toggle.
 *
 * - Toggle is a real <button type="button"> with aria-label, so it works
 *   with screen readers + keyboard (Tab focuses it, Enter/Space toggles).
 * - The wrapped input keeps the consumer's id, autoComplete, value,
 *   onChange, aria-invalid, aria-describedby.
 * - error flag flips the input border to the severity-serious colour.
 *
 * Pass-through props: id, autoComplete, value, onChange, required,
 * placeholder, aria-invalid, aria-describedby, style (merged).
 */
export default function PasswordInput({
  id,
  error = false,
  className,
  ...inputProps
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative w-full">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        className={cn(
          'h-11 w-full px-[14px] pr-11',
          'bg-[var(--bg-surface-2)] text-[var(--fg-1)]',
          'font-mono text-[13px] tracking-[0.02em]',
          'border rounded-none transition-colors',
          'placeholder:text-[var(--fg-4)] placeholder:text-[12px]',
          'focus:outline-none focus:border-[var(--border-focus)]',
          'focus:shadow-[0_0_0_1px_var(--border-focus)]',
          error
            ? 'border-[var(--sev-serious-dim)] focus:border-[var(--sev-serious)] focus:shadow-[0_0_0_1px_var(--sev-serious)]'
            : 'border-[var(--border-default)]',
          className,
        )}
        {...inputProps}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className={cn(
          'absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center',
          'bg-transparent text-[var(--fg-4)]',
          'hover:text-[var(--fg-1)] focus-visible:outline-none',
        )}
      >
        {visible ? (
          <EyeOff size={14} aria-hidden="true" />
        ) : (
          <Eye size={14} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
