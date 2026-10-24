'use client';

import { Code2 } from 'lucide-react';
import SectionCard from '@/components/settings/SectionCard';
import EventTypeBadge from './EventTypeBadge';
import { LABEL, MONO, PRE_STYLE, SANS } from './webhookStyles';

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

const HEADERS = [
  ['X-Sentinel-Event', 'Event type (e.g. investigation.completed)'],
  ['X-Sentinel-Delivery', 'Unique delivery ID for idempotency'],
  ['X-Sentinel-Signature', 'HMAC-SHA256 of the payload body'],
];

/** Docs: how delivery works, signed headers and payload examples. */
export default function WebhookEventReference() {
  return (
    <SectionCard title="Event Reference" icon={Code2}>
      <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-2)', marginTop: 0, marginBottom: '12px' }}>
        Sentinel POSTs a signed JSON payload to your endpoint when an investigation completes, a
        briefing is approved, or a critical incident is detected. Use webhooks to trigger Slack
        alerts, PagerDuty incidents, or custom automations.
      </p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {HEADERS.map(([header, desc]) => (
          <div key={header} style={{
            padding: '6px 10px',
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border-hairline)',
            borderRadius: '2px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            flex: '1',
            minWidth: '200px',
          }}>
            <span style={{ fontFamily: MONO, fontSize: '10px', color: 'var(--accent)', fontWeight: 600 }}>{header}</span>
            <span style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--fg-3)' }}>{desc}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={LABEL}>Event types</div>
        {EVENT_TYPES.map((evt) => (
          <div key={evt.type}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <EventTypeBadge type={evt.type} />
              <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-3)' }}>{evt.desc}</span>
            </div>
            <pre style={{ ...PRE_STYLE, padding: '14px' }}>
              {JSON.stringify(evt.payload, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
