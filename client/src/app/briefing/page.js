"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  useBriefing,
  useGenerateBriefing,
  useListBriefings,
  useUpdateBriefingSection,
  useApproveBriefing,
} from "@/hooks/useBriefing";
import { useAuthStore } from "@/store/authStore";
import { Calendar, Play, Edit2, Check, X, Clock, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

const MONO = "var(--font-mono)";
const SANS = "var(--font-sans)";

function useDefaultNightDate() {
  return useMemo(() => {
    if (process.env.NEXT_PUBLIC_SEED_NIGHT_DATE) return process.env.NEXT_PUBLIC_SEED_NIGHT_DATE;
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
}

function formatDateForDisplay(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusBadge({ status }) {
  const statusConfig = {
    draft: { color: "var(--sev-minor)", label: "Draft", bg: "var(--bg-surface-2)" },
    generating: { color: "var(--accent)", label: "Generating", bg: "var(--bg-surface-2)" },
    approved: { color: "var(--sev-harmless)", label: "Approved", bg: "var(--bg-surface-2)" },
    failed: { color: "var(--sev-serious)", label: "Failed", bg: "var(--bg-surface-2)" },
  };
  const config = statusConfig[status] || statusConfig.draft;
  return (
    <span style={{
      fontFamily: MONO,
      fontSize: "10px",
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: config.color,
      background: config.bg,
      padding: "4px 8px",
      borderRadius: "2px",
      border: `1px solid ${config.color}40`,
    }}>
      {config.label}
    </span>
  );
}

function StatTile({ label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <span style={{ fontFamily: MONO, fontSize: "10px", color: "var(--fg-4)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontFamily: SANS, fontSize: "20px", fontWeight: 500, color: "var(--fg-1)" }}>
        {value}
      </span>
    </div>
  );
}

function SectionHeader({ title, count }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginBottom: "8px",
    }}>
      <h3 style={{
        fontFamily: SANS,
        fontSize: "13px",
        fontWeight: 500,
        color: "var(--fg-1)",
        margin: 0,
      }}>
        {title}
      </h3>
      {count !== undefined && (
        <span style={{
          fontFamily: MONO,
          fontSize: "10px",
          color: "var(--fg-3)",
          padding: "2px 6px",
          background: "var(--bg-surface-2)",
          borderRadius: "2px",
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

function EmptySection({ message }) {
  return (
    <div style={{
      padding: "32px 24px",
      background: "var(--bg-surface-1)",
      border: "1px solid var(--border-default)",
      borderRadius: "4px",
      textAlign: "center",
    }}>
      <span style={{ fontFamily: SANS, fontSize: "13px", color: "var(--fg-4)", fontStyle: "italic" }}>
        {message}
      </span>
    </div>
  );
}

function SectionContent({ content, type }) {
  if (!content || (Array.isArray(content) && content.length === 0)) {
    const messages = {
      executive_summary: "No executive summary yet.",
      incidents: "No incidents recorded.",
      recommendations: "No recommendations.",
      anomalies: "No anomalies detected.",
      follow_up: "No follow-up actions.",
    };
    return <EmptySection message={messages[type] || "No content"} />;
  }

  if (typeof content === "string") {
    return (
      <div style={{
        padding: "20px 24px",
        background: "var(--bg-surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "4px",
        fontFamily: SANS,
        fontSize: "14px",
        lineHeight: 1.6,
        color: "var(--fg-2)",
        whiteSpace: "pre-wrap",
      }}>
        {content}
      </div>
    );
  }

  if (Array.isArray(content)) {
    return (
      <div style={{
        padding: "20px 24px",
        background: "var(--bg-surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "4px",
      }}>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
          {content.map((item, index) => {
            const text = typeof item === "string" ? item : item.summary || item.recommendedAction || JSON.stringify(item);
            return (
              <li key={index} style={{
                fontFamily: SANS,
                fontSize: "13px",
                color: "var(--fg-2)",
                lineHeight: 1.5,
                padding: "8px 12px",
                background: "var(--bg-surface-2)",
                borderRadius: "3px",
                borderLeft: "2px solid var(--accent)",
              }}>
                {text}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div style={{
      padding: "20px 24px",
      background: "var(--bg-surface-1)",
      border: "1px solid var(--border-default)",
      borderRadius: "4px",
      fontFamily: MONO,
      fontSize: "12px",
      color: "var(--fg-2)",
      whiteSpace: "pre-wrap",
    }}>
      {JSON.stringify(content, null, 2)}
    </div>
  );
}

function IncidentsTable({ incidents }) {
  if (!incidents || incidents.length === 0) {
    return <EmptySection message="No incidents recorded for this night." />;
  }

  const severityColor = (severity) => {
    const map = {
      critical: "var(--sev-serious)",
      warning: "var(--sev-minor)",
      serious: "var(--sev-serious)",
      minor: "var(--sev-minor)",
      harmless: "var(--sev-harmless)",
      uncertain: "var(--sev-minor)",
    };
    return map[severity] || "var(--fg-3)";
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{
        width: "100%",
        borderCollapse: "collapse",
        background: "var(--bg-surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "4px",
      }}>
        <thead>
          <tr style={{ background: "var(--bg-surface-2)" }}>
            {["Incident ID", "Title", "Machine", "Severity", "Status"].map((col) => (
              <th key={col} style={{
                padding: "10px 14px",
                textAlign: "left",
                fontFamily: MONO,
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
                borderBottom: "1px solid var(--border-hairline)",
              }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {incidents.map((inc, idx) => (
            <tr key={inc.incidentId || idx} style={{
              borderBottom: idx < incidents.length - 1 ? "1px solid var(--border-hairline)" : "none",
            }}>
              <td style={{ padding: "10px 14px", fontFamily: MONO, fontSize: "11px", color: "var(--fg-2)" }}>
                <Link href={`/incidents/${inc.incidentId}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                  {inc.incidentId || String(inc.id).substring(0, 8)}
                </Link>
              </td>
              <td style={{ padding: "10px 14px", fontFamily: SANS, fontSize: "13px", color: "var(--fg-1)" }}>
                {inc.title || "Unnamed Incident"}
              </td>
              <td style={{ padding: "10px 14px", fontFamily: SANS, fontSize: "12px", color: "var(--fg-2)" }}>
                {inc.machine || inc.assetId || "—"}
              </td>
              <td style={{ padding: "10px 14px" }}>
                <span style={{
                  fontFamily: MONO,
                  fontSize: "10px",
                  fontWeight: 600,
                  color: severityColor(inc.severity),
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}>
                  {inc.severity || "unknown"}
                </span>
              </td>
              <td style={{ padding: "10px 14px", fontFamily: MONO, fontSize: "10px", color: "var(--fg-3)" }}>
                {inc.status || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnomaliesTable({ anomalies }) {
  if (!anomalies || anomalies.length === 0) {
    return <EmptySection message="No anomalies detected for this night." />;
  }

  const severityColor = (severity) => {
    const map = {
      critical: "var(--sev-serious)",
      warning: "var(--sev-minor)",
      serious: "var(--sev-serious)",
      minor: "var(--sev-minor)",
      harmless: "var(--sev-harmless)",
    };
    return map[severity] || "var(--fg-3)";
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{
        width: "100%",
        borderCollapse: "collapse",
        background: "var(--bg-surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "4px",
      }}>
        <thead>
          <tr style={{ background: "var(--bg-surface-2)" }}>
            {["Machine", "Severity", "Anomaly Score", "Fault Type"].map((col) => (
              <th key={col} style={{
                padding: "10px 14px",
                textAlign: "left",
                fontFamily: MONO,
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
                borderBottom: "1px solid var(--border-hairline)",
              }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {anomalies.map((anom, idx) => (
            <tr key={anom.incidentId || idx} style={{
              borderBottom: idx < anomalies.length - 1 ? "1px solid var(--border-hairline)" : "none",
            }}>
              <td style={{ padding: "10px 14px", fontFamily: SANS, fontSize: "12px", color: "var(--fg-2)" }}>
                {anom.machine || "—"}
              </td>
              <td style={{ padding: "10px 14px" }}>
                <span style={{
                  fontFamily: MONO,
                  fontSize: "10px",
                  fontWeight: 600,
                  color: severityColor(anom.severity),
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}>
                  {anom.severity || "unknown"}
                </span>
              </td>
              <td style={{ padding: "10px 14px", fontFamily: MONO, fontSize: "11px", color: "var(--fg-2)" }}>
                {anom.anomalyScore !== null && anom.anomalyScore !== undefined ? anom.anomalyScore.toFixed(3) : "—"}
              </td>
              <td style={{ padding: "10px 14px", fontFamily: MONO, fontSize: "10px", color: "var(--fg-2)" }}>
                {anom.faultType || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SECTION_COMPONENTS = {
  executive_summary: SectionContent,
  incidents: IncidentsTable,
  recommendations: SectionContent,
  anomalies: AnomaliesTable,
  follow_up: SectionContent,
};

const SECTION_LABELS = {
  executive_summary: "Executive Summary",
  incidents: "Incidents",
  recommendations: "Recommendations",
  anomalies: "Anomalies",
  follow_up: "Follow-Up Actions",
};

function SectionDisplay({ section, briefing, canEdit, onEdit }) {
  const Component = SECTION_COMPONENTS[section.name] || SectionContent;
  const content = section.content;
  const count = Array.isArray(content) ? content.length : undefined;

  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <SectionHeader title={SECTION_LABELS[section.name] || section.name} count={count} />
        {canEdit && onEdit && (
          <button
            type="button"
            onClick={() => onEdit(section)}
            style={{
              fontFamily: MONO,
              fontSize: "10px",
              color: "var(--accent)",
              background: "none",
              border: "1px solid var(--border-default)",
              padding: "4px 10px",
              cursor: "pointer",
              borderRadius: "2px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <Edit2 size={12} /> Edit
          </button>
        )}
      </div>
      <Component content={content} type={section.name} />
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{
      padding: "48px 24px",
      textAlign: "center",
    }}>
      <div style={{ fontFamily: MONO, fontSize: "10px", color: "var(--fg-4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>
        Loading Briefing
      </div>
      <div style={{ fontFamily: SANS, fontSize: "13px", color: "var(--fg-3)" }}>
        <Clock size={16} style={{ display: "inline", marginRight: "8px" }} />
        Fetching briefing data...
      </div>
    </div>
  );
}

function EmptyBriefingState({ onGenerate, isGenerating }) {
  return (
    <div style={{
      padding: "64px 24px",
      textAlign: "center",
      background: "var(--bg-surface-1)",
      border: "1px solid var(--border-default)",
      borderRadius: "6px",
    }}>
      <div style={{ fontFamily: SANS, fontSize: "18px", fontWeight: 500, color: "var(--fg-1)", marginBottom: "8px" }}>
        No Briefing for This Night
      </div>
      <div style={{ fontFamily: SANS, fontSize: "13px", color: "var(--fg-3)", marginBottom: "20px", maxWidth: "420px", marginLeft: "auto", marginRight: "auto" }}>
        A Morning Operations Briefing compiles all overnight incidents, anomalies, and recommendations into a single report.
      </div>
      <button
        type="button"
        onClick={onGenerate}
        disabled={isGenerating}
        style={{
          fontFamily: MONO,
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--bg-base)",
          background: "var(--accent)",
          padding: "10px 20px",
          border: "1px solid var(--accent)",
          cursor: isGenerating ? "not-allowed" : "pointer",
          borderRadius: "2px",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          opacity: isGenerating ? 0.6 : 1,
        }}
      >
        {isGenerating ? <Clock size={14} /> : <Play size={14} />}
        {isGenerating ? "Generating..." : "Generate Briefing"}
      </button>
    </div>
  );
}

function EditSectionModal({ section, onClose, onSave, isSaving }) {
  const [content, setContent] = useState(() => {
    if (typeof section.content === "string") return section.content;
    if (Array.isArray(section.content)) return section.content.join("\n");
    return JSON.stringify(section.content, null, 2);
  });

  const handleSave = () => {
    if (content.trim() === "") {
      return;
    }
    onSave(content);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--bg-base)",
          border: "1px solid var(--border-default)",
          borderRadius: "6px",
          width: "100%",
          maxWidth: "800px",
          maxHeight: "80vh",
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-hairline)",
          }}
        >
          <h2
            style={{
              fontFamily: SANS,
              fontSize: "16px",
              fontWeight: 500,
              color: "var(--fg-1)",
              margin: 0,
            }}
          >
            Edit {SECTION_LABELS[section.name] || section.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--fg-3)",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: "20px" }}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{
              width: "100%",
              minHeight: "300px",
              fontFamily: MONO,
              fontSize: "12px",
              color: "var(--fg-1)",
              background: "var(--bg-surface-1)",
              border: "1px solid var(--border-default)",
              borderRadius: "4px",
              padding: "12px",
              resize: "vertical",
            }}
            placeholder="Enter section content..."
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            padding: "16px 20px",
            borderTop: "1px solid var(--border-hairline)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              fontFamily: MONO,
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
              background: "var(--bg-surface-2)",
              border: "1px solid var(--border-default)",
              padding: "8px 16px",
              cursor: "pointer",
              borderRadius: "2px",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !content.trim()}
            style={{
              fontFamily: MONO,
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--bg-base)",
              background: "var(--accent)",
              border: "1px solid var(--accent)",
              padding: "8px 16px",
              cursor: isSaving || !content.trim() ? "not-allowed" : "pointer",
              borderRadius: "2px",
              opacity: isSaving || !content.trim() ? 0.6 : 1,
            }}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BriefingPage() {
  const { user } = useAuthStore();
  const defaultNightDate = useDefaultNightDate();
  const [nightDate, setNightDate] = useState(defaultNightDate);
  const [editingSection, setEditingSection] = useState(null);

  const { data: briefingData, isLoading: isLoadingBriefing, refetch } = useBriefing(nightDate);
  const { data: briefingsList } = useListBriefings();

  const generateMutation = useGenerateBriefing();
  const updateSectionMutation = useUpdateBriefingSection();
  const approveMutation = useApproveBriefing();

  const briefing = briefingData?.briefing;
  const isApproved = briefing?.status === "approved";
  const isGenerating = briefing?.status === "generating";
  const canEdit = briefing && !isApproved && !isGenerating;
  const canApprove = briefing && briefing.status === "draft" && !isGenerating;

  const sections = briefing?.sections || [];

  const handleGenerate = useCallback(async () => {
    await generateMutation.mutateAsync(nightDate);
  }, [nightDate, generateMutation]);

  const handleEditSection = useCallback((section) => {
    setEditingSection(section);
  }, []);

  const handleSaveSection = useCallback(
    async (content) => {
      if (!editingSection || !briefing) return;
      await updateSectionMutation.mutateAsync({
        briefingId: briefing.briefingId || briefing._id,
        sectionName: editingSection.name,
        content,
      });
      setEditingSection(null);
    },
    [editingSection, briefing, updateSectionMutation]
  );

  const handleApprove = useCallback(async () => {
    if (!briefing) return;
    await approveMutation.mutateAsync(briefing.briefingId || briefing._id);
  }, [briefing, approveMutation]);

  const handleCloseModal = useCallback(() => {
    setEditingSection(null);
  }, []);

  const decrementDate = useCallback(() => {
    const d = new Date(`${nightDate}T00:00:00`);
    d.setDate(d.getDate() - 1);
    setNightDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }, [nightDate]);

  const incrementDate = useCallback(() => {
    const d = new Date(`${nightDate}T00:00:00`);
    d.setDate(d.getDate() + 1);
    setNightDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }, [nightDate]);

  useEffect(() => {
    refetch();
  }, [nightDate, refetch]);

  if (!user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-base)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
        }}
      >
        <div style={{ fontFamily: SANS, fontSize: "14px", color: "var(--fg-3)" }}>
          Please sign in to view briefings.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          height: "48px",
          background: "rgba(7,9,12,0.94)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--border-default)",
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          gap: "20px",
          zIndex: 100,
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: MONO,
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--fg-2)",
            textDecoration: "none",
          }}
        >
          Briefing
        </Link>
        <span
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            color: "var(--fg-4)",
            letterSpacing: "0.1em",
          }}
        >
          Morning Operations Report
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <Link
            href="/incidents"
            style={{
              fontFamily: MONO,
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              textDecoration: "none",
              color: "var(--fg-3)",
              padding: "6px 14px",
              border: "1px solid var(--border-default)",
            }}
          >
            View Incidents
          </Link>
          <Link
            href="/overview"
            style={{
              fontFamily: MONO,
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              textDecoration: "none",
              color: "var(--fg-3)",
              padding: "6px 14px",
              border: "1px solid var(--border-default)",
            }}
          >
            Overview
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          padding: "24px 32px",
          maxWidth: "1400px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* Date selector and controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "24px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={decrementDate}
              style={{
                padding: "6px 10px",
                background: "var(--bg-surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--fg-2)",
                cursor: "pointer",
                borderRadius: "2px",
                fontFamily: MONO,
                fontSize: "12px",
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <div
              style={{
                padding: "6px 12px",
                background: "var(--bg-surface-1)",
                border: "1px solid var(--border-default)",
                borderRadius: "4px",
                fontFamily: MONO,
                fontSize: "12px",
                color: "var(--fg-1)",
              }}
            >
              {formatDateForDisplay(nightDate)}
            </div>
            <button
              type="button"
              onClick={incrementDate}
              style={{
                padding: "6px 10px",
                background: "var(--bg-surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--fg-2)",
                cursor: "pointer",
                borderRadius: "2px",
                fontFamily: MONO,
                fontSize: "12px",
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {briefing && <StatusBadge status={briefing.status} />}

          <div style={{ flex: 1 }} />

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {!briefing && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generateMutation.isPending}
                style={{
                  fontFamily: MONO,
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--bg-base)",
                  background: "var(--accent)",
                  padding: "8px 16px",
                  border: "1px solid var(--accent)",
                  cursor: generateMutation.isPending ? "not-allowed" : "pointer",
                  borderRadius: "2px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  opacity: generateMutation.isPending ? 0.6 : 1,
                }}
              >
                {generateMutation.isPending ? <Clock size={14} /> : <Play size={14} />}
                {generateMutation.isPending ? "Generating..." : "Generate Briefing"}
              </button>
            )}

            {canApprove && (
              <button
                type="button"
                onClick={handleApprove}
                disabled={approveMutation.isPending}
                style={{
                  fontFamily: MONO,
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--bg-base)",
                  background: "var(--sev-harmless)",
                  padding: "8px 16px",
                  border: "1px solid var(--sev-harmless)",
                  cursor: approveMutation.isPending ? "not-allowed" : "pointer",
                  borderRadius: "2px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  opacity: approveMutation.isPending ? 0.6 : 1,
                }}
              >
                <Check size={14} /> Approve
              </button>
            )}

            {briefing && isApproved && (
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: "11px",
                  color: "var(--sev-harmless)",
                  padding: "8px 16px",
                  border: "1px solid var(--border-default)",
                }}
              >
                Briefing Approved
              </span>
            )}
          </div>
        </div>

        {/* Metadata */}
        {briefing && (
          <div
            style={{
              marginBottom: "24px",
              padding: "12px 16px",
              background: "var(--bg-surface-1)",
              border: "1px solid var(--border-default)",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              gap: "20px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: "10px",
                color: "var(--fg-4)",
                letterSpacing: "0.05em",
              }}
            >
              Generated: {new Date(briefing.generatedAt).toLocaleString()}
            </span>
            {briefing.metadata?.counts && (
              <>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: "10px",
                    color: "var(--fg-4)",
                    letterSpacing: "0.05em",
                  }}
                >
                  {briefing.metadata.counts.incidents} Incidents
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: "10px",
                    color: "var(--fg-4)",
                    letterSpacing: "0.05em",
                  }}
                >
                  {briefing.metadata.counts.investigations} Investigations
                </span>
              </>
            )}
            {briefing.metadata?.generator && (
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: "10px",
                  color: "var(--fg-4)",
                  letterSpacing: "0.05em",
                }}
              >
                {briefing.metadata.generator}
              </span>
            )}
          </div>
        )}

        {/* Loading State */}
        {isLoadingBriefing && !briefing && <LoadingState />}

        {/* Empty State */}
        {!isLoadingBriefing && !briefing && !generateMutation.isPending && (
          <EmptyBriefingState onGenerate={handleGenerate} isGenerating={generateMutation.isPending} />
        )}

        {/* Generating State */}
        {generateMutation.isPending && !briefing && (
          <div
            style={{
              padding: "64px 24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontFamily: SANS, fontSize: "18px", fontWeight: 500, color: "var(--fg-1)", marginBottom: "8px" }}>
              Generating Briefing
            </div>
            <div style={{ fontFamily: SANS, fontSize: "13px", color: "var(--fg-3)" }}>
              <Clock size={16} style={{ display: "inline", marginRight: "8px" }} />
              Compiling overnight incidents and generating report...
            </div>
          </div>
        )}

        {/* Briefing Content */}
        {briefing && !isLoadingBriefing && (
          <div
            style={{
              display: "grid",
              gap: "24px",
            }}
          >
            {sections.map((section) => (
              <SectionDisplay
                key={section.name}
                section={section}
                briefing={briefing}
                canEdit={canEdit}
                onEdit={handleEditSection}
              />
            ))}
          </div>
        )}

        {/* Approval timestamp */}
        {briefing && isApproved && (
          <div
            style={{
              marginTop: "24px",
              padding: "12px 16px",
              background: "var(--bg-surface-1)",
              border: "1px solid var(--border-default)",
              borderRadius: "4px",
              textAlign: "center",
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: "10px",
                color: "var(--sev-harmless)",
                letterSpacing: "0.05em",
              }}
            >
              Approved at {new Date(briefing.approvedAt).toLocaleString()}
            </span>
          </div>
        )}

        {/* Error States */}
        {generateMutation.error && (
          <div
            style={{
              marginTop: "24px",
              padding: "16px 20px",
              background: "rgba(255, 0, 0, 0.05)",
              border: "1px solid var(--sev-serious)",
              borderRadius: "4px",
              color: "var(--sev-serious)",
              fontFamily: SANS,
              fontSize: "13px",
            }}
          >
            <AlertTriangle size={16} style={{ display: "inline", marginRight: "8px" }} />
            Failed to generate briefing: {generateMutation.error.message}
          </div>
        )}

        {updateSectionMutation.error && (
          <div
            style={{
              marginTop: "24px",
              padding: "16px 20px",
              background: "rgba(255, 0, 0, 0.05)",
              border: "1px solid var(--sev-serious)",
              borderRadius: "4px",
              color: "var(--sev-serious)",
              fontFamily: SANS,
              fontSize: "13px",
            }}
          >
            <AlertTriangle size={16} style={{ display: "inline", marginRight: "8px" }} />
            Failed to update section: {updateSectionMutation.error.message}
          </div>
        )}

        {approveMutation.error && (
          <div
            style={{
              marginTop: "24px",
              padding: "16px 20px",
              background: "rgba(255, 0, 0, 0.05)",
              border: "1px solid var(--sev-serious)",
              borderRadius: "4px",
              color: "var(--sev-serious)",
              fontFamily: SANS,
              fontSize: "13px",
            }}
          >
            <AlertTriangle size={16} style={{ display: "inline", marginRight: "8px" }} />
            Failed to approve briefing: {approveMutation.error.message}
          </div>
        )}
      </main>

      {/* Edit Modal */}
      {editingSection && (
        <EditSectionModal
          section={editingSection}
          onClose={handleCloseModal}
          onSave={handleSaveSection}
          isSaving={updateSectionMutation.isPending}
        />
      )}
    </div>
  );
}
