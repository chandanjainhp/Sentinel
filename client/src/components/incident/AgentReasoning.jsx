"use client";

import { BrainCircuit, AlertTriangle } from "lucide-react";

export default function AgentReasoning({ reasoning, uncertainties = [], confidence = 0 }) {
  const hasUncertainties = uncertainties.length > 0;

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Agent reasoning block */}
      <div style={{
        background: "var(--accent-deep)",
        border: "1px solid rgba(184,212,232,0.18)",
        padding: "24px",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          marginBottom: "12px",
        }}>
          <BrainCircuit size={14} color="var(--accent)" />
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: "10px",
            fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.14em", color: "var(--accent)",
          }}>
            Agent Reasoning
          </span>
        </div>
        <p style={{
          fontSize: "14px", lineHeight: "var(--lh-loose)",
          color: "var(--fg-1)", opacity: 0.9,
        }}>
          {reasoning}
        </p>
      </div>

      {/* Uncertainties block */}
      {hasUncertainties ? (
        <div style={{
          border: "1px solid rgba(232,154,43,0.3)",
          background: "var(--sev-minor-bg)",
          padding: "24px",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            marginBottom: "16px",
          }}>
            <AlertTriangle size={14} color="var(--sev-minor)" />
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "10px",
              fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.14em", color: "var(--sev-minor)",
            }}>
              Uncertainties Detected
            </span>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
            {uncertainties.map((unc, idx) => {
              const isDroneGap = unc.startsWith("Drone did not cover");
              return (
                <li key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <span style={{
                    width: "6px", height: "6px", borderRadius: "50%",
                    background: "var(--sev-unknown)", flexShrink: 0, marginTop: "6px",
                  }} />
                  <span style={{
                    fontSize: "13px", lineHeight: "var(--lh-snug)",
                    color: isDroneGap ? "var(--sev-minor)" : "var(--fg-2)",
                    fontWeight: isDroneGap ? 500 : 400,
                  }}>
                    {unc}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : confidence > 0.7 ? (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          padding: "10px 16px",
          border: "1px solid var(--sev-harmless-dim)",
          background: "var(--sev-harmless-bg)",
        }}>
          <span style={{
            width: "8px", height: "8px", borderRadius: "50%",
            background: "var(--sev-harmless)", flexShrink: 0,
          }} />
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: "10px",
            textTransform: "uppercase", letterSpacing: "0.12em",
            color: "var(--sev-harmless)",
          }}>
            No uncertainties — high confidence classification
          </span>
        </div>
      ) : null}
    </div>
  );
}
