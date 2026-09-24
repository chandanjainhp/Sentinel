'use client';

import { memo } from 'react';

const MONO = 'var(--font-mono)';

/**
 * Compact WP · Asset badge — styles are static so memo is cheap.
 */
function ProjectContextBadge({ projectContext, fallback = '—' }) {
  const wp = projectContext?.workPackageId;
  const asset = projectContext?.assetId;

  if (!wp && !asset) {
    return (
      <span style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--fg-4)' }}>
        {fallback}
      </span>
    );
  }

  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: '11px',
        color: 'var(--fg-2)',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
      title={
        wp && asset
          ? `Work Package ${wp} · Asset ${asset}`
          : wp
            ? `Work Package ${wp}`
            : `Asset ${asset}`
      }
    >
      {wp && (
        <span style={{ color: 'var(--accent)' }}>{wp}</span>
      )}
      {wp && asset && (
        <span style={{ color: 'var(--fg-4)', margin: '0 4px' }}>·</span>
      )}
      {asset && <span style={{ color: 'var(--fg-3)' }}>{asset}</span>}
    </span>
  );
}

export default memo(ProjectContextBadge);
