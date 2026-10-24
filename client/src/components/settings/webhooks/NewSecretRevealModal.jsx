'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Checkbox from '@radix-ui/react-checkbox';
import { Check, Copy, KeyRound } from 'lucide-react';
import { BTN_PRIMARY, BTN_SECONDARY, MONO, SANS, copyToClipboard } from './webhookStyles';

/** Shows a freshly rotated secret exactly once, with a copy-acknowledge gate. */
export default function NewSecretRevealModal({ secret, onClose }) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const handleCopy = () => {
    copyToClipboard(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog.Root open={!!secret} onOpenChange={(open) => { if (!open && acknowledged) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
        <Dialog.Content style={{
          position: 'fixed',
          zIndex: 50,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%',
          maxWidth: '560px',
          background: 'var(--bg-surface-1)',
          border: '1px solid var(--border-default)',
          borderRadius: '2px',
          padding: '24px',
          outline: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{
              padding: '8px',
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-hairline)',
              borderRadius: '2px',
            }}>
              <KeyRound size={18} style={{ color: 'var(--sev-minor)' }} />
            </div>
            <Dialog.Title style={{
              fontFamily: SANS,
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--fg-1)',
              margin: 0,
            }}>New HMAC Secret</Dialog.Title>
          </div>

          <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-3)', marginBottom: '16px' }}>
            Copy this secret now. It will not be shown again. Store it securely and update all webhook consumers.
          </p>

          <div style={{
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border-default)',
            borderRadius: '2px',
            padding: '14px',
            marginBottom: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <code style={{
                fontFamily: MONO,
                fontSize: '12px',
                color: 'var(--fg-1)',
                wordBreak: 'break-all',
                flex: 1,
              }}>{secret}</code>
              <button
                onClick={handleCopy}
                style={{ ...BTN_SECONDARY, flexShrink: 0, padding: '6px 10px', fontSize: '11px', fontFamily: MONO }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px',
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-hairline)',
              borderRadius: '2px',
              cursor: 'pointer',
              userSelect: 'none',
              marginBottom: '20px',
            }}
            onClick={() => setAcknowledged((v) => !v)}
          >
            <Checkbox.Root
              checked={acknowledged}
              onCheckedChange={setAcknowledged}
              style={{
                width: '14px',
                height: '14px',
                flexShrink: 0,
                border: '1px solid var(--border-strong)',
                borderRadius: '2px',
                background: acknowledged ? 'var(--accent)' : 'var(--bg-base)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox.Indicator>
                <Check size={10} style={{ color: 'var(--bg-base)' }} />
              </Checkbox.Indicator>
            </Checkbox.Root>
            <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-2)' }}>
              I have copied the secret to a secure location
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              disabled={!acknowledged}
              onClick={onClose}
              style={{
                ...BTN_PRIMARY,
                opacity: !acknowledged ? 0.5 : 1,
                cursor: !acknowledged ? 'not-allowed' : 'pointer',
              }}
            >
              Done
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
