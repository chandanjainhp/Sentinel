"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, CircleHelp, Clock3, RefreshCw } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { getDashboardSummary, getOvernightHealthCurrent } from "@/lib/api";
import HealthDot from "@/components/brand/HealthDot";
import PageContainer from "@/components/layout/PageContainer";
import { healthMeta } from "@/lib/health";
import { defaultNightDate, REPORTING_TIMEZONE } from "@/lib/reporting-window";

const MONO = "var(--font-mono)";
const DISPLAY = "var(--font-display)";
const DASH = "—";
const incidentRank = { critical: 0, serious: 0, warning: 1, minor: 2, harmless: 3 };

function useLiveNightDate() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return defaultNightDate(now);
}

function formatTimestamp(value, timeZone = REPORTING_TIMEZONE) {
  if (!value) return DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return DASH;
  return new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function StatTile({ label, value, dot, dotColor, href, description }) {
  const content = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {dot && <span className={`hw-dot ${dot}`} aria-hidden="true" />}
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".18em", color: "var(--dim)" }}>{label}</span>
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 36, lineHeight: .95, color: dotColor || "var(--bone)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {description && <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 9, color: "var(--dim)" }}>{description}</div>}
    </>
  );
  const style = { display: "block", background: "var(--graphite)", border: "1px solid var(--line)", padding: "16px 18px", textDecoration: "none", color: "inherit" };
  return href ? <Link href={href} style={style} aria-label={`${label}: ${value}. Open ${label.toLowerCase()}`}>{content}</Link> : <div style={style}>{content}</div>;
}

function SectionHeader({ index, title, note, action }) {
  return <div style={{ display: "flex", alignItems: "baseline", gap: 16, borderBottom: "1px solid var(--line)", paddingBottom: 12, marginBottom: 16, flexWrap: "wrap" }}>
    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: "var(--amber)", letterSpacing: ".1em" }}>{index}</span>
    <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, textTransform: "uppercase", fontSize: 18, color: "var(--bone)", margin: 0 }}>{title}</h2>
    {note && <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".12em", color: "var(--dim)", marginLeft: "auto" }}>{note}</span>}
    {action}
  </div>;
}

function RetryState({ query, label }) {
  if (query.isLoading) return <div className="empty-state" aria-live="polite">{label}…</div>;
  if (!query.isError) return null;
  return <div className="empty-state" style={{ color: "var(--health-critical)" }} role="alert">{label} unavailable <button type="button" onClick={() => query.refetch()} style={{ display: "block", margin: "12px auto 0", color: "var(--amber)", background: "transparent", border: "1px solid var(--line2)", padding: "8px 12px", cursor: "pointer", fontFamily: MONO, fontSize: 10 }}><RefreshCw size={12} aria-hidden="true" /> RETRY</button></div>;
}

function OvernightStatus({ query }) {
  const run = query.data;
  if (query.isLoading) return <div className="empty-state" aria-live="polite">LOADING OVERNIGHT CHECKER…</div>;
  if (query.isError) return <div className="empty-state" style={{ color: "var(--health-critical)" }}>OVERNIGHT STATUS UNAVAILABLE</div>;
  if (!run) return <div className="empty-state">NO OVERNIGHT RUN HAS BEEN RECORDED — MONITORING STATUS UNKNOWN</div>;
  const status = String(run.status || "unknown").toLowerCase();
  const label = {
    scheduled: "Scheduled — not run",
    running: "Running",
    completed: run.abnormalMachines > 0 ? "Completed with incidents" : "Completed — no reportable incidents",
    completed_with_warnings: "Completed — incomplete telemetry",
    failed: "Failed",
  }[status] || status.replaceAll("_", " ");
  const color = status === "failed" ? "var(--health-critical)" : status === "completed" ? "var(--health-healthy)" : "var(--health-warning)";
  return <div>
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      {status === "completed" ? <CheckCircle2 size={16} style={{ color }} aria-hidden="true" /> : <CircleHelp size={16} style={{ color }} aria-hidden="true" />}
      <strong style={{ fontFamily: MONO, fontSize: 12, color, textTransform: "uppercase" }}>{label}</strong>
      <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--dim)" }}>{run.reportingDate || DASH} · {run.timezone || REPORTING_TIMEZONE}</span>
    </div>
    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12, fontFamily: MONO, fontSize: 10, color: "var(--fg-3)" }}>
      <span>{run.assessedMachines ?? 0}/{run.expectedMachines ?? 0} machines assessed</span><span>{run.unassessedMachines ?? 0} unassessed</span>{run.completedAt && <span>Completed {formatTimestamp(run.completedAt, run.timezone)}</span>}
    </div>
  </div>;
}

