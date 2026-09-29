"use client";

/**
 * SentinelMark — the Night Watch primary mark.
 *
 * Open watch frame + signal spike + amber flag dot. Pure geometry, no image
 * assets (reference artifact: client/log.html — "FIG. 00 — PRIMARY MARK").
 *
 * The single color the mark spends is Signal Amber, and it is spent on one
 * thing only: the flag dot on the spike apex — a machine that needs attention.
 *
 * Variants:
 *   - mark alone (nav, favicon, tiles)
 *   - lockup: mark + "SENTINEL" wordmark (Archivo 800, wdth 120) with a
 *     small amber square after the wordmark.
 *
 * Colors are parameterized for light/print surfaces:
 *   dark  → strokes #E9EDF2, dot #FFB224 (default)
 *   print → strokes #161B21, dot #C07F00
 */

export const SENTINEL_MARK_PATHS = {
  arch: "M20 52V32A12 12 0 0 1 32 20H88A12 12 0 0 1 100 32V52",
  bowl: "M20 71V77L52 104A10 10 0 0 0 68 104L100 77V71",
  trace: "M6 62H47L60 40L73 62H114",
};

const PALETTES = {
  dark: { stroke: "#E9EDF2", dot: "#FFB224" },
  print: { stroke: "#161B21", dot: "#C07F00" },
};

/**
 * @param {object}  props
 * @param {number}  [props.size]       Pixel width/height (square). Omit + style for fluid.
 * @param {"dark"|"print"} [props.palette]
 * @param {string}  [props.className]
 * @param {object}  [props.style]
 */
export default function SentinelMark({
  size = 24,
  palette = "dark",
  className,
  style,
}) {
  const p = PALETTES[palette] || PALETTES.dark;
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Sentinel"
      className={className}
      style={style}
    >
      <path
        d={SENTINEL_MARK_PATHS.arch}
        stroke={p.stroke}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={SENTINEL_MARK_PATHS.bowl}
        stroke={p.stroke}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={SENTINEL_MARK_PATHS.trace}
        stroke={p.stroke}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="60" cy="40" r="6.5" fill={p.dot} />
    </svg>
  );
}

/**
 * SentinelLockup — mark + wordmark + amber flag square.
 * Used in nav bars and login screens.
 */
export function SentinelLockup({
  markSize = 22,
  fontSize = 13,
  palette = "dark",
  className,
  style,
}) {
  const p = PALETTES[palette] || PALETTES.dark;
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 10, ...style }}
    >
      <SentinelMark size={markSize} palette={palette} />
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: "'wdth' 120",
          fontWeight: 800,
          fontSize,
          letterSpacing: "0.06em",
          color: p.stroke,
          textTransform: "uppercase",
          lineHeight: 1,
        }}
      >
        SENTINEL
      </span>
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: fontSize * 0.11,
          height: fontSize * 0.11,
          minWidth: 3,
          minHeight: 3,
          background: p.dot,
          marginLeft: 2,
        }}
      />
    </span>
  );
}
