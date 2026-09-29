"use client";

import { healthMeta } from "@/lib/health";

/**
 * HealthDot — the Night Watch health indicator.
 *
 * A colored dot + optional mono uppercase label. WARNING pulses at 1.1s,
 * CRITICAL pulses at .45s with an expanding ping ring (all disabled under
 * prefers-reduced-motion — see globals.css).
 *
 * The color is deterministic from backend status — never AI-narrated.
 *
 * @param {object}  props
 * @param {string}  props.status    Backend health (or legacy severity) string
 * @param {boolean} [props.label]   Render the mono uppercase label next to the dot
 * @param {number}  [props.size]    Dot diameter in px (default 8)
 */
export default function HealthDot({ status, label = false, size = 8, style }) {
  const meta = healthMeta(status);
  const dot = (
    <span
      className={`hw-dot ${meta.cssClass}`}
      role="img"
      aria-label={meta.label}
      style={{ width: size, height: size, ...style }}
    />
  );

  if (!label) return dot;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {dot}
      <span className="hw-label" style={{ color: meta.token }}>
        {meta.label}
      </span>
    </span>
  );
}
