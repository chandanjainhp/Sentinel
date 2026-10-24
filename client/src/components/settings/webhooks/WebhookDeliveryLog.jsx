'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Clock, Loader2, RotateCcw } from 'lucide-react';
import SectionCard from '@/components/settings/SectionCard';
import { getWebhookDeliveries, retryWebhookDelivery } from '@/lib/api';
import EventTypeBadge from './EventTypeBadge';
import { LABEL, MONO, PRE_STYLE, SANS, SPIN } from './webhookStyles';

function statusBadgeStyle(status) {
  let bg = 'var(--sev-harmless)';
  if (status === 'failed') bg = 'var(--sev-serious)';
  else if (status === 'pending') bg = 'var(--sev-minor)';
  else if (status === 'retry') bg = 'var(--sev-unknown)';
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
    return 'var(--sev-minor)';
  }
  return 'var(--fg-3)';
}

function DeliveryRow({ delivery, onRetry, retrying }) {
  const [expanded, setExpanded] = useState(false);
  const isFailed = delivery.status === 'failed';
  const ts = delivery.timestamp ?? delivery.createdAt ?? delivery.sentAt;
  const codeColor = httpCodeColor(delivery.responseStatus ?? delivery.httpStatus);
  const tdStyle = { padding: '10px 14px', fontFamily: SANS, fontSize: '13px', color: 'var(--fg-2)' };

  return (
    <>
      <tr
        style={{ borderBottom: '1px solid var(--border-hairline)', cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <td style={tdStyle}><EventTypeBadge type={delivery.eventType} /></td>
        <td style={tdStyle}><span style={statusBadgeStyle(delivery.status)}>{delivery.status}</span></td>
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
                onClick={(e) => { e.stopPropagation(); onRetry(delivery._id ?? delivery.id); }}
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
                {retrying ? <Loader2 size={11} style={{ animation: SPIN }} /> : <RotateCcw size={11} />}
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
                <div style={{ ...LABEL, marginBottom: '8px' }}>Payload</div>
                <pre style={{ ...PRE_STYLE, maxHeight: '192px' }}>
                  {JSON.stringify(delivery.payload ?? delivery.body ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <div style={{ ...LABEL, marginBottom: '8px' }}>Response Body</div>
                <pre style={{ ...PRE_STYLE, maxHeight: '192px' }}>
                  {delivery.responseBody ?? delivery.response ?? '(empty)'}
                </pre>
              </div>
            </div>
            {Array.isArray(delivery.attemptsTimeline) && delivery.attemptsTimeline.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ ...LABEL, marginBottom: '8px' }}>Attempt Timeline</div>
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
                      <span style={{ color: 'var(--fg-4)' }}>
                        {att.at ? format(new Date(att.at), 'HH:mm:ss') : `Attempt ${i + 1}`}
                      </span>
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

const EMPTY_STATE = {
  padding: '48px 16px',
  textAlign: 'center',
  fontFamily: SANS,
  fontSize: '13px',
  color: 'var(--fg-3)',
  border: '1px solid var(--border-hairline)',
  borderRadius: '2px',
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
  maxWidth: '100%',
};

/** Delivery history with status/event filters and per-row retry. */
export default function WebhookDeliveryLog() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [retryingId, setRetryingId] = useState(null);

  const { data: deliveriesData, isLoading } = useQuery({
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

  const uniqueEventTypes = [...new Set(rawDeliveries.map((d) => d.eventType).filter(Boolean))];

  const retryMutation = useMutation({
    mutationFn: (id) => retryWebhookDelivery(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-deliveries'] });
      toast.success('Queued for retry');
    },
    onError: (err) => toast.error(err?.message || 'Failed to queue retry'),
  });

  const handleRetry = (id) => {
    setRetryingId(id);
    retryMutation.mutate(id, { onSettled: () => setRetryingId(null) });
  };

  return (
    <SectionCard title="Delivery Log" icon={Clock}>
      <div className="wh-actions" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="delivery-status" style={LABEL}>Status</label>
          <select id="delivery-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
            <option value="all">All</option>
            <option value="delivered">Delivered</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="delivery-event-type" style={LABEL}>Event Type</label>
          <select id="delivery-event-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
            <option value="all">All</option>
            {uniqueEventTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div style={EMPTY_STATE}>
          <Loader2 size={18} style={{ animation: SPIN, display: 'block', margin: '0 auto 6px' }} />
          Loading deliveries…
        </div>
      ) : rawDeliveries.length === 0 ? (
        <div style={EMPTY_STATE}>No webhook deliveries yet.</div>
      ) : filteredDeliveries.length === 0 ? (
        <div style={EMPTY_STATE}>No deliveries match the current filter.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-hairline)', borderRadius: '2px' }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border-default)' }}>
              <tr>
                {['Event Type', 'Status', 'Attempts', 'HTTP Code', 'Timestamp'].map((h) => (
                  <th key={h} style={{ ...LABEL, padding: '10px 14px', textAlign: 'left' }}>{h}</th>
                ))}
                <th style={{ ...LABEL, padding: '10px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeliveries.map((d) => (
                <DeliveryRow
                  key={d._id ?? d.id}
                  delivery={d}
                  onRetry={handleRetry}
                  retrying={retryingId === (d._id ?? d.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
