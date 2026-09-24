'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Switch from '@radix-ui/react-switch';
import * as Dialog from '@radix-ui/react-dialog';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as Checkbox from '@radix-ui/react-checkbox';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Webhook,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Loader2,
  AlertTriangle,
  KeyRound,
  FlaskConical,
  ChevronRight,
  Code2,
  Clock,
} from 'lucide-react';
import {
  getOrgWebhooks,
  getWebhookDeliveries,
  updateSiteConfig,
  testWebhook,
  rotateWebhookSecret,
  retryWebhookDelivery,
} from '@/lib/api';

const MONO = 'var(--font-mono)';
const SANS = 'var(--font-sans)';

const LABEL_STYLE = {
  fontFamily: MONO,
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--fg-3)',
};

const CARD_STYLE = {
  background: 'var(--bg-surface-1)',
  border: '1px solid var(--border-default)',
  borderRadius: '2px',
  overflow: 'hidden',
};

const BTN_PRIMARY = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  fontFamily: SANS,
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--bg-base)',
  background: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: '2px',
  cursor: 'pointer',
};

const BTN_SECONDARY = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  fontFamily: SANS,
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--fg-2)',
  background: 'var(--bg-surface-2)',
  border: '1px solid var(--border-default)',
  borderRadius: '2px',
  cursor: 'pointer',
};

/* ─── helpers ─────────────────────────────────────────── */

function stripHttps(url = '') {
  return url.replace(/^https?:\/\//, '');
}

function statusBadgeStyle(status) {
  let bg = 'var(--sev-harmless)';
  if (status === 'failed') bg = 'var(--sev-serious)';
  else if (status === 'pending') bg = 'var(--sev-info)';
  else if (status === 'retry') bg = 'var(--sev-warning)';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: '2px',
    fontFamily: MONO,
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--bg-base)',
    background: bg,
  };
}

function httpCodeColor(code) {
  if (!code) return 'var(--fg-4)';
  if (typeof code === 'number') {
    if (code >= 200 && code < 300) return 'var(--sev-harmless)';
    if (code >= 400) return 'var(--sev-serious)';
    return 'var(--sev-warning)';
  }
  return 'var(--fg-3)';
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {});
}

/* ─── sub-components ──────────────────────────────────── */

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div style={CARD_STYLE}>
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border-hairline)',
        background: 'var(--bg-surface-2)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        {Icon && <Icon size={12} style={{ color: 'var(--fg-3)' }} />}
        <h2 style={{
          ...LABEL_STYLE,
          fontSize: '11px',
          margin: 0,
        }}>{title}</h2>
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );
}

function EventTypeBadge({ type }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: '2px',
      fontFamily: MONO,
      fontSize: '11px',
      fontWeight: 500,
      color: 'var(--accent)',
      background: 'var(--bg-surface-2)',
      border: '1px solid var(--border-hairline)',
    }}>
      {type}
    </span>
  );
}

/* ─── Rotate Secret Dialog ────────────────────────────── */

