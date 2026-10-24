'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Shared confirmation dialog for destructive / irreversible actions.
 *
 * Behaviour reference: the existing /settings/api-keys revoke flow (Radix
 * Dialog.Root + Portal + Overlay + Content). Same keyboard + screen-reader
 * semantics come for free from Radix.
 *
 * Props:
 *  - open:           boolean — controlled
 *  - onOpenChange:   (open) => void
 *  - title:          string — e.g. "Revoke 'gateway-prod'?"
 *  - description:    ReactNode — the consequences
 *  - resourceLabel:  optional ReactNode — chip shown above description
 *                    (e.g. an API key prefix)
 *  - confirmLabel:   string — default "Confirm"
 *  - cancelLabel:    string — default "Cancel"
 *  - tone:           'danger' | 'default' — controls confirm button colour
 *  - onConfirm:      () => void | Promise<void> — called on Confirm
 *  - isLoading:      boolean — disables both buttons + shows spinner
 *  - error:          optional string — shown above actions when set
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  resourceLabel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  isLoading = false,
  error,
}) {
  const isDanger = tone === 'danger';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        <Dialog.Content
          aria-labelledby="confirm-title"
          aria-describedby="confirm-desc"
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[440px]',
            '-translate-x-1/2 -translate-y-1/2',
            'bg-[var(--bg-surface-1)] border border-[var(--border-strong)]',
            'p-5 outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          {/* Close (X) — Radix also auto-closes on Escape */}
          <Dialog.Close
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center text-[var(--fg-4)] hover:text-[var(--fg-1)] focus-visible:outline-none"
          >
            <X size={14} aria-hidden="true" />
          </Dialog.Close>

          {/* Header — warning glyph for danger tone */}
          <div className="flex items-start gap-3 pr-8">
            {isDanger && (
              <span
                aria-hidden="true"
                className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--sev-serious-dim)] bg-[var(--sev-serious-bg)] text-[var(--sev-serious)]"
              >
                <AlertTriangle size={14} />
              </span>
            )}
            <div className="min-w-0">
              <Dialog.Title
                id="confirm-title"
                className="font-sans text-[15px] font-semibold leading-snug text-[var(--fg-1)]"
              >
                {title}
              </Dialog.Title>
              <Dialog.Description
                id="confirm-desc"
                className="mt-1 text-[13px] leading-relaxed text-[var(--fg-3)]"
              >
                {description}
              </Dialog.Description>
            </div>
          </div>

          {/* Optional resource chip — e.g. key prefix, machine name */}
          {resourceLabel && (
            <div className="mt-3 border border-[var(--border-hairline)] bg-[var(--bg-base)] px-3 py-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fg-4)]">
                Resource
              </div>
              <div className="mt-1 font-mono text-[11px] text-[var(--fg-2)] break-all">
                {resourceLabel}
              </div>
            </div>
          )}

          {/* Error feedback */}
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mt-3 flex items-start gap-2 border border-[var(--sev-serious-dim)] bg-[var(--sev-serious-bg)] px-3 py-2"
            >
              <span
                aria-hidden="true"
                className="mt-[3px] inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--sev-serious)]"
              />
              <span className="font-mono text-[11px] text-[var(--sev-serious)]">
                {error}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className={cn(
                'inline-flex h-9 items-center justify-center px-4',
                'font-mono text-[11px] font-semibold uppercase tracking-[0.12em]',
                'border border-[var(--border-strong)] bg-transparent',
                'text-[var(--fg-2)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--fg-1)]',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'focus-visible:outline-none',
              )}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              aria-busy={isLoading}
              className={cn(
                'inline-flex h-9 items-center justify-center gap-2 px-4',
                'font-mono text-[11px] font-semibold uppercase tracking-[0.12em]',
                'border transition-opacity disabled:cursor-not-allowed disabled:opacity-50',
                'focus-visible:outline-none',
                isDanger
                  ? 'border-[var(--sev-serious-dim)] bg-[var(--sev-serious-bg)] text-[var(--sev-serious)] hover:opacity-85'
                  : 'border-transparent bg-[var(--accent)] text-[var(--bg-base)] hover:opacity-85',
              )}
            >
              {isLoading && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
