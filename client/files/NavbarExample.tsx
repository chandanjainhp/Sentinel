'use client';

/**
 * Example: navbar brand (boots once) + hero mark (replays on click).
 */

import { useState } from 'react';
import SentinelMark from './SentinelMark';

export function NavBrand() {
  return (
    <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <SentinelMark boot size={22} />
      <span
        style={{
          fontWeight: 800,
          fontVariationSettings: "'wdth' 120",
          fontSize: 13,
          letterSpacing: '.06em',
        }}
      >
        SENTINEL
      </span>
    </a>
  );
}

export function HeroMark() {
  const [replay, setReplay] = useState(0);
  return (
    <button
      onClick={() => setReplay((n) => n + 1)}
      aria-label="Replay the Sentinel mark animation"
      style={{ background: 'none', border: 0, cursor: 'pointer' }}
    >
      <SentinelMark boot size={160} replayKey={replay} state="warning" />
    </button>
  );
}
