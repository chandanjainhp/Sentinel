"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowLeft, ExternalLink } from "lucide-react";
import { getMachineDetail, getMachineCoverages, listSensors } from "@/lib/api";
import PageContainer from "@/components/layout/PageContainer";

const MONO = "var(--font-mono)";
const SANS = "var(--font-sans)";

function formatValue(value) {
  if (typeof value !== "number") return "—";
  return Math.abs(value) >= 100 ? value.toFixed(0) : Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function TrendChart({ series }) {
  const points = series.points || [];
  if (!points.length) {
    return <div className="empty-state" style={{ minHeight: 180, display: "grid", placeItems: "center" }}>No readings in the available window</div>;
  }

  const values = points.map((point) => point.v);
  const threshold = typeof series.threshold === "number" ? series.threshold : null;
  const min = Math.min(...values, ...(threshold == null ? [] : [threshold]));
  const max = Math.max(...values, ...(threshold == null ? [] : [threshold]));
  const range = max - min || 1;
  const x = (index) => 4 + (index / Math.max(points.length - 1, 1)) * 992;
  const y = (value) => 164 - ((value - min) / range) * 148;
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.v).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];

  return (
    <div style={{ background: "var(--graphite)", border: "1px solid var(--line)", padding: "14px 16px 10px" }}>
      <svg viewBox="0 0 1000 180" role="img" aria-label={`${series.name} sensor trend`} style={{ width: "100%", height: 190, display: "block" }}>
        {threshold != null && <line x1="0" x2="1000" y1={y(threshold)} y2={y(threshold)} stroke="var(--amber)" strokeDasharray="8 6" />}
        <path d={path} fill="none" stroke="var(--bone)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <circle cx={x(points.length - 1)} cy={y(last.v)} r="4" fill="var(--amber)">
          <title>{`${formatValue(last.v)} ${series.unit || ""} at ${new Date(last.t).toLocaleString()}`}</title>
        </circle>
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontFamily: MONO, fontSize: 10, color: "var(--dim)" }}>
        <span>{formatValue(Math.min(...values))}–{formatValue(Math.max(...values))} {series.unit || ""}</span>
        <span>Latest {formatValue(last.v)} {series.unit || ""} · {new Date(last.t).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
      </div>
      {threshold != null && <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 10, color: "var(--amber)" }}>Configured threshold · {formatValue(threshold)} {series.unit || ""}</div>}
    </div>
  );
}

