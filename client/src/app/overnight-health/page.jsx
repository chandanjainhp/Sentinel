"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowLeft, CheckCircle2, CircleAlert } from "lucide-react";
import Link from "next/link";
import { getOvernightHealthCurrent, getOvernightHealthHistory } from "@/lib/api";
import PageContainer from "@/components/layout/PageContainer";

const MONO = "var(--font-mono)";

function RunRow({ run }) {
  const healthy = ["complete", "completed", "healthy"].includes(String(run.status).toLowerCase());
  return <div style={{ display: "grid", gridTemplateColumns: "minmax(130px, 1fr) 1fr 1fr 1.4fr", gap: 12, padding: "12px 14px", borderBottom: "1px solid var(--line)", alignItems: "center" }}>
    <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--fg-1)" }}>{run.reportingDate || "—"}</span>
    <span style={{ display: "flex", gap: 6, alignItems: "center", fontFamily: MONO, fontSize: 10, color: healthy ? "var(--health-healthy)" : "var(--health-warning)", textTransform: "uppercase" }}>{healthy ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />} {String(run.status || "unknown").replaceAll("_", " ")}</span>
    <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--fg-2)" }}>{run.assessedMachines ?? 0}/{run.expectedMachines ?? 0} assessed</span>
    <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--dim)" }}>{run.reportGeneratedAt ? new Date(run.reportGeneratedAt).toLocaleString() : "Report not generated"}</span>
  </div>;
}

export default function OvernightHealthPage() {
  const current = useQuery({ queryKey: ["overnight-health", "current"], queryFn: getOvernightHealthCurrent, refetchInterval: 60_000 });
  const history = useQuery({ queryKey: ["overnight-health", "history"], queryFn: getOvernightHealthHistory, staleTime: 60_000 });
  const runs = Array.isArray(history.data) ? history.data : [];

  return <PageContainer>
    <Link href="/overview" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 10, color: "var(--dim)", textDecoration: "none", textTransform: "uppercase", letterSpacing: ".14em", marginBottom: 18 }}><ArrowLeft size={12} /> Overview</Link>
    <div style={{ marginBottom: 28 }}><h1 style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-sans)", fontSize: 22, color: "var(--fg-1)", margin: 0 }}><Activity size={18} style={{ color: "var(--accent)" }} /> Overnight Health</h1><p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-3)", margin: "8px 0 0" }}>Assessment coverage for the configured reporting window, using recorded runs only.</p></div>
    <section style={{ background: "var(--graphite)", border: "1px solid var(--line)", padding: 18, marginBottom: 24 }} aria-label="Current overnight health">
      <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--dim)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 10 }}>Current reporting date</div>
      {current.isLoading ? <div className="empty-state">LOADING CURRENT RUN…</div> : current.isError ? <div className="empty-state" style={{ color: "var(--health-critical)" }}>CURRENT RUN UNAVAILABLE</div> : current.data ? <><div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><strong style={{ fontFamily: "var(--font-sans)", fontSize: 20, color: "var(--fg-1)" }}>{current.data.reportingDate}</strong><span style={{ fontFamily: MONO, fontSize: 11, color: "var(--fg-2)", textTransform: "uppercase" }}>{String(current.data.status || "unknown").replaceAll("_", " ")}</span></div><div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 14, fontFamily: MONO, fontSize: 11, color: "var(--fg-3)" }}><span>{current.data.assessedMachines ?? 0}/{current.data.expectedMachines ?? 0} machines assessed</span><span>{current.data.unassessedMachines ?? 0} unassessed</span><span>{current.data.timezone || "Timezone unavailable"}</span></div></> : <div className="empty-state">NO OVERNIGHT RUN HAS BEEN RECORDED</div>}
    </section>
    <section style={{ background: "var(--graphite)", border: "1px solid var(--line)", overflowX: "auto" }} aria-label="Overnight health history"><div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", fontFamily: MONO, fontSize: 10, color: "var(--dim)", letterSpacing: ".14em", textTransform: "uppercase" }}>Run history</div>{history.isLoading ? <div className="empty-state">LOADING HISTORY…</div> : history.isError ? <div className="empty-state" style={{ color: "var(--health-critical)" }}>HISTORY UNAVAILABLE</div> : runs.length ? <div style={{ minWidth: 650 }}>{runs.map((run) => <RunRow key={run._id || run.id || run.reportingDate} run={run} />)}</div> : <div className="empty-state">NO COMPLETED RUNS TO DISPLAY</div>}</section>
  </PageContainer>;
}
