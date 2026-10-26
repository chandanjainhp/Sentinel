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
import { Calendar, Play, Edit2, Check, X, Clock, AlertTriangle, ChevronLeft, ChevronRight, Search, FileText, Filter, RefreshCw } from "lucide-react";

const MONO = "var(--font-mono)";
const SANS = "var(--font-sans)";

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

function getBriefingRows(payload) {
  // The list hook's implementation is not included with this page. Accept the
  // common response envelopes while keeping the original hook as the source.
  const candidates = Array.isArray(payload)
    ? payload
    : payload?.briefings ?? payload?.items ?? payload?.results ?? payload?.data?.briefings ?? payload?.data?.items ?? payload?.data ?? [];
  if (!Array.isArray(candidates)) return [];

  return candidates.map((item) => {
    const rawDate = item?.nightDate ?? item?.date ?? item?.briefingDate ?? item?.reportDate ?? item?.night_date;
    const date = typeof rawDate === "string" ? rawDate.slice(0, 10) : "";
    return {
      ...item,
      _date: date,
      _status: String(item?.status ?? item?.state ?? "draft").toLowerCase(),
      _id: item?.briefingId ?? item?._id ?? item?.id ?? date,
      _counts: item?.metadata?.counts ?? item?.counts ?? {},
    };
  }).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item._date));
}

