'use client';

import { Webhook } from 'lucide-react';

// Same token palette as StatusBadge (minor severity = informational), so the
// placeholder does not invent a new status color.
const COMING_SOON_BADGE = {
  background: 'var(--sev-minor-bg)',
  border: '1px solid var(--sev-minor-dim)',
  color: 'var(--sev-minor)',
  fontSize: '10px',
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  letterSpacing: '0.08em',
  padding: '3px 8px',
  borderRadius: '4px',
  display: 'inline-flex',
  alignItems: 'center',
  whiteSpace: 'nowrap',
  textTransform: 'uppercase',
};

/**
 * Placeholder while webhooks are not shipped. The full implementation is kept,
 * unrendered, in src/components/settings/webhooks/ — swap this body for those
 * components to enable the feature again.
 */
export default function WebhooksSettingsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px 0' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <h1 style={{
            fontFamily: 'var(--font-sans)',
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
          <span style={COMING_SOON_BADGE}>Coming soon</span>
        </div>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          color: 'var(--fg-3)',
          marginTop: '6px',
          maxWidth: '620px',
        }}>
          Sentinel will POST a signed JSON payload to an external URL when an investigation
          completes, a briefing is approved, or a critical incident is detected.
        </p>
      </div>
    </div>
  );
}
