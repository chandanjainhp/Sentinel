'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Checkbox from '@radix-ui/react-checkbox';
import { toast } from 'sonner';
import { AlertTriangle, Check, Loader2, RefreshCw } from 'lucide-react';
import { rotateWebhookSecret } from '@/lib/api';
import { BTN_PRIMARY, BTN_SECONDARY, MONO, SANS, SPIN } from './webhookStyles';

/** Confirmation dialog for rotating the signing secret. */
export default function RotateSecretDialog({ onNewSecret }) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRotate = async () => {
    setLoading(true);
    try {
      const result = await rotateWebhookSecret();
      const secret = result?.secret ?? result;
      toast.success('Webhook secret rotated');
      setOpen(false);
      setConfirmed(false);
      onNewSecret(secret);
    } catch (err) {
      toast.error(err?.message || 'Failed to rotate secret');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmed(false); }}>
      <Dialog.Trigger asChild>
        <button style={BTN_SECONDARY}>
          <RefreshCw size={13} />
          Rotate Secret
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
        <Dialog.Content style={{
          position: 'fixed',
          zIndex: 50,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%',
          maxWidth: '480px',
          background: 'var(--bg-surface-1)',
          border: '1px solid var(--border-default)',
          borderRadius: '2px',
          padding: '24px',
          outline: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
            <div style={{
              padding: '8px',
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-hairline)',
              borderRadius: '2px',
              flexShrink: 0,
            }}>
              <AlertTriangle size={18} style={{ color: 'var(--sev-minor)' }} />
            </div>
            <div>
              <Dialog.Title style={{
                fontFamily: SANS,
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--fg-1)',
                margin: 0,
              }}>Rotate HMAC Secret</Dialog.Title>
              <Dialog.Description style={{
                fontFamily: SANS,
                fontSize: '13px',
                color: 'var(--fg-3)',
                marginTop: '4px',
              }}>
                A new secret will be generated. All existing webhook signatures will immediately become invalid.
              </Dialog.Description>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px',
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-hairline)',
              borderRadius: '2px',
              cursor: 'pointer',
              userSelect: 'none',
              marginBottom: '20px',
            }}
            onClick={() => setConfirmed((v) => !v)}
          >
            <Checkbox.Root
              checked={confirmed}
              onCheckedChange={setConfirmed}
              style={{
                width: '14px',
                height: '14px',
                marginTop: '2px',
                flexShrink: 0,
                border: '1px solid var(--border-strong)',
                borderRadius: '2px',
                background: confirmed ? 'var(--accent)' : 'var(--bg-base)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox.Indicator>
                <Check size={10} style={{ color: 'var(--bg-base)' }} />
              </Checkbox.Indicator>
            </Checkbox.Root>
            <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-2)' }}>
              I understand this will invalidate all existing signatures on every connected webhook consumer
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Dialog.Close asChild>
              <button style={BTN_SECONDARY}>Cancel</button>
            </Dialog.Close>
            <button
              disabled={!confirmed || loading}
              onClick={handleRotate}
              style={{
                ...BTN_PRIMARY,
                background: 'var(--sev-serious)',
                border: '1px solid var(--sev-serious)',
                opacity: (!confirmed || loading) ? 0.5 : 1,
                cursor: (!confirmed || loading) ? 'not-allowed' : 'pointer',
              }}
            >
              {loading && <Loader2 size={13} style={{ animation: SPIN }} />}
              Rotate Secret
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