function RotateSecretDialog({ onNewSecret }) {
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
              <AlertTriangle size={18} style={{ color: 'var(--sev-warning)' }} />
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
              {loading && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
              Rotate Secret
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ─── New Secret Reveal Modal ─────────────────────────── */

function NewSecretRevealModal({ secret, onClose }) {
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
              <KeyRound size={18} style={{ color: 'var(--sev-warning)' }} />
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
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 10px',
                  fontFamily: MONO,
                  fontSize: '11px',
                  fontWeight: 500,
                  color: 'var(--fg-2)',
                  background: 'var(--bg-surface-3)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
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
            <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-2)' }}>I have copied the secret to a secure location</span>
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

/* ─── Delivery Row ────────────────────────────────────── */

function DeliveryRow({ delivery, onRetry }) {
  const [expanded, setExpanded] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry(delivery._id ?? delivery.id);
      toast.success('Queued for retry');
    } catch (err) {
      toast.error(err?.message || 'Failed to queue retry');
    } finally {
      setRetrying(false);
    }
  };

  const isFailed = delivery.status === 'failed';
  const ts = delivery.timestamp ?? delivery.createdAt ?? delivery.sentAt;
  const codeColor = httpCodeColor(delivery.responseStatus ?? delivery.httpStatus);

  const tdStyle = { padding: '10px 14px', fontFamily: SANS, fontSize: '13px', color: 'var(--fg-2)' };

  return (
    <>
      <tr
        style={{ borderBottom: '1px solid var(--border-hairline)', cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface-2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <td style={tdStyle}>
          <EventTypeBadge type={delivery.eventType} />
        </td>
        <td style={tdStyle}>
          <span style={statusBadgeStyle(delivery.status)}>{delivery.status}</span>
        </td>
        <td style={{ ...tdStyle, color: 'var(--fg-3)' }}>{delivery.attempts ?? 1}</td>
        <td style={{ ...tdStyle, fontFamily: MONO, color: codeColor }}>
          {delivery.responseStatus ?? delivery.httpStatus ?? '—'}
        </td>
        <td style={{ ...tdStyle, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
          {ts ? format(new Date(ts), 'MMM d, HH:mm:ss') : '—'}
        </td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
            {isFailed && (
              <button
                onClick={(e) => { e.stopPropagation(); handleRetry(); }}
                disabled={retrying}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  fontFamily: SANS,
                  fontSize: '11px',
                  fontWeight: 500,
                  color: 'var(--bg-base)',
                  background: 'var(--accent)',
                  border: '1px solid var(--accent)',
                  borderRadius: '2px',
                  cursor: retrying ? 'not-allowed' : 'pointer',
                  opacity: retrying ? 0.5 : 1,
                }}
              >
                {retrying ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={11} />}
                Retry
              </button>
            )}
            {expanded
              ? <ChevronUp size={14} style={{ color: 'var(--fg-3)' }} />
              : <ChevronDown size={14} style={{ color: 'var(--fg-3)' }} />}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border-hairline)' }}>
          <td colSpan={6} style={{ padding: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div>
                <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>Payload</div>
                <pre style={{
                  fontFamily: MONO,
                  fontSize: '11px',
                  background: 'var(--bg-base)',
                  color: 'var(--fg-2)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: '2px',
                  padding: '12px',
                  overflowX: 'auto',
                  maxHeight: '192px',
                  margin: 0,
                }}>
                  {JSON.stringify(delivery.payload ?? delivery.body ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>Response Body</div>
                <pre style={{
                  fontFamily: MONO,
                  fontSize: '11px',
                  background: 'var(--bg-base)',
                  color: 'var(--fg-2)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: '2px',
                  padding: '12px',
                  overflowX: 'auto',
                  maxHeight: '192px',
                  margin: 0,
                }}>
                  {delivery.responseBody ?? delivery.response ?? '(empty)'}
                </pre>
              </div>
            </div>
            {Array.isArray(delivery.attemptsTimeline) && delivery.attemptsTimeline.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>Attempt Timeline</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {delivery.attemptsTimeline.map((att, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontFamily: MONO,
                      fontSize: '11px',
                      color: 'var(--fg-3)',
                    }}>
                      <Clock size={11} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
                      <span style={{ color: 'var(--fg-4)' }}>{att.at ? format(new Date(att.at), 'HH:mm:ss') : `Attempt ${i + 1}`}</span>
                      <span style={{ color: httpCodeColor(att.status) }}>{att.status}</span>
                      {att.error && <span style={{ color: 'var(--sev-serious)' }}>{att.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Event Reference Collapsible ─────────────────────── */

const EVENT_TYPES = [
  {
    type: 'incident.created',
    desc: 'A new incident was detected by the AI agent',
    payload: {
      event: 'incident.created',
      data: { id: 'inc_abc123', severity: 'high', nightDate: '2025-01-15', detectedAt: '2025-01-15T02:34:00Z' },
    },
  },
  {
    type: 'incident.classified',
    desc: 'An incident has been classified with a severity',
    payload: {
      event: 'incident.classified',
      data: { id: 'inc_abc123', severity: 'critical', previousSeverity: 'high', classifiedAt: '2025-01-15T02:35:00Z' },
    },
  },
  {
    type: 'briefing.approved',
    desc: 'A morning briefing has been approved by an operator',
    payload: {
      event: 'briefing.approved',
      data: { id: 'brf_xyz789', nightDate: '2025-01-15', approvedBy: 'user_op1', approvedAt: '2025-01-15T06:00:00Z' },
    },
  },
  {
    type: 'investigation.completed',
    desc: 'An overnight investigation run has completed',
    payload: {
      event: 'investigation.completed',
      data: { id: 'inv_qrs456', nightDate: '2025-01-15', incidentsFound: 3, completedAt: '2025-01-15T05:50:00Z' },
    },
  },
];

function EventReferenceSection() {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div style={CARD_STYLE}>
        <Collapsible.Trigger asChild>
          <button style={{
            width: '100%',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            textAlign: 'left',
            background: 'var(--bg-surface-2)',
            border: 'none',
            borderBottom: open ? '1px solid var(--border-hairline)' : 'none',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Code2 size={12} style={{ color: 'var(--fg-3)' }} />
              <span style={{ ...LABEL_STYLE, fontSize: '11px' }}>Event Type Reference</span>
            </div>
            {open
              ? <ChevronUp size={14} style={{ color: 'var(--fg-3)' }} />
              : <ChevronDown size={14} style={{ color: 'var(--fg-3)' }} />}
          </button>
        </Collapsible.Trigger>

        <Collapsible.Content>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {EVENT_TYPES.map((evt) => (
              <div key={evt.type}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                  <EventTypeBadge type={evt.type} />
                  <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-3)' }}>{evt.desc}</span>
                </div>
                <pre style={{
                  fontFamily: MONO,
                  fontSize: '11px',
                  background: 'var(--bg-base)',
                  color: 'var(--fg-2)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: '2px',
                  padding: '14px',
                  overflowX: 'auto',
                  margin: 0,
                }}>
                  {JSON.stringify(evt.payload, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  );
}

/* ─── Main Page ───────────────────────────────────────── */

export default function WebhooksSettingsPage() {
  const queryClient = useQueryClient();

  // Config state
  const [urlSuffix, setUrlSuffix] = useState('');
  const [webhookActive, setWebhookActive] = useState(false);
  const [saving, setSaving] = useState(false);

  // HMAC secret state
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const revealTimerRef = useRef(null);
  const [newSecret, setNewSecret] = useState(null);

  // Test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok: bool, status, body }
  const testClearTimerRef = useRef(null);

  // Delivery filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Load config
  const { data: webhookConfig, isLoading: configLoading } = useQuery({
    queryKey: ['org-webhooks'],
    queryFn: getOrgWebhooks,
  });

  useEffect(() => {
    if (webhookConfig) {
      setUrlSuffix(stripHttps(webhookConfig.webhookUrl ?? ''));
      setWebhookActive(!!webhookConfig.webhookActive);
      setSecret(webhookConfig.hmacSecret ?? '');
    }
  }, [webhookConfig]);

  // Load deliveries
  const { data: deliveriesData, isLoading: deliveriesLoading } = useQuery({
    queryKey: ['webhook-deliveries'],
    queryFn: () => getWebhookDeliveries({ limit: 20 }),
  });

  const rawDeliveries = Array.isArray(deliveriesData)
    ? deliveriesData
    : deliveriesData?.deliveries ?? deliveriesData?.data ?? [];

  const filteredDeliveries = rawDeliveries.filter((d) => {
    const matchStatus = statusFilter === 'all' || d.status === statusFilter;
    const matchType = typeFilter === 'all' || d.eventType === typeFilter;
    return matchStatus && matchType;
  });

  // Save config
  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSiteConfig({ webhookUrl: 'https://' + urlSuffix, webhookActive });
      toast.success('Webhook saved');
    } catch (err) {
      toast.error(err?.message || 'Failed to save webhook config');
    } finally {
      setSaving(false);
    }
  };

  // Test webhook
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    clearTimeout(testClearTimerRef.current);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const result = await testWebhook();
      clearTimeout(timeoutId);
      const status = result?.status ?? result?.httpStatus ?? 200;
      const body = result?.body ?? result?.response ?? JSON.stringify(result);
      const ok = typeof status === 'number' ? status >= 200 && status < 300 : true;
      setTestResult({ ok, status, body: typeof body === 'string' ? body : JSON.stringify(body) });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        setTestResult({ ok: false, status: 'timeout', body: 'Request timed out after 10s' });
      } else {
        const status = err?.statusCode ?? err?.response?.status ?? 'error';
        const body = err?.message ?? 'Test webhook failed';
        setTestResult({ ok: false, status, body });
      }
    } finally {
      setTesting(false);
      testClearTimerRef.current = setTimeout(() => setTestResult(null), 30000);
    }
  };

  // Reveal secret
  const handleReveal = () => {
    clearTimeout(revealTimerRef.current);
    setShowSecret(true);
    revealTimerRef.current = setTimeout(() => setShowSecret(false), 30000);
  };

  const handleHide = () => {
    clearTimeout(revealTimerRef.current);
    setShowSecret(false);
  };

  // Copy secret without revealing
  const handleCopySecret = () => {
    if (secret) {
      copyToClipboard(secret);
      toast.success('Secret copied to clipboard');
    }
  };

  // Retry delivery
  const handleRetryDelivery = async (id) => {
    await retryWebhookDelivery(id);
    queryClient.invalidateQueries({ queryKey: ['webhook-deliveries'] });
  };

  // Unique event types for filter
  const uniqueEventTypes = [...new Set(rawDeliveries.map((d) => d.eventType).filter(Boolean))];

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(revealTimerRef.current);
      clearTimeout(testClearTimerRef.current);
    };
  }, []);

  const inputStyle = {
    flex: 1,
    padding: '8px 12px',
    fontFamily: SANS,
    fontSize: '13px',
    color: 'var(--fg-1)',
    background: 'var(--bg-base)',
    border: 'none',
    outline: 'none',
  };

  const selectStyle = {
    fontFamily: SANS,
    fontSize: '13px',
    color: 'var(--fg-2)',
    background: 'var(--bg-surface-2)',
    border: '1px solid var(--border-default)',
    borderRadius: '2px',
    padding: '6px 10px',
    outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', padding: '24px 0' }}>
      {/* Header */}
      <div>
        <h1 style={{
          fontFamily: SANS,
          fontSize: '22px',
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: 'var(--fg-1)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          margin: 0,
        }}>
          <Webhook size={22} style={{ color: 'var(--accent)' }} />
          Webhooks
        </h1>
        <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-3)', marginTop: '6px' }}>
          Receive real-time HTTP POST notifications when events occur in Sentinel.
        </p>
      </div>

      {/* Config Section */}
      <SectionCard title="Endpoint Configuration" icon={Webhook}>
        {configLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: SANS, fontSize: '13px', color: 'var(--fg-3)' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            Loading configuration…
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* URL Input */}
            <div>
              <label style={{ ...LABEL_STYLE, display: 'block', marginBottom: '8px' }}>
                Webhook URL
              </label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                border: '1px solid var(--border-default)',
                borderRadius: '2px',
                overflow: 'hidden',
                background: 'var(--bg-base)',
              }}>
                <span style={{
                  padding: '8px 12px',
                  background: 'var(--bg-surface-2)',
                  borderRight: '1px solid var(--border-hairline)',
                  fontFamily: MONO,
                  fontSize: '12px',
                  color: 'var(--fg-3)',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                }}>
                  https://
                </span>
                <input
                  type="text"
                  style={inputStyle}
                  placeholder="your-domain.com/api/webhooks/sentinel"
                  value={urlSuffix}
                  onChange={(e) => setUrlSuffix(e.target.value)}
                />
              </div>
              <p style={{ fontFamily: SANS, fontSize: '11px', color: 'var(--fg-4)', marginTop: '6px' }}>Must be a publicly accessible HTTPS endpoint.</p>
            </div>

            {/* Active Toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 0',
              borderTop: '1px solid var(--border-hairline)',
            }}>
              <div>
                <div style={{ fontFamily: SANS, fontSize: '13px', fontWeight: 500, color: 'var(--fg-2)' }}>Active</div>
                <div style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--fg-3)', marginTop: '2px' }}>Enable or disable webhook delivery without deleting your configuration.</div>
              </div>
              <Switch.Root
                checked={webhookActive}
                onCheckedChange={setWebhookActive}
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  height: '22px',
                  width: '40px',
                  alignItems: 'center',
                  borderRadius: '11px',
                  background: webhookActive ? 'var(--accent)' : 'var(--bg-surface-3)',
                  border: '1px solid var(--border-default)',
                  transition: 'background 120ms',
                  cursor: 'pointer',
                }}
              >
                <Switch.Thumb style={{
                  display: 'inline-block',
                  height: '16px',
                  width: '16px',
                  borderRadius: '50%',
                  background: 'var(--bg-base)',
                  transform: webhookActive ? 'translateX(20px)' : 'translateX(2px)',
                  transition: 'transform 120ms',
                }} />
              </Switch.Root>
            </div>

            {/* Actions Row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', paddingTop: '4px' }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ ...BTN_PRIMARY, opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
              >
                {saving && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                Save Configuration
              </button>

              <button
                onClick={handleTest}
                disabled={testing}
                style={{ ...BTN_SECONDARY, opacity: testing ? 0.5 : 1, cursor: testing ? 'not-allowed' : 'pointer' }}
              >
                {testing
                  ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  : <FlaskConical size={13} />}
                {testing ? 'Testing…' : 'Test Webhook'}
              </button>

              {/* Inline test result */}
              {testResult && !testing && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '2px',
                    fontFamily: MONO,
                    fontSize: '11px',
                    maxWidth: '380px',
                    background: 'var(--bg-surface-2)',
                    border: `1px solid ${testResult.ok ? 'var(--sev-harmless)' : 'var(--sev-serious)'}`,
                    color: testResult.ok ? 'var(--sev-harmless)' : 'var(--sev-serious)',
                  }}
                >
                  {testResult.ok
                    ? <Check size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                    : <X size={14} style={{ flexShrink: 0, marginTop: '2px' }} />}
                  <span style={{ wordBreak: 'break-all' }}>
                    {testResult.status} — {testResult.body}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* HMAC Secret Section */}
      <SectionCard title="HMAC Signing Secret" icon={KeyRound}>
        <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-3)', marginBottom: '16px' }}>
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
          {/* Masked display */}
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
              value={showSecret ? secret : '•'.repeat(32)}
              style={{
                padding: '8px 12px',
                fontFamily: MONO,
                fontSize: '12px',
                background: 'var(--bg-surface-2)',
                color: 'var(--fg-2)',
                outline: 'none',
                width: '260px',
                border: 'none',
              }}
            />
          </div>

          {/* Show / Hide */}
          <button
            onClick={showSecret ? handleHide : handleReveal}
            style={BTN_SECONDARY}
          >
            {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
            {showSecret ? 'Hide' : 'Show'}
          </button>

          {/* Copy (without visually revealing) */}
          <button
            onClick={handleCopySecret}
            style={BTN_SECONDARY}
          >
            <Copy size={13} />
            Copy
          </button>

          {/* Rotate */}
          <RotateSecretDialog onNewSecret={(s) => setNewSecret(s)} />
        </div>

        {showSecret && (
          <p style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--sev-warning)', marginTop: '10px' }}>Secret will auto-hide after 30 seconds.</p>
        )}
      </SectionCard>

      {/* New secret reveal modal */}
      {newSecret && (
        <NewSecretRevealModal
          secret={newSecret}
          onClose={() => {
            setNewSecret(null);
            // Also refresh config to get updated masked secret
            queryClient.invalidateQueries({ queryKey: ['org-webhooks'] });
          }}
        />
      )}

      {/* Webhook value context */}
      <div style={{
        background: 'var(--bg-surface-1)',
        border: '1px solid var(--border-default)',
        borderRadius: '2px',
        padding: '16px',
        display: 'flex', flexDirection: 'column', gap: '12px',
      }}>
        <div style={LABEL_STYLE}>
          How webhooks work
        </div>
        <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-2)', margin: 0 }}>
          Sentinel POSTs a signed JSON payload to your endpoint when an investigation completes, a briefing is approved, or a critical incident is detected. Use webhooks to trigger Slack alerts, PagerDuty incidents, or custom automations.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            ['X-Sentinel-Event', 'Event type (e.g. investigation.completed)'],
            ['X-Sentinel-Delivery', 'Unique delivery ID for idempotency'],
            ['X-Sentinel-Signature', 'HMAC-SHA256 of the payload body'],
          ].map(([header, desc]) => (
            <div key={header} style={{
              padding: '6px 10px',
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-hairline)',
              borderRadius: '2px',
              display: 'flex', flexDirection: 'column', gap: '2px',
              flex: '1', minWidth: '200px',
            }}>
              <span style={{ fontFamily: MONO, fontSize: '10px', color: 'var(--accent)', fontWeight: 600 }}>{header}</span>
              <span style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--fg-3)' }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery Log */}
      <SectionCard title="Delivery Log" icon={Clock}>
        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={LABEL_STYLE}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All</option>
              <option value="delivered">Delivered</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={LABEL_STYLE}>Event Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All</option>
              {uniqueEventTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {deliveriesLoading ? (
          <div style={{
            padding: '48px 16px',
            textAlign: 'center',
            fontFamily: SANS,
            fontSize: '13px',
            color: 'var(--fg-3)',
            border: '1px solid var(--border-hairline)',
            borderRadius: '2px',
          }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 6px' }} />
            Loading deliveries…
          </div>
        ) : rawDeliveries.length === 0 ? (
          <div style={{
            padding: '48px 16px',
            textAlign: 'center',
            fontFamily: SANS,
            fontSize: '13px',
            color: 'var(--fg-3)',
            border: '1px solid var(--border-hairline)',
            borderRadius: '2px',
          }}>
            No webhook deliveries yet.
          </div>
        ) : filteredDeliveries.length === 0 ? (
          <div style={{
            padding: '48px 16px',
            textAlign: 'center',
            fontFamily: SANS,
            fontSize: '13px',
            color: 'var(--fg-3)',
            border: '1px solid var(--border-hairline)',
            borderRadius: '2px',
          }}>
            No deliveries match the current filter.
          </div>
        ) : (
          <div style={{
            overflowX: 'auto',
            border: '1px solid var(--border-hairline)',
            borderRadius: '2px',
          }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border-default)' }}>
                <tr>
                  {['Event Type', 'Status', 'Attempts', 'HTTP Code', 'Timestamp'].map((h) => (
                    <th key={h} style={{ ...LABEL_STYLE, padding: '10px 14px', textAlign: 'left' }}>{h}</th>
                  ))}
                  <th style={{ ...LABEL_STYLE, padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeliveries.map((d) => (
                  <DeliveryRow
                    key={d._id ?? d.id}
                    delivery={d}
                    onRetry={handleRetryDelivery}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Event Reference Collapsible */}
      <EventReferenceSection />
    </div>
  );
}