function formatBriefingListDate(dateString) {
  if (!dateString) return "Date unavailable";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function BriefingPage() {
  const { user } = useAuthStore();
  // Open the requested report initially; date navigation remains available.
  const [nightDate, setNightDate] = useState("2026-10-20");
  const [editingSection, setEditingSection] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: briefingData, isLoading: isLoadingBriefing, refetch } = useBriefing(nightDate);
  const { data: briefingsList, isLoading: isLoadingList, refetch: refetchList } = useListBriefings();

  const generateMutation = useGenerateBriefing();
  const updateSectionMutation = useUpdateBriefingSection();
  const approveMutation = useApproveBriefing();

  const briefing = briefingData?.briefing;
  const isApproved = briefing?.status === "approved";
  const isGenerating = briefing?.status === "generating";
  const canEdit = briefing && !isApproved && !isGenerating;
  const canApprove = briefing && briefing.status === "draft" && !isGenerating;
  const sections = briefing?.sections || [];

  const allBriefings = useMemo(() => {
    const rows = getBriefingRows(briefingsList);
    // If the list endpoint omits the currently loaded report, include its
    // known metadata so the active selection remains visible in the library.
    if (briefing && !rows.some((row) => row._date === nightDate)) {
      rows.push({
        ...briefing,
        _date: nightDate,
        _status: String(briefing.status || "draft").toLowerCase(),
        _id: briefing.briefingId || briefing._id || nightDate,
        _counts: briefing.metadata?.counts || {},
      });
    }
    return rows.sort((a, b) => b._date.localeCompare(a._date));
  }, [briefingsList, briefing, nightDate]);

  const filteredBriefings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allBriefings.filter((row) => {
      const matchesStatus = statusFilter === "all" || row._status === statusFilter;
      const matchesQuery = !query || [row._date, formatBriefingListDate(row._date), row.title, row.name, row.summary, row._status]
        .some((value) => String(value ?? "").toLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
  }, [allBriefings, searchQuery, statusFilter]);

  const statusCounts = useMemo(() => ({
    total: allBriefings.length,
    approved: allBriefings.filter((row) => row._status === "approved").length,
    draft: allBriefings.filter((row) => row._status === "draft").length,
    failed: allBriefings.filter((row) => row._status === "failed").length,
  }), [allBriefings]);

  const handleGenerate = useCallback(async () => {
    await generateMutation.mutateAsync(nightDate);
    await Promise.all([refetch(), refetchList?.()]);
  }, [nightDate, generateMutation, refetch, refetchList]);

  const handleEditSection = useCallback((section) => setEditingSection(section), []);

  const handleSaveSection = useCallback(async (content) => {
    if (!editingSection || !briefing) return;
    await updateSectionMutation.mutateAsync({
      briefingId: briefing.briefingId || briefing._id,
      sectionName: editingSection.name,
      content,
    });
    setEditingSection(null);
    await refetch();
  }, [editingSection, briefing, updateSectionMutation, refetch]);

  const handleApprove = useCallback(async () => {
    if (!briefing) return;
    await approveMutation.mutateAsync(briefing.briefingId || briefing._id);
    await Promise.all([refetch(), refetchList?.()]);
  }, [briefing, approveMutation, refetch, refetchList]);

  const handleCloseModal = useCallback(() => setEditingSection(null), []);

  const shiftDate = useCallback((amount) => {
    const d = new Date(`${nightDate}T00:00:00`);
    d.setDate(d.getDate() + amount);
    setNightDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }, [nightDate]);

  useEffect(() => {
    refetch();
  }, [nightDate, refetch]);

  if (!user) {
    return <div style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
      <div style={{ fontFamily: SANS, fontSize: "14px", color: "var(--fg-3)" }}>Please sign in to view briefings.</div>
    </div>;
  }

  const panelStyle = { background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", borderRadius: "6px" };
  const smallLabelStyle = { fontFamily: MONO, fontSize: "10px", color: "var(--fg-4)", letterSpacing: "0.08em", textTransform: "uppercase" };
  const actionButtonStyle = { fontFamily: MONO, fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fg-2)", background: "var(--bg-surface-1)", border: "1px solid var(--border-default)", padding: "8px 12px", cursor: "pointer", borderRadius: "3px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--fg-1)", display: "flex", flexDirection: "column" }}>
      <header style={{ position: "sticky", top: 0, height: "52px", flexShrink: 0, background: "rgba(7,9,12,0.94)", backdropFilter: "blur(14px)", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", padding: "0 28px", gap: "18px", zIndex: 100 }}>
        <Link href="/" style={{ fontFamily: MONO, fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--fg-1)", textDecoration: "none" }}>Briefing Library</Link>
        <span style={{ ...smallLabelStyle, borderLeft: "1px solid var(--border-default)", paddingLeft: "18px" }}>Morning Operations Report</span>
        <div style={{ flex: 1 }} />
        <Link href="/incidents" style={{ ...actionButtonStyle, textDecoration: "none" }}>View Incidents</Link>
        <Link href="/overview" style={{ ...actionButtonStyle, textDecoration: "none" }}>Overview</Link>
      </header>

      <main style={{ width: "100%", maxWidth: "1600px", margin: "0 auto", padding: "26px 28px 40px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "22px" }}>
          <div>
            <div style={{ ...smallLabelStyle, marginBottom: "8px" }}>Operations / Reports</div>
            <h1 style={{ fontFamily: SANS, fontSize: "26px", lineHeight: 1.2, fontWeight: 600, letterSpacing: "-0.03em", margin: 0 }}>Briefing Library</h1>
            <p style={{ fontFamily: SANS, fontSize: "13px", color: "var(--fg-3)", margin: "8px 0 0" }}>Browse, review, and manage daily overnight briefings.</p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => { refetch(); refetchList?.(); }} style={actionButtonStyle}><RefreshCw size={13} /> Refresh</button>
            {!briefing && <button type="button" onClick={handleGenerate} disabled={generateMutation.isPending} style={{ ...actionButtonStyle, background: "var(--accent)", color: "var(--bg-base)", borderColor: "var(--accent)", opacity: generateMutation.isPending ? 0.6 : 1 }}><Play size={13} /> {generateMutation.isPending ? "Generating..." : "Generate briefing"}</button>}
            {canApprove && <button type="button" onClick={handleApprove} disabled={approveMutation.isPending} style={{ ...actionButtonStyle, background: "var(--sev-harmless)", color: "var(--bg-base)", borderColor: "var(--sev-harmless)" }}><Check size={13} /> {approveMutation.isPending ? "Approving..." : "Approve report"}</button>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginBottom: "20px" }}>
          {[{ label: "Total briefings", value: isLoadingList ? "—" : statusCounts.total, icon: FileText }, { label: "Approved", value: isLoadingList ? "—" : statusCounts.approved, icon: Check }, { label: "Awaiting review", value: isLoadingList ? "—" : statusCounts.draft, icon: Clock }].map((stat) => {
            const Icon = stat.icon;
            return <div key={stat.label} style={{ ...panelStyle, padding: "15px 18px", display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={{ width: "34px", height: "34px", display: "grid", placeItems: "center", borderRadius: "5px", background: "var(--bg-surface-2)", color: "var(--fg-3)" }}><Icon size={16} /></div>
              <div><div style={smallLabelStyle}>{stat.label}</div><div style={{ fontFamily: SANS, fontSize: "23px", fontWeight: 600, marginTop: "3px" }}>{stat.value}</div></div>
            </div>;
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", alignItems: "start", gap: "22px" }}>
          <section style={{ ...panelStyle, overflow: "hidden" }}>
            <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--border-hairline)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <div><h2 style={{ fontFamily: SANS, fontSize: "17px", fontWeight: 600, margin: 0 }}>Choose a briefing</h2><p style={{ fontFamily: SANS, fontSize: "12px", color: "var(--fg-3)", margin: "5px 0 0" }}>Select any report to load its full details below.</p></div>
                <span style={{ ...smallLabelStyle, padding: "4px 7px", border: "1px solid var(--border-default)", borderRadius: "3px" }}>{filteredBriefings.length} reports</span>
              </div>
              <div style={{ position: "relative", marginBottom: "10px" }}>
                <Search size={14} style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)" }} />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search briefings by date or status..." aria-label="Search briefings" style={{ width: "100%", boxSizing: "border-box", padding: "12px 12px 12px 34px", background: "var(--bg-base)", border: "1px solid var(--border-default)", borderRadius: "4px", color: "var(--fg-1)", fontFamily: SANS, fontSize: "12px", outline: "none" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><Filter size={13} color="var(--fg-4)" /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter briefings by status" style={{ flex: 1, padding: "8px 9px", background: "var(--bg-base)", border: "1px solid var(--border-default)", borderRadius: "4px", color: "var(--fg-2)", fontFamily: SANS, fontSize: "12px" }}><option value="all">All statuses</option><option value="draft">Draft</option><option value="generating">Generating</option><option value="approved">Approved</option><option value="failed">Failed</option></select></div>
            </div>
            <div style={{ padding: "14px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(245px, 1fr))", gap: "10px" }}>
              {isLoadingList && <div style={{ padding: "24px 18px", gridColumn: "1 / -1", fontFamily: SANS, fontSize: "12px", color: "var(--fg-3)" }}>Loading briefing list...</div>}
              {!isLoadingList && filteredBriefings.length === 0 && <div style={{ padding: "28px 18px", textAlign: "center", gridColumn: "1 / -1" }}><FileText size={22} color="var(--fg-4)" style={{ marginBottom: "10px" }} /><div style={{ fontFamily: SANS, fontSize: "13px", color: "var(--fg-2)" }}>No matching briefings</div><div style={{ fontFamily: SANS, fontSize: "12px", color: "var(--fg-4)", marginTop: "5px" }}>Try another search or status filter.</div></div>}
              {filteredBriefings.map((row) => {
                const active = row._date === nightDate;
                const status = row._status;
                const statusColor = status === "approved" ? "var(--sev-harmless)" : status === "failed" ? "var(--sev-serious)" : status === "generating" ? "var(--accent)" : "var(--sev-minor)";
                return <button key={`${row._id}-${row._date}`} type="button" onClick={() => setNightDate(row._date)} aria-pressed={active} style={{ minWidth: 0, minHeight: "126px", textAlign: "left", padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "16px", background: active ? "var(--bg-surface-2)" : "var(--bg-base)", border: active ? "2px solid var(--accent)" : "1px solid var(--border-default)", borderRadius: "6px", borderLeft: active ? "4px solid var(--accent)" : "1px solid var(--border-default)", cursor: "pointer", color: "inherit", boxShadow: active ? "0 0 0 1px color-mix(in srgb, var(--accent) 14%, transparent)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}><div><div style={{ fontFamily: SANS, fontSize: "15px", lineHeight: 1.35, fontWeight: 650 }}>{formatBriefingListDate(row._date)}</div><div style={{ fontFamily: MONO, fontSize: "10px", color: "var(--fg-4)", marginTop: "5px" }}>{row._date}</div></div><span style={{ fontFamily: MONO, fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: statusColor, border: `1px solid ${statusColor}66`, borderRadius: "4px", padding: "4px 6px", whiteSpace: "nowrap" }}>{status}</span></div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", paddingTop: "12px", borderTop: "1px solid var(--border-hairline)" }}><span style={{ fontFamily: MONO, fontSize: "10px", color: "var(--fg-3)" }}>{row._counts.incidents ?? row.incidentCount ?? "—"} incidents</span><span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontFamily: MONO, fontSize: "10px", fontWeight: 700, letterSpacing: "0.04em", color: active ? "var(--accent)" : "var(--fg-2)" }}>{active ? <><Check size={12} /> SELECTED</> : <>OPEN REPORT <ChevronRight size={12} /></>}</span></div>
                </button>;
              })}
            </div>
          </section>

          <section style={{ minWidth: 0 }}>
            <div style={{ ...panelStyle, overflow: "hidden", marginBottom: "16px" }}>
              <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--border-hairline)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...smallLabelStyle, display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}><Calendar size={12} /> Selected report</div>
                  <h2 style={{ fontFamily: SANS, fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>{formatDateForDisplay(nightDate)}</h2>
                  <div style={{ fontFamily: SANS, fontSize: "12px", color: "var(--fg-3)", marginTop: "7px" }}>Morning Operations Briefing · Overnight activity</div>
                </div>
                <div style={{ display: "flex", gap: "7px", alignItems: "center" }}>
                  <button type="button" onClick={() => shiftDate(-1)} aria-label="Previous day" style={actionButtonStyle}><ChevronLeft size={14} /> Previous</button>
                  <button type="button" onClick={() => shiftDate(1)} aria-label="Next day" style={actionButtonStyle}>Next <ChevronRight size={14} /></button>
                </div>
              </div>
              {briefing && <div style={{ display: "flex", flexWrap: "wrap", gap: "22px", padding: "13px 22px", background: "var(--bg-base)" }}>
                <div><div style={smallLabelStyle}>Status</div><div style={{ marginTop: "5px" }}><StatusBadge status={briefing.status} /></div></div>
                <div><div style={smallLabelStyle}>Generated</div><div style={{ fontFamily: MONO, fontSize: "11px", color: "var(--fg-2)", marginTop: "7px" }}>{briefing.generatedAt ? new Date(briefing.generatedAt).toLocaleString() : "Not generated"}</div></div>
                <div><div style={smallLabelStyle}>Incidents</div><div style={{ fontFamily: MONO, fontSize: "11px", color: "var(--fg-2)", marginTop: "7px" }}>{briefing.metadata?.counts?.incidents ?? "—"}</div></div>
                <div><div style={smallLabelStyle}>Investigations</div><div style={{ fontFamily: MONO, fontSize: "11px", color: "var(--fg-2)", marginTop: "7px" }}>{briefing.metadata?.counts?.investigations ?? "—"}</div></div>
                {briefing.metadata?.generator && <div><div style={smallLabelStyle}>Generator</div><div style={{ fontFamily: MONO, fontSize: "11px", color: "var(--fg-2)", marginTop: "7px" }}>{briefing.metadata.generator}</div></div>}
              </div>}
            </div>

            {isLoadingBriefing && <div style={{ ...panelStyle, padding: "44px 24px", textAlign: "center" }}><Clock size={20} color="var(--fg-4)" style={{ marginBottom: "10px" }} /><div style={{ fontFamily: SANS, fontSize: "14px", color: "var(--fg-2)" }}>Loading briefing details...</div><div style={{ fontFamily: SANS, fontSize: "12px", color: "var(--fg-4)", marginTop: "5px" }}>Fetching sections for {formatBriefingListDate(nightDate)}.</div></div>}

            {!isLoadingBriefing && !briefing && <div style={{ ...panelStyle, padding: "48px 24px", textAlign: "center" }}><FileText size={28} color="var(--fg-4)" style={{ marginBottom: "12px" }} /><h3 style={{ fontFamily: SANS, fontSize: "17px", fontWeight: 600, margin: "0 0 8px" }}>No briefing for this date</h3><p style={{ fontFamily: SANS, fontSize: "13px", lineHeight: 1.6, color: "var(--fg-3)", maxWidth: "430px", margin: "0 auto 18px" }}>Generate a morning operations report to compile overnight incidents, anomalies, and recommended actions.</p><button type="button" onClick={handleGenerate} disabled={generateMutation.isPending} style={{ ...actionButtonStyle, background: "var(--accent)", color: "var(--bg-base)", borderColor: "var(--accent)", opacity: generateMutation.isPending ? 0.6 : 1 }}><Play size={13} /> {generateMutation.isPending ? "Generating..." : "Generate briefing"}</button></div>}

            {generateMutation.isPending && !briefing && <div style={{ ...panelStyle, padding: "40px 24px", textAlign: "center", marginTop: "12px" }}><Clock size={20} color="var(--accent)" style={{ marginBottom: "10px" }} /><div style={{ fontFamily: SANS, fontSize: "14px", color: "var(--fg-2)" }}>Generating briefing</div><div style={{ fontFamily: SANS, fontSize: "12px", color: "var(--fg-4)", marginTop: "5px" }}>Compiling overnight incidents and recommendations...</div></div>}

            {briefing && !isLoadingBriefing && <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", margin: "20px 2px 12px", flexWrap: "wrap" }}><div><h3 style={{ fontFamily: SANS, fontSize: "16px", fontWeight: 600, margin: 0 }}>Briefing contents</h3><p style={{ fontFamily: SANS, fontSize: "12px", color: "var(--fg-4)", margin: "5px 0 0" }}>Select a section to edit its contents where editing is available.</p></div><span style={{ ...smallLabelStyle }}>{sections.length} sections</span></div>
              {sections.length === 0 && <div style={{ ...panelStyle, padding: "24px", fontFamily: SANS, fontSize: "13px", color: "var(--fg-3)" }}>This briefing does not contain any sections yet.</div>}
              {sections.map((section) => <div key={section.name} style={{ ...panelStyle, padding: "16px 18px 2px", marginBottom: "12px" }}><SectionDisplay section={section} briefing={briefing} canEdit={canEdit} onEdit={handleEditSection} /></div>)}
              {isApproved && <div style={{ ...panelStyle, padding: "13px 16px", display: "flex", alignItems: "center", gap: "8px", color: "var(--sev-harmless)", fontFamily: MONO, fontSize: "10px", marginTop: "14px" }}><Check size={14} /> APPROVED{briefing.approvedAt ? ` · ${new Date(briefing.approvedAt).toLocaleString()}` : ""}</div>}
            </>}

            {[generateMutation, updateSectionMutation, approveMutation].map((mutation, index) => mutation.error && <div key={index} style={{ marginTop: "12px", padding: "13px 15px", background: "rgba(255,0,0,0.05)", border: "1px solid var(--sev-serious)", borderRadius: "4px", color: "var(--sev-serious)", fontFamily: SANS, fontSize: "12px" }}><AlertTriangle size={14} style={{ display: "inline", marginRight: "7px", verticalAlign: "middle" }} />{["Failed to generate briefing", "Failed to update section", "Failed to approve briefing"][index]}: {mutation.error.message}</div>)}
          </section>
        </div>
      </main>

      {editingSection && <EditSectionModal section={editingSection} onClose={handleCloseModal} onSave={handleSaveSection} isSaving={updateSectionMutation.isPending} />}
    </div>
  );
}
