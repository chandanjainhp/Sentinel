'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  Key, Copy, Check, Loader2, AlertTriangle, X, Plus, Ban,
} from 'lucide-react';
import {
  listApiKeys,
  createNamedApiKey,
  revokeApiKeyByKeyId,
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

const LABEL = {
  fontFamily: MONO,
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--fg-3)',
};

/* ── Show-once modal: raw key in a mono block, amber COPY NOW banner ── */
function RevealSecretModal({ open, secret, keyName, onClose }) {
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
          transform: 'translate(-50%, -50%)', width: '100%', maxWidth: '540px',
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
              {keyName || 'New API key'} — created
            </Dialog.Title>
            <button type="button" onClick={close} disabled={!acked} aria-label="Close" style={{
              background: 'none', border: 'none', color: 'var(--fg-3)',
              cursor: acked ? 'pointer' : 'not-allowed', opacity: acked ? 1 : 0.3,
              padding: 0, display: 'flex',
            }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Amber show-once warning */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 14px',
              background: 'color-mix(in srgb, var(--amber) 10%, transparent)',
              border: '1px solid var(--amber)',
              borderRadius: '2px',
            }}>
              <AlertTriangle size={16} style={{ color: 'var(--amber)', flexShrink: 0 }} />
              <p style={{
                margin: 0, fontFamily: MONO, fontSize: '11px', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--amber)',
              }}>
                Copy now — shown only once
              </p>
            </div>

            {/* Raw key in a mono block + copy button */}
            <div style={{
              borderRadius: '2px', border: '1px solid var(--border-default)',
              background: 'var(--bg-surface-2)', padding: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <code style={{
                  flex: 1, fontFamily: MONO, fontSize: '12px',
                  color: 'var(--fg-1)', wordBreak: 'break-all', userSelect: 'all',
                }}>
                  {secret}
                </code>
                <button type="button" onClick={handleCopy} style={{ ...SECONDARY_BTN, flexShrink: 0, padding: '5px 10px', fontSize: '10px' }}>
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <p style={{
              margin: 0, fontFamily: SANS, fontSize: '12px', color: 'var(--fg-3)',
            }}>
              Authenticate gateways with{' '}
              <code style={{ fontFamily: MONO, fontSize: '11px' }}>Authorization: Bearer &lt;key&gt;</code>
              {' '}on <code style={{ fontFamily: MONO, fontSize: '11px' }}>POST /api/v1/events</code>.
              After you close this dialog, the list will only show the prefix{' '}
              <code style={{ fontFamily: MONO, fontSize: '11px' }}>{secret.slice(0, 11)}…</code>
            </p>

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={acked}
                onChange={(e) => setAcked(e.target.checked)}
                style={{ width: '14px', height: '14px', accentColor: 'var(--amber)' }}
              />
              <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-2)' }}>
                I have copied the key and stored it somewhere safe
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

/* ── One row of the key list ── */
function KeyRow({ k, onRevoke, revoking }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap',
      gap: '12px 28px', padding: '14px 16px',
      borderBottom: '1px solid var(--border-hairline)',
    }}>
      <div style={{ minWidth: '160px', flex: '1 1 180px' }}>
        <div style={{ ...LABEL, marginBottom: '3px' }}>Name</div>
        <span style={{ fontFamily: SANS, fontSize: '13px', fontWeight: 600, color: 'var(--fg-1)' }}>
          {k.name || 'Unnamed key'}
        </span>
      </div>
      <div style={{ minWidth: '130px' }}>
        <div style={{ ...LABEL, marginBottom: '3px' }}>Prefix</div>
        <span style={{ fontFamily: MONO, fontSize: '12px', color: 'var(--fg-1)' }}>
          {k.keyPrefix}…
        </span>
      </div>
      <div style={{ minWidth: '120px' }}>
        <div style={{ ...LABEL, marginBottom: '3px' }}>Created</div>
        <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-2)' }}>
          {k.createdAt ? formatDistanceToNow(new Date(k.createdAt), { addSuffix: true }) : '—'}
        </span>
      </div>
      <div style={{ minWidth: '120px' }}>
        <div style={{ ...LABEL, marginBottom: '3px' }}>Last used</div>
        <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-2)' }}>
          {k.lastUsedAt ? formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true }) : 'Never'}
        </span>
      </div>
      <div style={{ marginLeft: 'auto' }}>
        <button
          type="button"
          onClick={() => onRevoke(k)}
          disabled={revoking}
          style={{ ...DANGER_BTN, padding: '5px 10px', fontSize: '10px' }}
        >
          {revoking ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}
          Revoke
        </button>
      </div>
    </div>
  );
}

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [reveal, setReveal] = useState(null); // { secret, name }
  const [pendingRevoke, setPendingRevoke] = useState(null); // key row
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: listApiKeys,
  });
  const keys = Array.isArray(data) ? data : [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    queryClient.invalidateQueries({ queryKey: ['api-key'] });
  };

  const createMutation = useMutation({
    mutationFn: createNamedApiKey,
    onSuccess: (result) => {
      const secret = result?.secret;
      if (!secret) {
        toast.error('Key created but secret was not returned');
        return;
      }
      setReveal({ secret, name: result?.name });
      setName('');
      setFormError('');
      invalidate();
    },
    onError: (err) => setFormError(err?.message ?? 'Failed to create API key'),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeApiKeyByKeyId,
    onSuccess: () => {
      setPendingRevoke(null);
      invalidate();
      toast.success('API key revoked');
    },
    onError: (err) => toast.error(err?.message ?? 'Failed to revoke API key'),
  });

  function submitCreate(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('Give the key a name so you know what it is for.');
      return;
    }
    createMutation.mutate(trimmed);
  }

  return (
    <div className="api-keys-page" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        /* Phones: long keys must scroll inside their box instead of stretching the page. */
        @media (max-width: 640px) {
          .api-keys-page code { display: inline-block; max-width: 100%; overflow-x: auto; vertical-align: bottom; }
        }
      ` }} />
      <div>
        <h1 style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          fontFamily: SANS, fontSize: '18px', fontWeight: 600,
          color: 'var(--fg-1)', margin: 0,
        }}>
          <Key size={16} style={{ color: 'var(--accent)' }} />
          API Keys
        </h1>
        <p style={{
          marginTop: '6px', marginBottom: 0, fontFamily: SANS,
          fontSize: '12px', color: 'var(--fg-3)',
        }}>
          Name one key per gateway. Use{' '}
          <code style={{ fontFamily: MONO, fontSize: '11px' }}>Authorization: Bearer &lt;key&gt;</code>
          {' '}on <code style={{ fontFamily: MONO, fontSize: '11px' }}>POST /api/v1/events</code>.
          The raw key is shown once at creation — afterwards only the prefix remains.
        </p>
      </div>

      {/* ── Create form ── */}
      <form onSubmit={submitCreate} style={{
        background: 'var(--bg-surface-1)',
        border: '1px solid var(--border-default)',
        borderRadius: '2px',
        padding: '16px',
        display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '12px',
      }}>
        <div style={{ flex: '1 1 260px', minWidth: '220px' }}>
          <label htmlFor="api-key-name" style={{ ...LABEL, display: 'block', marginBottom: '6px' }}>
            Key name
          </label>
          <input
            id="api-key-name"
            type="text"
            value={name}
            maxLength={64}
            placeholder="e.g. North gate gateway"
            onChange={(e) => { setName(e.target.value); setFormError(''); }}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-strong)',
              borderRadius: '2px',
              color: 'var(--fg-1)',
              fontFamily: MONO, fontSize: '12px',
              padding: '9px 10px', outline: 'none',
            }}
          />
          {formError && (
            <div style={{ marginTop: '8px', fontFamily: MONO, fontSize: '10.5px', color: 'var(--sev-serious)' }}>
              {formError}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={createMutation.isPending}
          style={{ ...PRIMARY_BTN, marginTop: '20px', opacity: createMutation.isPending ? 0.6 : 1 }}
        >
          {createMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Create key
        </button>
      </form>

      {/* ── Key list ── */}
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
          <h2 style={{ margin: 0, ...LABEL, color: 'var(--fg-2)' }}>
            Your keys
          </h2>
          <span style={{ ...LABEL, color: 'var(--fg-4)' }}>
            {keys.length} {keys.length === 1 ? 'key' : 'keys'}
          </span>
        </div>

        {isLoading ? (
          <div style={{
            padding: '24px 16px', display: 'flex', alignItems: 'center', gap: '8px',
            color: 'var(--fg-3)', fontFamily: MONO, fontSize: '11px',
          }}>
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : keys.length === 0 ? (
          <div style={{ padding: '28px 16px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontFamily: SANS, fontSize: '13px', color: 'var(--fg-3)' }}>
              No API keys yet. Create one above to authenticate your sensor gateways.
            </p>
          </div>
        ) : (
          keys.map((k) => (
            <KeyRow
              key={k.keyId || k.id}
              k={k}
              onRevoke={setPendingRevoke}
              revoking={revokeMutation.isPending && pendingRevoke?.keyId === k.keyId}
            />
          ))
        )}
      </section>

      {/* ── Revoke confirm ── */}
      <Dialog.Root
        open={Boolean(pendingRevoke)}
        onOpenChange={(v) => { if (!v) setPendingRevoke(null); }}
      >
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
          <Dialog.Content style={{
            position: 'fixed', zIndex: 50, top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)', width: '100%', maxWidth: '440px',
            background: 'var(--bg-surface-1)', border: '1px solid var(--border-strong)',
            borderRadius: '2px', padding: '18px',
          }}>
            <Dialog.Title style={{
              margin: '0 0 8px 0', fontFamily: SANS, fontSize: '15px',
              fontWeight: 600, color: 'var(--fg-1)',
            }}>
              Revoke “{pendingRevoke?.name}”?
            </Dialog.Title>
            <Dialog.Description style={{
              margin: '0 0 16px 0', fontFamily: SANS, fontSize: '13px', color: 'var(--fg-3)',
            }}>
              Gateways using{' '}
              <code style={{ fontFamily: MONO, fontSize: '11px' }}>{pendingRevoke?.keyPrefix}…</code>
              {' '}stop working immediately. This cannot be undone.
            </Dialog.Description>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={() => setPendingRevoke(null)} style={SECONDARY_BTN}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => revokeMutation.mutate(pendingRevoke.keyId)}
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

      {/* ── Show-once reveal ── */}
      <RevealSecretModal
        open={Boolean(reveal?.secret)}
        secret={reveal?.secret || ''}
        keyName={reveal?.name}
        onClose={() => setReveal(null)}
      />
    </div>
  );
}
