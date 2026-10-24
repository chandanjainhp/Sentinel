"use client";

import { memo } from "react";
import { Sparkles, RefreshCw, Clock, Zap, Eye } from "lucide-react";

const MONO = "var(--font-mono)";
const SANS = "var(--font-sans)";

const URGENCY_STYLES = {
  now: { color: "var(--sev-serious)", label: "ACT NOW", icon: Zap },
  soon: { color: "var(--sev-minor)", label: "SOON", icon: Clock },
  monitor: { color: "var(--sev-harmless)", label: "MONITOR", icon: Eye },
};

/**
 * Argus explanation card (Wave 4, Fix A).
 *
 * Renders the incident's `explanation` sub-document: pending (loading),
 * ready (summary / cause / action + urgency badge), failed, or missing.
 * When source === "fallback" an AUTO-GENERATED label marks deterministic
 * (non-LLM) content. Night Watch styling only.
 */
function ArgusExplanationBase({
  explanation,
  onRegenerate,
  isRegenerating = false,
}) {
  const status = explanation?.status ?? null;

  const sectionLabel = (text) => (
    <div
      style={{
        fontFamily: MONO,
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "var(--fg-4)",
        marginBottom: "6px",
      }}
    >
      {text}
    </div>
  );

  const bodyText = (text) => (
    <p
      style={{
        fontFamily: SANS,
        fontSize: "12.5px",
        color: "var(--fg-1)",
        lineHeight: "var(--lh-snug, 1.5)",
        margin: 0,
      }}
    >
      {text}
    </p>
  );

  const regenerateButton =
    onRegenerate && status !== "pending" ? (
      <button
        onClick={onRegenerate}
        disabled={isRegenerating}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          background: "transparent",
          border: "1px solid var(--border-default)",
          color: isRegenerating ? "var(--fg-4)" : "var(--accent)",
          fontFamily: MONO,
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          padding: "4px 10px",
          cursor: isRegenerating ? "not-allowed" : "pointer",
          opacity: isRegenerating ? 0.6 : 1,
        }}
        title="Ask Argus to generate a fresh explanation"
      >
        <RefreshCw size={10} />
        {isRegenerating ? "Regenerating…" : "Regenerate"}
      </button>
    ) : null;

  // ── Pending: job queued or LLM running ──
  if (status === "pending") {
    return (
      <div
        style={{
          border: "1px solid var(--border-default)",
          background: "var(--bg-surface-1)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <CardHeader urgencyStyles={null} action={null} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontFamily: MONO,
            fontSize: "11px",
            color: "var(--fg-3)",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "var(--accent)",
              animation: "status-pulse 1.6s ease-in-out infinite",
            }}
          />
          Argus is analysing this incident…
        </div>
      </div>
    );
  }

  // ── Failed: LLM could not produce a usable reply at all ──
  if (status === "failed") {
    return (
      <div
        style={{
          border: "1px solid var(--sev-serious-dim)",
          background: "var(--bg-surface-1)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <CardHeader
          urgencyStyles={null}
          action={regenerateButton}
        />
        <div style={{ fontFamily: MONO, fontSize: "11px", color: "var(--sev-serious)" }}>
          Explanation could not be generated.
        </div>
      </div>
    );
  }

  // ── No explanation yet ──
  if (!explanation || !explanation.summary) {
    return (
      <div
        style={{
          border: "1px solid var(--border-default)",
          background: "var(--bg-surface-1)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <CardHeader urgencyStyles={null} action={regenerateButton} />
        <div style={{ fontFamily: MONO, fontSize: "11px", color: "var(--fg-4)" }}>
          No explanation yet.
        </div>
      </div>
    );
  }

  // ── Ready ──
  const urgency = URGENCY_STYLES[explanation.urgency] || URGENCY_STYLES.monitor;
  const UrgencyIcon = urgency.icon;
  const isFallback = explanation.source === "fallback";

  return (
    <div
      style={{
        border: "1px solid var(--border-default)",
        background: "var(--bg-surface-1)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      <CardHeader
        urgencyStyles={urgency}
        urgencyIcon={<UrgencyIcon size={10} />}
        action={regenerateButton}
      />

      <div>
        {sectionLabel("Summary")}
        {bodyText(explanation.summary)}
      </div>

      <div>
        {sectionLabel("Likely Cause")}
        {bodyText(explanation.likelyCause || "—")}
      </div>

      <div>
        {sectionLabel("Recommended Action")}
        {bodyText(explanation.recommendedAction || "—")}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: "9px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--fg-4)",
            border: "1px solid var(--border-hairline)",
            padding: "2px 8px",
          }}
          title={
            isFallback
              ? "Deterministic template built from stored model output (LLM unavailable)"
              : "Generated by the configured LLM provider"
          }
        >
          {isFallback ? "Auto-generated" : `LLM · ${explanation.model || explanation.provider || "provider"}`}
        </span>
        {explanation.generatedAt ? (
          <span style={{ fontFamily: MONO, fontSize: "9px", color: "var(--fg-4)" }}>
            {new Date(explanation.generatedAt).toLocaleString()}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function CardHeader({ urgencyStyles, urgencyIcon, action }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Sparkles size={12} style={{ color: "var(--accent)" }} />
        <span
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: "var(--fg-3)",
            fontWeight: 600,
          }}
        >
          Argus Explanation
        </span>
        {urgencyStyles ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontFamily: MONO,
              fontSize: "9px",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: urgencyStyles.color,
              border: `1px solid ${urgencyStyles.color}`,
              padding: "1px 6px",
            }}
          >
            {urgencyIcon}
            {urgencyStyles.label}
          </span>
        ) : null}
      </div>
      {action}
    </div>
  );
}

const ArgusExplanation = memo(ArgusExplanationBase);
export default ArgusExplanation;
