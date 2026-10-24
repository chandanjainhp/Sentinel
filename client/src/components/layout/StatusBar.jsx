"use client";

export default function StatusBar({
  jobStatus,
  resolvedIncidents,
  totalIncidents,
  escalationCount,
  diagnosticMessage,
  onReviewBriefing,
}) {
  const pct = totalIncidents > 0 ? Math.round((resolvedIncidents / totalIncidents) * 100) : 0;
  const isLive     = jobStatus === "running";
  const isComplete = jobStatus === "complete";
  const isFailed   = jobStatus === "failed";

  return (
    <div style={{
      height: "44px", flexShrink: 0,
      position: "relative",
      background: "var(--bg-surface-1)",
      borderBottom: "1px solid var(--border-default)",
    }}>

      {/* ── Content row ────────────────────────────────── */}
      <div style={{
        height: "100%", display: "flex",
        alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", gap: "12px",
      }}>

        {/* Left — status + progress text */}
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          flex: 1, minWidth: 0,
          fontFamily: "var(--font-mono)",
        }}>

          {/* Diagnostic takes priority */}
          {diagnosticMessage ? (
            <>
              <span style={{ color: "var(--sev-minor)", fontSize: "12px", lineHeight: 1 }}>⚠</span>
              <span style={{
                fontSize: "11px", color: "var(--sev-minor)",
                letterSpacing: "0.06em", textTransform: "uppercase",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {diagnosticMessage}
              </span>
            </>
          ) : (
            <>
              {/* Status badge */}
              {jobStatus === "idle" && (
                <span style={{ fontSize: "11px", color: "var(--fg-4)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Checking overnight events
                </span>
              )}

              {jobStatus === "connecting" && (
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{
                    width: "6px", height: "6px", borderRadius: "50%",
                    background: "var(--accent)",
                    boxShadow: "0 0 8px rgba(184,212,232,.55)",
                    animation: "status-pulse 1.6s ease-in-out infinite",
                  }} />
                  <span style={{ fontSize: "11px", color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Connecting to agent
                  </span>
                </span>
              )}

              {isLive && (
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{
                    width: "6px", height: "6px", borderRadius: "50%",
                    background: "var(--accent)",
                    boxShadow: "0 0 8px rgba(184,212,232,.55)",
                    animation: "status-pulse 1.6s ease-in-out infinite",
                  }} />
                  <span style={{ fontSize: "11px", color: "var(--accent)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Agent · Live
                  </span>
                </span>
              )}

              {isComplete && (
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--sev-harmless)" }} />
                  <span style={{ fontSize: "11px", color: "var(--sev-harmless)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Complete
                  </span>
                </span>
              )}

              {isFailed && (
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--sev-serious)" }} />
                  <span style={{ fontSize: "11px", color: "var(--sev-serious)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Investigation error
                  </span>
                </span>
              )}

              {/* Progress readout */}
              {totalIncidents > 0 && (
                <>
                  <span style={{ color: "var(--border-strong)", fontSize: "14px", userSelect: "none", lineHeight: 1 }}>·</span>
                  <span style={{ fontSize: "11px", letterSpacing: "0.04em" }}>
                    <span style={{ color: "var(--fg-1)", fontVariantNumeric: "tabular-nums" }}>
                      {resolvedIncidents}
                    </span>
                    <span style={{ color: "var(--fg-4)" }}>/{totalIncidents}</span>
                    <span style={{ color: "var(--fg-4)", marginLeft: "8px" }}>
                      incidents · {pct}%
                    </span>
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {/* Right — escalations + CTA */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {escalationCount > 0 && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 600,
              letterSpacing: "0.1em", textTransform: "uppercase",
              padding: "4px 10px",
              background: "var(--sev-serious-bg)",
              border: "1px solid var(--sev-serious-dim)",
              color: "var(--sev-serious)",
            }}>
              <span style={{
                width: "5px", height: "5px", borderRadius: "50%",
                background: "var(--sev-serious)",
                animation: "status-pulse 1.2s ease-in-out infinite",
              }} />
              {escalationCount} {escalationCount === 1 ? "escalation" : "escalations"}
            </span>
          )}

          {isComplete && (
            <button
              onClick={onReviewBriefing}
              style={{
                fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 600,
                letterSpacing: "0.1em", textTransform: "uppercase",
                padding: "5px 16px",
                background: "var(--accent-deep)",
                border: "1px solid var(--accent-dim)",
                color: "var(--accent)",
                cursor: "pointer", borderRadius: 0,
                transition: "background 120ms, border-color 120ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--accent)";
                e.currentTarget.style.color = "var(--bg-base)";
                e.currentTarget.style.borderColor = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--accent-deep)";
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.borderColor = "var(--accent-dim)";
              }}
            >
              Review Briefing →
            </button>
          )}
        </div>
      </div>

      {/* ── Progress bar pinned to the bottom edge ─────── */}
      {totalIncidents > 0 && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: "2px",
          background: "var(--border-default)",
        }}>
          <div style={{
            height: "100%",
            width: `${pct}%`,
            background: isComplete ? "var(--sev-harmless)" : "var(--accent)",
            boxShadow: isComplete ? "none" : "0 0 6px rgba(184,212,232,0.4)",
            transition: "width 500ms var(--ease-out)",
          }} />
        </div>
      )}
    </div>
  );
}
