"use client";

import Link from "next/link";

/**
 * Briefing page — deferred.
 *
 * The overnight briefing pipeline (correlation → investigation → buildBriefing)
 * was retired with the single-user pivot; the Argus explanation layer now runs
 * per incident instead (see the incident page). This stub keeps the route alive
 * so no navigation can 500 from a missing module. It will be replaced when the
 * briefing pipeline is rebuilt.
 */
export default function BriefingPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--fg-4)",
        }}
      >
        Briefing
      </div>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "20px",
          fontWeight: 500,
          color: "var(--fg-1)",
        }}
      >
        The Morning Operations Briefing is coming later.
      </div>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "14px",
          color: "var(--fg-3)",
          maxWidth: "420px",
          lineHeight: 1.6,
        }}
      >
        Argus explanations now live on each incident, where you need them.
        The compiled morning briefing will return in a later phase.
      </div>
      <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
        <Link
          href="/incidents"
          style={{
            padding: "8px 20px",
            background: "var(--accent)",
            color: "var(--bg-base)",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textDecoration: "none",
            borderRadius: "2px",
          }}
        >
          View incidents →
        </Link>
        <Link
          href="/overview"
          style={{
            padding: "8px 20px",
            background: "var(--bg-surface-2)",
            border: "1px solid var(--border-default)",
            color: "var(--fg-2)",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textDecoration: "none",
            borderRadius: "2px",
          }}
        >
          Overview
        </Link>
      </div>
    </div>
  );
}
