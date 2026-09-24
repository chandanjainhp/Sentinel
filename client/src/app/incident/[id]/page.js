"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useIncidentById, useIncidentEvidenceGraph } from "@/hooks/useIncidents";
import { useAuthStore } from "@/store/authStore";
import EvidenceChain from "@/components/incident/EvidenceChain";
import AgentReasoning from "@/components/incident/AgentReasoning";
import { getSeverity } from "@/lib/severity";


function LoadingSkeleton() {
  const block = (h, w = "100%", mt = 0) => ({
    height: h, width: w,
    background: "var(--bg-surface-3)",
    marginTop: mt,
    borderRadius: "2px",
  });

  return (
    <div style={{
      position: "fixed", top: "56px", left: 0, right: 0, bottom: 0,
      display: "flex", flexDirection: "row",
      background: "var(--bg-base)",
    }}>
      <div style={{ flex: 1, padding: "32px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={block("12px", "128px")} />
        <div style={block("32px", "380px", 16)} />
        <div style={block("20px", "200px")} />
        <div style={{ ...block("100%"), marginTop: 32, flex: 1 }} />
      </div>
      <div style={{
        width: "380px", flexShrink: 0,
        borderLeft: "1px solid var(--border-default)",
        background: "var(--bg-surface-2)",
        padding: "24px", display: "flex", flexDirection: "column", gap: "16px",
      }}>
        <div style={block("256px")} />
        <div style={{ ...block("100%"), flex: 1 }} />
      </div>
    </div>
  );
}

export default function IncidentDetailView({ params }) {
  const { id } = use(params);

  const { data: incidentResponse, isLoading: isLoadingIncident } = useIncidentById(id);
  const { data: evidenceGraphResponse, isLoading: isLoadingGraph } = useIncidentEvidenceGraph(id);

  if (isLoadingIncident || isLoadingGraph) {
    return <LoadingSkeleton />;
  }

  const incident = incidentResponse?.data || incidentResponse || {};
  const evidenceGraph = evidenceGraphResponse?.data || evidenceGraphResponse || {};

  const title = incident.title || incident.description || "Unidentified Alert Sequence";
  const severity = incident.severity || "uncertain";
  const sev = getSeverity(severity);
  const sevStyle = { border: sev.dim, color: sev.token, background: sev.bg, label: sev.label };

  const confidence =
    incident?.investigationId?.classification?.confidence ||
    evidenceGraph?.classification?.confidence ||
    0;

  const reasoning =
    incident?.investigationId?.classification?.reasoning ||
    evidenceGraph?.classification?.reasoning ||
    "No reasoning attached by agent.";

  const uncertainties =
    incident?.investigationId?.classification?.uncertainties ||
    evidenceGraph?.classification?.uncertainties ||
    [];

  const classification = {
    ...(evidenceGraph.classification || {}),
    ...(incident.investigationId?.classification || {}),
    confidence,
    reasoning,
    uncertainties,
  };

  const confidencePercent = Math.round((confidence || 0) * 100);

  return (
    <div style={{
      position: "fixed", top: "56px", left: 0, right: 0, bottom: 0,
      display: "flex", flexDirection: "row",
      background: "var(--bg-base)",
    }}>

      {/* ── Left: main content ──────────────────────────── */}
      <div style={{
        flex: 1, overflowY: "auto",
        padding: "32px", display: "flex", flexDirection: "column",
      }}>

        {/* Breadcrumb header */}
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          marginBottom: "12px",
          fontFamily: "var(--font-mono)", fontSize: "10px",
          letterSpacing: "0.12em", textTransform: "uppercase",
        }}>
          <span style={{ color: "var(--fg-3)" }}>Incidents</span>
          <span style={{ color: "var(--fg-4)" }}>/</span>
          <span style={{ color: "var(--fg-1)" }}>Incident</span>
        </div>

        <Link
          href="/incidents"
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            fontFamily: "var(--font-mono)", fontSize: "10px",
            textTransform: "uppercase", letterSpacing: "0.14em",
            color: "var(--fg-4)", textDecoration: "none",
            marginBottom: "32px",
            transition: "color 120ms",
          }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--fg-1)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--fg-4)"}
        >
          <ArrowLeft size={12} />
          Back to Incidents
        </Link>

        <h1 style={{
          fontSize: "var(--text-2xl)", fontWeight: 500,
          color: "var(--fg-1)", lineHeight: "var(--lh-tight)",
          marginBottom: "16px", letterSpacing: "var(--tracking-tight)",
        }}>
          {title}
        </h1>

        {/* Severity badge + confidence bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: "24px",
          marginBottom: "48px", flexWrap: "wrap",
        }}>
          <span style={{
            padding: "3px 12px",
            fontFamily: "var(--font-mono)", fontSize: "10px",
            textTransform: "uppercase", letterSpacing: "0.12em",
            border: `1px solid ${sevStyle.border}`,
            color: sevStyle.color,
            background: sevStyle.background,
            display: "inline-flex", alignItems: "center", gap: "6px",
          }}>
            <sev.icon size={12} aria-hidden="true" />
            {sevStyle.label}
          </span>

          <div style={{
            display: "flex", alignItems: "center", gap: "12px",
            padding: "4px 16px",
            background: "var(--bg-surface-2)",
            border: "1px solid var(--border-default)",
          }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "10px",
              textTransform: "uppercase", letterSpacing: "0.12em",
              color: "var(--fg-4)",
            }}>
              Confidence
            </span>
            <div style={{
              height: "4px", width: "96px",
              background: "var(--bg-surface-3)",
              borderRadius: "2px", overflow: "hidden", position: "relative",
            }}>
              <div style={{
                position: "absolute", top: 0, left: 0, height: "100%",
                width: `${confidencePercent}%`,
                background: confidencePercent > 80 ? "var(--accent)" : "var(--sev-minor)",
                borderRadius: "2px",
                transition: "width 400ms var(--ease-out)",
              }} />
            </div>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "11px",
              color: "var(--fg-1)", fontVariantNumeric: "tabular-nums",
            }}>
              {confidencePercent}%
            </span>
          </div>
        </div>

        {/* Evidence Chain */}
        <section style={{ width: "100%", marginBottom: "48px" }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "11px",
            textTransform: "uppercase", letterSpacing: "0.14em",
            color: "var(--fg-1)", fontWeight: 600,
            borderBottom: "1px solid var(--border-hairline)",
            paddingBottom: "8px", marginBottom: "24px",
          }}>
            Evidence Chain
          </div>
          <EvidenceChain steps={evidenceGraph.steps || []} classification={classification} />
        </section>

        {/* Agent Reasoning */}
        <section style={{ width: "100%", marginBottom: "48px" }}>
          <AgentReasoning
            reasoning={reasoning}
            uncertainties={uncertainties}
            confidence={confidence}
          />
        </section>
      </div>

      {/* ── Right: sidebar ──────────────────────────────── */}
      <aside aria-label="Investigation detail" style={{
        width: "380px", flexShrink: 0,
        borderLeft: "1px solid var(--border-default)",
        background: "var(--bg-surface-2)",
        display: "flex", flexDirection: "column",
        overflowY: "auto", padding: "24px", gap: "24px",
      }}>
        <div style={{
          background: "var(--bg-surface-1)",
          border: "1px solid var(--border-default)",
          padding: "16px",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "10px",
            textTransform: "uppercase", letterSpacing: "0.14em",
            color: "var(--fg-3)", marginBottom: "12px",
          }}>
            Project Context
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--fg-1)" }}>
            {incident.projectContext?.workPackageId || "—"}
          </div>
          {incident.projectContext?.assetId && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--fg-3)", marginTop: "6px" }}>
              Asset · {incident.projectContext.assetId}
            </div>
          )}
        </div>

        {/* Involved Entities */}
        <div style={{
          background: "var(--bg-surface-1)",
          border: "1px solid var(--border-default)",
          padding: "16px",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "10px",
            textTransform: "uppercase", letterSpacing: "0.14em",
            color: "var(--fg-3)", marginBottom: "12px",
          }}>
            Involved Entities
          </div>
          {(incident.entities || []).length > 0 ? (
            incident.entities.map((ent, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: i < incident.entities.length - 1
                  ? "1px solid var(--border-hairline)" : "none",
                fontSize: "12px",
              }}>
                <span style={{ color: "var(--fg-2)" }}>{ent.type}</span>
                <span style={{ color: "var(--fg-4)", fontFamily: "var(--font-mono)" }}>{ent.id}</span>
              </div>
            ))
          ) : (
            <span style={{
              fontSize: "12px", color: "var(--fg-4)",
              fontStyle: "italic",
            }}>
              No specific entities detected
            </span>
          )}
        </div>

        {/* Raw Events */}
        <div style={{
          background: "var(--bg-surface-1)",
          border: "1px solid var(--border-default)",
          padding: "16px",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "10px",
            textTransform: "uppercase", letterSpacing: "0.14em",
            color: "var(--fg-3)", marginBottom: "12px",
          }}>
            Raw Events
          </div>
          {(incident.rawEvents || []).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {incident.rawEvents.map((evt, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: "10px",
                    color: "var(--fg-4)", flexShrink: 0, marginTop: "2px",
                  }}>
                    {evt.time}
                  </span>
                  <p style={{
                    fontSize: "12px", color: "var(--fg-2)",
                    lineHeight: "var(--lh-snug)", margin: 0,
                  }}>
                    {evt.description}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: "12px", color: "var(--fg-4)" }}>
              No raw logs attached
            </span>
          )}
        </div>
      </aside>
    </div>
  );
}