export default function OverviewPage() {
  const { user } = useAuthStore();
  const nightDate = useLiveNightDate();
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: getDashboardSummary, staleTime: 30_000, refetchInterval: 60_000 });
  const overnight = useQuery({ queryKey: ["overnight-health", "current"], queryFn: getOvernightHealthCurrent, staleTime: 30_000, refetchInterval: 60_000 });
  const data = dashboard.data;
  const totals = data?.totals;
  const fleet = Array.isArray(data?.fleet) ? data.fleet : [];
  const incidents = useMemo(() => (Array.isArray(data?.incidents) ? [...data.incidents].sort((a, b) => (incidentRank[a.severity] ?? 9) - (incidentRank[b.severity] ?? 9)) : []), [data]);
  const telemetry = data?.telemetry;
  const risk = data?.predictedRisk;
  const timeZone = fleet.length && fleet.every((site) => site.timezone === fleet[0].timezone) ? fleet[0].timezone : REPORTING_TIMEZONE;

  return <PageContainer>
    <header style={{ marginBottom: 28 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--dim)", marginBottom: 8 }}>REPORTING DATE {nightDate} · {timeZone}</div>
      <h1 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34, lineHeight: .95, textTransform: "uppercase", color: "var(--bone)", margin: 0 }}>{user?.username ? `${user.username}'s fleet` : "Fleet"}</h1>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontFamily: MONO, fontSize: 10, color: "var(--dim)" }}><span><Clock3 size={12} aria-hidden="true" /> LAST UPDATED {formatTimestamp(data?.generatedAt, timeZone)}</span><span>REPORTING TIMEZONE {timeZone}</span></div>
    </header>

    <SectionHeader index="01" title="Key metrics" note={dashboard.isLoading ? "LOADING…" : undefined} />
    {dashboard.isError ? <RetryState query={dashboard} label="DASHBOARD" /> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10, marginBottom: 32 }}>
      <StatTile label="Total machines" value={dashboard.isLoading ? DASH : totals?.machines ?? DASH} />
      <StatTile label="Healthy" value={dashboard.isLoading ? DASH : totals?.healthy ?? DASH} dot={totals?.healthy > 0 ? "hw-dot--healthy" : undefined} dotColor={totals?.healthy > 0 ? "var(--health-healthy)" : undefined} />
      <StatTile label="Warning" value={dashboard.isLoading ? DASH : totals?.warning ?? DASH} dot={totals?.warning > 0 ? "hw-dot--warning" : undefined} dotColor={totals?.warning > 0 ? "var(--health-warning)" : undefined} href={totals?.warning > 0 ? "/incidents" : undefined} />
      <StatTile label="Critical" value={dashboard.isLoading ? DASH : totals?.critical ?? DASH} dot={totals?.critical > 0 ? "hw-dot--critical" : undefined} dotColor={totals?.critical > 0 ? "var(--health-critical)" : undefined} href={totals?.critical > 0 ? "/incidents" : undefined} />
      <StatTile label="Active incidents" value={dashboard.isLoading ? DASH : totals?.activeIncidents ?? DASH} href="/incidents" />
      <StatTile label="Telemetry coverage" value={dashboard.isLoading ? DASH : telemetry?.percentage == null ? DASH : `${telemetry.percentage}%`} description={telemetry ? `${telemetry.coveredMachines}/${telemetry.totalMachines} machines ready${telemetry.staleMachines ? ` · ${telemetry.staleMachines} stale` : ""}` : "Unavailable"} href="/sensors#machines" />
      <StatTile label="Predicted risk" value={dashboard.isLoading ? DASH : typeof risk?.anomalyScore === "number" ? risk.anomalyScore.toFixed(2) : DASH} description="Latest anomaly score · scale 0–1" href={risk?.machineId ? `/machines/${risk.machineId}` : undefined} />
    </div>}
    {!dashboard.isLoading && !dashboard.isError && (totals?.unknown > 0 || totals?.offline > 0) && <p style={{ margin: "-20px 0 32px", fontFamily: MONO, fontSize: 10, color: "var(--health-warning)" }}>HEALTH NOT FULLY DETERMINED: {totals.unknown || 0} UNKNOWN · {totals.offline || 0} OFFLINE. Missing or stale readings are not counted as healthy.</p>}

    <SectionHeader index="02" title="Overnight Health Checker" action={<Link href="/overnight-health" style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: "var(--amber)", textDecoration: "none" }}>VIEW LATEST REPORT →</Link>} />
    <section style={{ background: "var(--graphite)", border: "1px solid var(--line)", padding: 16, marginBottom: 32 }} aria-label="Overnight Health Checker status"><OvernightStatus query={overnight} /></section>

    <SectionHeader index="03" title="Open incidents" note={incidents.length ? `${incidents.length} SHOWN` : undefined} action={<Link href="/incidents" style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: "var(--amber)", textDecoration: "none" }}>VIEW ALL →</Link>} />
    {dashboard.isLoading ? <div className="empty-state">LOADING INCIDENTS…</div> : dashboard.isError ? <div className="empty-state">INCIDENTS UNAVAILABLE WITH DASHBOARD DATA</div> : incidents.length === 0 ? <div className="empty-state" style={{ marginBottom: 32 }}>NO OPEN INCIDENTS RECORDED — FLEET HEALTH IS NOT INFERRED FROM THIS RESULT.</div> : <div style={{ marginBottom: 32 }}>{incidents.map((incident) => { const meta = healthMeta(incident.severity); return <Link key={incident.incidentId} href={`/incidents/${incident.incidentId}`} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderBottom: "1px solid var(--line)", textDecoration: "none" }}><span style={{ paddingTop: 5 }}><span className={`hw-dot ${meta.cssClass}`} aria-label={meta.label} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontFamily: MONO, fontSize: 12, color: "var(--bone)" }}>{incident.machine?.name || DASH}</span><span style={{ display: "block", marginTop: 3, fontSize: 13, color: "var(--muted)" }}>{incident.title || "Untitled incident"}</span></span><span style={{ fontFamily: MONO, fontSize: 10, color: meta.token, textTransform: "uppercase" }}>{meta.label}</span><span style={{ fontFamily: MONO, fontSize: 10, color: "var(--dim)", minWidth: 64, textAlign: "right" }}>{incident.age || DASH}</span></Link>; })}</div>}

    <SectionHeader index="04" title="Sensor Trends" action={<Link href="/sensors/trends" style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: "var(--amber)", textDecoration: "none" }}>OPEN SENSOR TRENDS →</Link>} />
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, background: "var(--graphite)", border: "1px solid var(--line)", marginBottom: 32 }}><Activity size={18} style={{ color: "var(--amber)" }} aria-hidden="true" /><span style={{ fontFamily: MONO, fontSize: 11, color: "var(--fg-2)" }}>Explore configured readings by machine and sensor without interpolating missing data.</span></div>

    <SectionHeader index="05" title="Fleet / sites" note={fleet.length ? `${fleet.length} SITE${fleet.length === 1 ? "" : "S"}` : undefined} />
    {dashboard.isLoading ? <div className="empty-state">LOADING FLEET…</div> : dashboard.isError ? <div className="empty-state">FLEET UNAVAILABLE</div> : fleet.length === 0 ? <div className="empty-state">NO SITES REGISTERED</div> : <div className="table-scroll"><div className="fleet-row fleet-head" style={{ display: "grid", gridTemplateColumns: "minmax(140px, 2fr) repeat(5, 1fr) minmax(180px, 2fr)", gap: 12, padding: "8px 14px", minWidth: 700, borderBottom: "1px solid var(--line2)", fontFamily: MONO, fontSize: 9.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--dim)" }}><span>Site</span><span style={{ textAlign: "right" }}>Machines</span><span style={{ textAlign: "right" }}>Healthy</span><span style={{ textAlign: "right" }}>Warn</span><span style={{ textAlign: "right" }}>Crit</span><span style={{ textAlign: "right" }}>Status</span><span>Actions</span></div>{fleet.map((site) => { const meta = healthMeta(site.status); const machines = Array.isArray(site.machinesDetail) ? site.machinesDetail : []; return <div key={site._id} className="fleet-row" style={{ display: "grid", gridTemplateColumns: "minmax(140px, 2fr) repeat(5, 1fr) minmax(180px, 2fr)", gap: 12, padding: "12px 14px", minWidth: 700, borderBottom: "1px solid var(--line)", alignItems: "center" }}><span style={{ fontFamily: MONO, fontSize: 12, color: "var(--bone)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{site.name || DASH}</span><span className="num" style={{ textAlign: "right", color: "var(--fg-2)" }}>{site.machines ?? DASH}</span><span className="num" style={{ textAlign: "right", color: "var(--fg-2)" }}>{site.healthy ?? DASH}</span><span className="num" style={{ textAlign: "right", color: site.warning > 0 ? "var(--health-warning)" : "var(--fg-3)" }}>{site.warning ?? DASH}</span><span className="num" style={{ textAlign: "right", color: site.critical > 0 ? "var(--health-critical)" : "var(--fg-3)" }}>{site.critical ?? DASH}</span><span style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}><HealthDot status={site.status} /><span style={{ fontFamily: MONO, fontSize: 9, color: meta.token }}>{meta.label}</span></span><span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{machines.length ? machines.map((machine) => <span key={machine.id} style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><Link href={`/machines/${encodeURIComponent(machine.id)}`} style={{ fontFamily: MONO, fontSize: 9, color: "var(--accent)", textDecoration: "none" }} aria-label={`View ${machine.name || machine.machineId} machine`}>VIEW MACHINE</Link><Link href={`/sensors/trends?machineId=${encodeURIComponent(machine.id)}`} style={{ fontFamily: MONO, fontSize: 9, color: "var(--amber)", textDecoration: "none" }} aria-label={`View sensor trends for ${machine.name || machine.machineId}`}>TRENDS</Link></span>) : <span style={{ fontFamily: MONO, fontSize: 9, color: "var(--dim)" }}>NO MACHINE ACTIONS</span>}</span></div>; })}</div>}
    <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}><Link href="/sensors#machines" style={{ fontFamily: MONO, fontSize: 10, color: "var(--amber)", textDecoration: "none" }}>MANAGE MACHINES AND SENSORS →</Link></div>
  </PageContainer>;
}