function SensorTrendsWorkspace() {
  const params = useSearchParams();
  const initialMachineId = params.get("machineId");
  const initialSensorId = params.get("sensorId");
  const [machineId, setMachineId] = useState(initialMachineId || "");
  const [sensorId, setSensorId] = useState(initialSensorId || "all");

  const { data: sensors = [], isLoading: sensorsLoading } = useQuery({ queryKey: ["sensors"], queryFn: listSensors, staleTime: 30_000 });
  const { data: coverage = [] } = useQuery({ queryKey: ["machine-coverages"], queryFn: getMachineCoverages, staleTime: 30_000 });
  const machines = useMemo(() => {
    const fromSensors = sensors.map((sensor) => ({ id: sensor.machineId, name: sensor.machineName || sensor.machineId })).filter((machine) => machine.id);
    const fromCoverage = coverage.map((entry) => ({ id: entry.machineId, name: entry.name || entry.machineId })).filter((machine) => machine.id);
    return Array.from(new Map([...fromSensors, ...fromCoverage].map((machine) => [String(machine.id), machine])).values());
  }, [coverage, sensors]);
  const selectedMachine = machineId || machines[0]?.id || "";
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["machine-detail", selectedMachine],
    queryFn: () => getMachineDetail(selectedMachine),
    enabled: Boolean(selectedMachine),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const trends = (data?.sensorTrends || []).filter((series) => sensorId === "all" || String(series.sensorId) === String(sensorId));

  return (
    <PageContainer>
      <Link href="/sensors" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 10, color: "var(--dim)", textDecoration: "none", textTransform: "uppercase", letterSpacing: ".14em", marginBottom: 18 }}><ArrowLeft size={12} /> Sensor setup</Link>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "end", marginBottom: 24 }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: 22, color: "var(--fg-1)", margin: 0 }}><Activity size={18} style={{ color: "var(--accent)" }} /> Sensor Trends</h1>
          <p style={{ fontFamily: SANS, fontSize: 13, color: "var(--fg-3)", margin: "8px 0 0", maxWidth: 620 }}>Explore real readings by machine and sensor. The API currently provides the configured recent window; no values are interpolated or backfilled here.</p>
        </div>
        {selectedMachine && <Link href={`/machines/${selectedMachine}#sensor-trends`} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontFamily: MONO, fontSize: 10, color: "var(--accent)", textDecoration: "none", textTransform: "uppercase" }}>Open machine detail <ExternalLink size={12} /></Link>}
      </div>

      <section aria-label="Trend filters" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, padding: 16, background: "var(--graphite)", border: "1px solid var(--line)", marginBottom: 24 }}>
        <label style={{ fontFamily: MONO, fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".12em" }}>Machine
          <select aria-label="Select machine" value={selectedMachine} onChange={(event) => { setMachineId(event.target.value); setSensorId("all"); }} style={{ display: "block", width: "100%", marginTop: 7, padding: "9px 10px", background: "var(--bg-base)", color: "var(--fg-1)", border: "1px solid var(--line2)" }}>
            {!machines.length && <option value="">{sensorsLoading ? "Loading machines…" : "No machines with sensors"}</option>}
            {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
          </select>
        </label>
        <label style={{ fontFamily: MONO, fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".12em" }}>Sensor / channel
          <select aria-label="Select sensor or channel" value={sensorId} onChange={(event) => setSensorId(event.target.value)} disabled={!data?.sensorTrends?.length} style={{ display: "block", width: "100%", marginTop: 7, padding: "9px 10px", background: "var(--bg-base)", color: "var(--fg-1)", border: "1px solid var(--line2)" }}>
            <option value="all">All sensors</option>
            {(data?.sensorTrends || []).map((series) => <option key={series.sensorId} value={series.sensorId}>{series.name} · {series.type}</option>)}
          </select>
        </label>
        <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".12em" }}>Time range
          <div style={{ marginTop: 7, padding: "10px 0", color: "var(--fg-2)", letterSpacing: ".04em" }}>Last {data?.trendWindowMin ?? "—"} minutes · API window</div>
        </div>
      </section>

      {isLoading ? <div className="empty-state">LOADING SENSOR READINGS…</div> : isError ? <div className="empty-state" style={{ color: "var(--health-critical)" }}>COULD NOT LOAD SENSOR READINGS — {error?.message || "TRY AGAIN SHORTLY"}</div> : !selectedMachine ? <div className="empty-state">ADD A MACHINE AND SENSOR TO EXPLORE READINGS</div> : !trends.length ? <div className="empty-state">NO SENSOR DATA IN THE AVAILABLE WINDOW</div> : <section aria-label="Sensor trend charts" style={{ display: "grid", gap: 16 }}>{trends.map((series) => <article id={`sensor-${series.sensorId}`} key={series.sensorId}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7, flexWrap: "wrap" }}><h2 style={{ fontFamily: SANS, fontSize: 15, color: "var(--fg-1)", margin: 0 }}>{series.name}</h2><span style={{ fontFamily: MONO, fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>{series.type} · {series.unit || "unit not configured"}</span></div><TrendChart series={series} /></article>)}</section>}
    </PageContainer>
  );
}

export default function SensorTrendsPage() {
  return <Suspense fallback={<PageContainer className="empty-state">LOADING SENSOR TRENDS…</PageContainer>}><SensorTrendsWorkspace /></Suspense>;
}
