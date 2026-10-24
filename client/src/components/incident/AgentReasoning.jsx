"use client";

import { BrainCircuit, AlertTriangle } from "lucide-react";

export default function AgentReasoning({ analysis, reasoning, uncertainties = [], confidence = 0 }) {
  const modelUncertainties = analysis?.uncertainties || uncertainties;
  const hasUncertainties = modelUncertainties.length > 0;
  const isFallback = analysis?.source === "fallback";
  const paragraphs = [
    ["Assessment", analysis?.assessment],
    ["Key observations", analysis?.findings?.map((finding) => finding.detail).join(" ")],
    ["Likely cause", analysis?.likelyCause],
    ["Recommended actions", analysis?.recommendedActions?.join(" ")],
  ].filter(([, value]) => value);

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
          {analysis ? paragraphs.map(([label, value]) => (
            <span key={label} style={{ display: "block", marginBottom: "10px" }}>
              <strong style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: "10px", textTransform: "uppercase" }}>
                {label}: {" "}
              </strong>
              {value}
            </span>
          )) : reasoning}
        </p>
        {analysis ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.1em", color: "var(--fg-3)", textTransform: "uppercase" }}>
            SOURCE · {isFallback ? "FALLBACK" : "LLM"}
            {analysis.provider ? ` · ${analysis.provider}` : ""}
            {analysis.model ? ` · ${analysis.model}` : ""}
          </div>
        ) : null}
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
            {modelUncertainties.map((unc, idx) => {
              const isCoverageGap = unc.startsWith("Telemetry did not cover");
              return (
                <li key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <span style={{
                    width: "6px", height: "6px", borderRadius: "50%",
                    background: "var(--sev-unknown)", flexShrink: 0, marginTop: "6px",
                  }} />
                  <span style={{
                    fontSize: "13px", lineHeight: "var(--lh-snug)",
                    color: isCoverageGap ? "var(--sev-minor)" : "var(--fg-2)",
                    fontWeight: isCoverageGap ? 500 : 400,
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
