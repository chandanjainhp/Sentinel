'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Eye, EyeOff, KeyRound } from 'lucide-react';
import SectionCard from '@/components/settings/SectionCard';
import { getOrgWebhooks } from '@/lib/api';
import RotateSecretDialog from './RotateSecretDialog';
import NewSecretRevealModal from './NewSecretRevealModal';
import { BTN_SECONDARY, MONO, SANS, copyToClipboard } from './webhookStyles';

const REVEAL_MS = 30000;

/** Signing-secret card: reveal/copy the current secret, or rotate it. */
export default function WebhookSecretPanel() {
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [newSecret, setNewSecret] = useState(null);
  const revealTimerRef = useRef(null);

  const { data: webhookConfig } = useQuery({
    queryKey: ['org-webhooks'],
    queryFn: getOrgWebhooks,
  });

  useEffect(() => {
    if (webhookConfig) setSecret(webhookConfig.hmacSecret ?? '');
  }, [webhookConfig]);

  useEffect(() => () => clearTimeout(revealTimerRef.current), []);

  const handleReveal = () => {
    clearTimeout(revealTimerRef.current);
    setShowSecret(true);
    revealTimerRef.current = setTimeout(() => setShowSecret(false), REVEAL_MS);
  };

  const handleHide = () => {
    clearTimeout(revealTimerRef.current);
    setShowSecret(false);
  };

  const handleCopySecret = () => {
    if (!secret) return;
    copyToClipboard(secret);
    toast.success('Secret copied to clipboard');
  };

  return (
    <SectionCard title="HMAC Signing Secret" icon={KeyRound}>
      <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-3)', marginTop: 0, marginBottom: '16px' }}>
        Sentinel signs every webhook payload with this secret using HMAC-SHA256. Verify the{' '}
        <code style={{
          fontFamily: MONO,
          fontSize: '11px',
          background: 'var(--bg-surface-2)',
          border: '1px solid var(--border-hairline)',
          padding: '1px 6px',
          borderRadius: '2px',
          color: 'var(--accent)',
        }}>X-Sentinel-Signature</code> header on every request.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          border: '1px solid var(--border-default)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <input
            type={showSecret ? 'text' : 'password'}
            readOnly
            aria-label="HMAC signing secret"
            className="wh-secret-input"
            value={showSecret ? secret : '•'.repeat(32)}
            style={{
              padding: '8px 12px',
              fontFamily: MONO,
              fontSize: '12px',
              background: 'var(--bg-surface-2)',
              color: 'var(--fg-2)',
              outline: 'none',
              width: '260px',
              maxWidth: '100%',
              border: 'none',
            }}
          />
        </div>

        <button onClick={showSecret ? handleHide : handleReveal} style={BTN_SECONDARY}>
          {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
          {showSecret ? 'Hide' : 'Show'}
        </button>

        <button onClick={handleCopySecret} style={BTN_SECONDARY}>
          <Copy size={13} />
          Copy
        </button>

        <RotateSecretDialog onNewSecret={setNewSecret} />
      </div>

      {showSecret && (
        <p style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--sev-minor)', marginBottom: 0, marginTop: '10px' }}>
          Secret will auto-hide after 30 seconds.
        </p>
      )}

      {newSecret && (
        <NewSecretRevealModal
          secret={newSecret}
          onClose={() => {
            setNewSecret(null);
            queryClient.invalidateQueries({ queryKey: ['org-webhooks'] });
          }}
        />
      )}
    </SectionCard>
  );
}
