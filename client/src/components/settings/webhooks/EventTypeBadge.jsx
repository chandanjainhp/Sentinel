'use client';

import { MONO } from './webhookStyles';

export default function EventTypeBadge({ type }) {
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
      whiteSpace: 'nowrap',
    }}>
      {type}
    </span>
  );
}
