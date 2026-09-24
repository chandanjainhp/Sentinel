'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import * as Checkbox from '@radix-ui/react-checkbox';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  Key, Copy, Check, Loader2, AlertTriangle, X, Plus, Ban,
} from 'lucide-react';
import {
  getApiKeyMeta,
  createUserApiKey,
  revokeUserApiKey,
} from '@/lib/api';

const MONO = 'var(--font-mono)';
const SANS = 'var(--font-sans)';

const PRIMARY_BTN = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  background: 'var(--accent)',
  color: 'var(--bg-base)',
  border: '1px solid var(--accent)',
  borderRadius: '2px',
  fontFamily: MONO,
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  cursor: 'pointer',
};

const SECONDARY_BTN = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  background: 'transparent',
  color: 'var(--fg-2)',
  border: '1px solid var(--border-default)',
  borderRadius: '2px',
  fontFamily: MONO,
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  cursor: 'pointer',
};

const DANGER_BTN = {
  ...SECONDARY_BTN,
  color: 'var(--sev-serious)',
  borderColor: 'var(--sev-serious)',
};

function RevealSecretModal({ open, secret, onClose }) {
  const [copied, setCopied] = useState(false);
  const [acked, setAcked] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(secret).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function close() {
    if (!acked) return;
    setAcked(false);
    setCopied(false);
    onClose();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
        <Dialog.Content style={{
          position: 'fixed', zIndex: 50, top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)', width: '100%', maxWidth: '520px',
          background: 'var(--bg-surface-1)', border: '1px solid var(--border-strong)',
          borderRadius: '2px', outline: 'none',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', borderBottom: '1px solid var(--border-default)',
          }}>
            <Dialog.Title style={{
              margin: 0, fontFamily: MONO, fontSize: '11px', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-1)',
            }}>
              Your new API key
            </Dialog.Title>
            <button type="button" onClick={close} disabled={!acked} style={{
              background: 'none', border: 'none', color: 'var(--fg-3)',
              cursor: acked ? 'pointer' : 'not-allowed', opacity: acked ? 1 : 0.3,
              padding: 0, display: 'flex',
            }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              padding: '12px 14px', background: 'var(--bg-surface-2)',
              border: '1px solid var(--sev-minor)', borderRadius: '2px',
            }}>
              <AlertTriangle size={16} style={{ color: 'var(--sev-minor)', flexShrink: 0 }} />
              <p style={{ margin: 0, fontFamily: SANS, fontSize: '12px', color: 'var(--sev-minor)' }}>
                This secret will never be shown again. Copy it now and configure your gateways with
                {' '}<code style={{ fontFamily: MONO, fontSize: '11px' }}>Authorization: Bearer &lt;key&gt;</code>.
              </p>
            </div>

            <div style={{
              borderRadius: '2px', border: '1px solid var(--border-default)',
              background: 'var(--bg-surface-2)', padding: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <code style={{
                  flex: 1, fontFamily: MONO, fontSize: '12px',
                  color: 'var(--fg-1)', wordBreak: 'break-all',
                }}>
                  {secret}
                </code>
                <button type="button" onClick={handleCopy} style={{ ...SECONDARY_BTN, flexShrink: 0, padding: '5px 10px', fontSize: '10px' }}>
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div style={{
              padding: '10px 12px', background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-hairline)', borderRadius: '2px',
            }}>
              <div style={{
                fontFamily: MONO, fontSize: '10px', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                color: 'var(--fg-3)', marginBottom: '6px',
              }}>
                Gateway config
              </div>
              <code style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--fg-2)', wordBreak: 'break-all' }}>
                POST /api/v1/events{'\n'}Authorization: Bearer {secret.slice(0, 16)}…
              </code>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <Checkbox.Root
                checked={acked}
                onCheckedChange={setAcked}
                style={{
                  width: '14px', height: '14px', border: '1px solid var(--border-strong)',
                  borderRadius: '2px', background: 'var(--bg-surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Checkbox.Indicator>
                  <Check size={10} style={{ color: 'var(--accent)' }} />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-2)' }}>
                I have copied the secret and will configure my gateways
              </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={close}
                disabled={!acked}
                style={{
                  ...PRIMARY_BTN,
                  opacity: acked ? 1 : 0.4,
                  cursor: acked ? 'pointer' : 'not-allowed',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function ApiKeyPage() {
  const queryClient = useQueryClient();
  const [revealSecret, setRevealSecret] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const { data: key, isLoading } = useQuery({
    queryKey: ['api-key'],
    queryFn: getApiKeyMeta,
  });

  const createMutation = useMutation({
    mutationFn: createUserApiKey,
    onSuccess: (result) => {
      const secret = result?.secret;
      if (!secret) {
        toast.error('Key created but secret was not returned');
        return;
      }
      setRevealSecret(secret);
      queryClient.invalidateQueries({ queryKey: ['api-key'] });
      toast.success('API key created');
    },
    onError: (err) => toast.error(err?.message ?? 'Failed to create API key'),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeUserApiKey,
    onSuccess: () => {
      setConfirmRevoke(false);
      queryClient.invalidateQueries({ queryKey: ['api-key'] });
      toast.success('API key revoked');
    },
    onError: (err) => toast.error(err?.message ?? 'Failed to revoke API key'),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <h1 style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          fontFamily: SANS, fontSize: '18px', fontWeight: 600,
          color: 'var(--fg-1)', margin: 0,
        }}>
          <Key size={16} style={{ color: 'var(--accent)' }} />
          API Key
        </h1>
        <p style={{
          marginTop: '6px', marginBottom: 0, fontFamily: SANS,
          fontSize: '12px', color: 'var(--fg-3)',
        }}>
          One key authenticates all your gateways. Use{' '}
          <code style={{ fontFamily: MONO, fontSize: '11px' }}>Authorization: Bearer &lt;key&gt;</code>
          {' '}on <code style={{ fontFamily: MONO, fontSize: '11px' }}>POST /api/v1/events</code>.
          Generating a new key replaces the old one immediately.
        </p>
      </div>

      <section style={{
        background: 'var(--bg-surface-1)',
        border: '1px solid var(--border-default)',
        borderRadius: '2px',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-hairline)',
          background: 'var(--bg-surface-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{
            margin: 0, fontFamily: MONO, fontSize: '10px', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-2)',
          }}>
            Current key
          </h2>
          {key ? (
            <button type="button" onClick={() => setConfirmRevoke(true)} style={{ ...DANGER_BTN, padding: '5px 10px', fontSize: '10px' }}>
              <Ban size={11} />
              Revoke
            </button>
          ) : (
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              style={{ ...PRIMARY_BTN, padding: '5px 10px', fontSize: '10px' }}
            >
              {createMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Generate key
            </button>
          )}
        </div>

        {isLoading ? (
          <div style={{
            padding: '24px 16px', display: 'flex', alignItems: 'center', gap: '8px',
            color: 'var(--fg-3)', fontFamily: MONO, fontSize: '11px',
          }}>
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : key ? (
          <div style={{ padding: '16px', display: 'flex', flexWrap: 'wrap', gap: '32px' }}>
            <div>
              <div style={{
                fontFamily: MONO, fontSize: '10px', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                color: 'var(--fg-3)', marginBottom: '4px',
              }}>
                Prefix
              </div>
              <span style={{ fontFamily: MONO, fontSize: '13px', color: 'var(--fg-1)' }}>
                {key.keyPrefix}…
              </span>
            </div>
            <div>
              <div style={{
                fontFamily: MONO, fontSize: '10px', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                color: 'var(--fg-3)', marginBottom: '4px',
              }}>
                Created
              </div>
              <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-2)' }}>
                {key.createdAt
                  ? formatDistanceToNow(new Date(key.createdAt), { addSuffix: true })
                  : '—'}
              </span>
            </div>
            <div>
              <div style={{
                fontFamily: MONO, fontSize: '10px', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.12em',
                color: 'var(--fg-3)', marginBottom: '4px',
              }}>
                Last used
              </div>
              <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-2)' }}>
                {key.lastUsedAt
                  ? formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })
                  : 'Never'}
              </span>
            </div>
            <div style={{ flexBasis: '100%' }}>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Generate a new key? The current key stops working immediately.')) {
                    createMutation.mutate();
                  }
                }}
                disabled={createMutation.isPending}
                style={{ ...SECONDARY_BTN, padding: '5px 10px', fontSize: '10px' }}
              >
                {createMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Regenerate
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '28px 16px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontFamily: SANS, fontSize: '13px', color: 'var(--fg-3)' }}>
              No API key yet. Generate one to authenticate your sensor gateways.
            </p>
          </div>
        )}
      </section>

      {/* Confirm revoke */}
      <Dialog.Root open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
          <Dialog.Content style={{
            position: 'fixed', zIndex: 50, top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)', width: '100%', maxWidth: '420px',
            background: 'var(--bg-surface-1)', border: '1px solid var(--border-strong)',
            borderRadius: '2px', padding: '18px',
          }}>
            <Dialog.Title style={{
              margin: '0 0 8px 0', fontFamily: SANS, fontSize: '15px',
              fontWeight: 600, color: 'var(--fg-1)',
            }}>
              Revoke API key?
            </Dialog.Title>
            <Dialog.Description style={{
              margin: '0 0 16px 0', fontFamily: SANS, fontSize: '13px', color: 'var(--fg-3)',
            }}>
              Your gateways will stop working immediately. You can generate a new key afterwards.
            </Dialog.Description>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={() => setConfirmRevoke(false)} style={SECONDARY_BTN}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => revokeMutation.mutate()}
                disabled={revokeMutation.isPending}
                style={{ ...DANGER_BTN, opacity: revokeMutation.isPending ? 0.5 : 1 }}
              >
                {revokeMutation.isPending && <Loader2 size={12} className="animate-spin" />}
                Revoke key
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <RevealSecretModal
        open={Boolean(revealSecret)}
        secret={revealSecret}
        onClose={() => setRevealSecret('')}
      />
    </div>
  );
}
