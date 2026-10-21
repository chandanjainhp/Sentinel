'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './SentinelMark.module.css';

/** Geometry copied from log.html (viewBox 0 0 120 120). */
export const MARK = {
  arch: 'M20 52V32A12 12 0 0 1 32 20H88A12 12 0 0 1 100 32V52',
  bowl: 'M20 71V77L52 104A10 10 0 0 0 68 104L100 77V71',
  trace: 'M6 62H47L60 40L73 62H114',
} as const;

/** Use as <link rel="icon" href={SENTINEL_FAVICON} /> */
export const SENTINEL_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%23E9EDF2' stroke-width='8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 52V32A12 12 0 0 1 32 20H88A12 12 0 0 1 100 32V52'/%3E%3Cpath d='M20 71V77L52 104A10 10 0 0 0 68 104L100 77V71'/%3E%3Cpath d='M6 62H47L60 40L73 62H114' stroke-width='6'/%3E%3C/g%3E%3Ccircle cx='60' cy='40' r='6.5' fill='%23FFB224'/%3E%3C/svg%3E";

/** Mark + wordmark lockup — same API as the previous static component. */
export function SentinelLockup({
  markSize = 22,
  fontSize = 13,
  boot = false,
  className,
  style,
}: {
  markSize?: number;
  fontSize?: number;
  /** Play the draw-on boot animation on mount. */
  boot?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...style }}
    >
      <SentinelMark size={markSize} boot={boot} />
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontVariationSettings: "'wdth' 120",
          fontWeight: 800,
          fontSize,
          letterSpacing: '0.06em',
          color: '#E9EDF2',
          textTransform: 'uppercase',
          lineHeight: 1,
        }}
      >
        SENTINEL
      </span>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: fontSize * 0.11,
          height: fontSize * 0.11,
          minWidth: 3,
          minHeight: 3,
          background: '#FFB224',
          marginLeft: 2,
        }}
      />
    </span>
  );
}

export type SentinelState = 'idle' | 'healthy' | 'warning' | 'critical' | 'offline';

export interface SentinelMarkProps {
  /** Rendered width/height in px. Default 96. */
  size?: number;
  /** Dot/trace state. Default 'idle' (steady amber dot). */
  state?: SentinelState;
  /** Play the draw-on animation on mount. Default false. */
  boot?: boolean;
  /** Change this number to replay the draw-on animation (e.g. on click). */
  replayKey?: number;
  /** Fired when the boot animation finishes (or immediately if reduced motion). */
  onBootEnd?: () => void;
  className?: string;
  /** Accessible label. Default "Sentinel mark". */
  label?: string;
}

const BOOT_MS = 1600; // 1.05s dot delay + .5s pop, plus a small buffer

export default function SentinelMark({
  size = 96,
  state = 'idle',
  boot = false,
  replayKey = 0,
  onBootEnd,
  className,
  label = 'Sentinel mark',
}: SentinelMarkProps) {
  // Initial value = boot, so the very first paint is already "undrawn"
  // (no flash of the finished mark before the draw-on starts).
  const [booting, setBooting] = useState(boot);
  const firstRun = useRef(true);
  const endRef = useRef(onBootEnd);
  useEffect(() => {
    endRef.current = onBootEnd;
  });

  useEffect(() => {
    const isFirst = firstRun.current;
    firstRun.current = false;
    if (!boot && replayKey === 0) return;

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
      setBooting(false);
      const t = window.setTimeout(() => endRef.current?.(), 0);
      return () => window.clearTimeout(t);
    }

    let raf = 0;
    if (!isFirst) {
      // Replay: drop the class for two frames so the CSS animation restarts.
      setBooting(false);
      raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setBooting(true)),
      );
    }

    const t = window.setTimeout(() => {
      setBooting(false);
      endRef.current?.();
    }, BOOT_MS);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [boot, replayKey]);

  const cls = [
    styles.mark,
    styles[state],
    booting ? styles.booting : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      className={cls}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label}
    >
      <g className={styles.arch}>
        <path d={MARK.arch} pathLength={1} />
      </g>
      <g className={styles.bowl}>
        <path d={MARK.bowl} pathLength={1} />
      </g>
      <g className={styles.trace}>
        <path d={MARK.trace} pathLength={1} />
      </g>
      <circle className={styles.ping} cx={60} cy={40} r={6.5} />
      <circle className={styles.dot} cx={60} cy={40} r={6.5} />
    </svg>
  );
}
