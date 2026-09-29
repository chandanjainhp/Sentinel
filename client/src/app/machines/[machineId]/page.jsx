"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getMachineDetail } from "@/lib/api";
import { healthMeta } from "@/lib/health";
import HealthDot from "@/components/brand/HealthDot";

const MONO = "var(--font-mono)";
const DISPLAY = "var(--font-display)";
const LABEL = {
  fontFamily: MONO,
  fontSize: "10px",
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  color: "var(--dim)",
};
const DASH = "—";

/* ── Section header: amber index + uppercase title + hairline rule ── */
function SecHead({ index, title, note, action }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 16,
        borderBottom: "1px solid var(--line)",
        paddingBottom: 12,
        marginBottom: 16,
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--amber)",
          letterSpacing: "0.1em",
        }}
      >
        {index}
      </span>
      <h2
        style={{
          fontFamily: DISPLAY,
          fontVariationSettings: "'wdth' 120",
          fontWeight: 800,
          textTransform: "uppercase",
          fontSize: "18px",
          letterSpacing: "0.01em",
          color: "var(--bone)",
          margin: 0,
        }}
      >
        {title}
      </h2>
      {note && (
        <span
          style={{
            fontFamily: MONO,
            fontSize: "9.5px",
            letterSpacing: "0.18em",
            color: "var(--dim)",
            marginLeft: "auto",
          }}
        >
          {note}
        </span>
      )}
      {action}
    </div>
  );
}

/* ── Prediction tile: mono label, huge Archivo value, optional unit ── */
function PredictionTile({ label, value, unit, note, noteColor }) {
  return (
    <div
      style={{
        background: "var(--graphite)",
        border: "1px solid var(--line)",
        padding: "16px 18px",
      }}
    >
      <div style={{ ...LABEL, marginBottom: 10 }}>{label}</div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: DISPLAY,
            fontVariationSettings: "'wdth' 120",
            fontWeight: 800,
            fontSize: "40px",
            lineHeight: 0.95,
            color: "var(--bone)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: "11px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--dim)",
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {note && (
        <div
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: noteColor || "var(--dim)",
            marginTop: 8,
          }}
        >
          {note}
        </div>
      )}
    </div>
  );
}

/* ── SVG line chart: bone line, amber dashed threshold, mono axis labels ── */
function TrendChart({ series, windowMin }) {
  const { points, threshold, unit } = series;

  const { pathD, areaD, minY, maxY } = useMemo(() => {
    const W = 560;
    const H = 140;
    const PAD_X = 2;
    const PAD_Y = 10;

    if (!points || points.length === 0) {
      return { pathD: null, areaD: null, minY: null, maxY: null };
    }

    const values = points.map((p) => p.v);
    const withThreshold =
      typeof threshold === "number" ? [...values, threshold] : values;
    let lo = Math.min(...withThreshold);
    let hi = Math.max(...withThreshold);
    if (hi - lo < 1e-9) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.1;
    lo -= pad;
    hi += pad;

    const x = (i) => PAD_X + (i / Math.max(1, points.length - 1)) * (W - PAD_X * 2);
    const y = (v) => PAD_Y + (1 - (v - lo) / (hi - lo)) * (H - PAD_Y * 2);

    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;

    return { pathD: line, areaD: area, minY: lo, maxY: hi };
  }, [points, threshold]);

  const first = points?.[0];
  const last = points?.[points.length - 1];
  const fmtTime = (t) =>
    new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fmtVal = (v) =>
    Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);

  return (
    <div
      style={{
        background: "var(--graphite)",
        border: "1px solid var(--line)",
        padding: "14px 16px 10px",
      }}
    >
      {pathD ? (
        <>
          <svg
            viewBox="0 0 560 140"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${series.name} trend`}
            style={{ width: "100%", height: 140, display: "block" }}
          >
            {typeof threshold === "number" && (
              <line
                x1={0}
                x2={560}
                y1={10 + (1 - (threshold - minY) / (maxY - minY)) * 120}
                y2={10 + (1 - (threshold - minY) / (maxY - minY)) * 120}
                stroke="var(--amber)"
                strokeWidth={1}
                strokeDasharray="5 4"
                opacity={0.9}
              />
            )}
            <path d={areaD} fill="var(--bone)" opacity={0.05} />
            <path
              d={pathD}
              fill="none"
              stroke="var(--bone)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 6,
              fontFamily: MONO,
              fontSize: "9px",
              letterSpacing: "0.12em",
              color: "var(--dim)",
            }}
          >
            <span>
              {fmtVal(minY)}–{fmtVal(maxY)} {unit}
            </span>
            <span>
              {first && last ? `${fmtTime(first.t)} → ${fmtTime(last.t)}` : `LAST ${windowMin}M`}
            </span>
          </div>
        </>
      ) : (
        <div
          style={{
            height: 140,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: MONO,
            fontSize: "10px",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--dim)",
            border: "1px solid var(--line)",
          }}
        >
          NO TELEMETRY — NO READINGS IN LAST {windowMin}M
        </div>
      )}
    </div>
  );
}

export default function MachineDetailPage() {
  const params = useParams();
  const machineId = params?.machineId;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["machine-detail", machineId],
    queryFn: () => getMachineDetail(machineId),
    enabled: Boolean(machineId),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    retry: 1,
  });

  const machine = data?.machine;
  const site = data?.site;
  const prediction = data?.prediction;
  const trends = data?.sensorTrends ?? [];
  const history = data?.history ?? [];
  const incidents = data?.incidents ?? [];
  const windowMin = data?.trendWindowMin ?? 60;

  const meta = machine ? healthMeta(machine.status) : null;
  const modelLabel = prediction ? `${prediction.model} · v${prediction.modelVersion}` : null;

  if (isError) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--night)",
          padding: "32px 24px 64px",
          maxWidth: "1080px",
          margin: "0 auto",
        }}
      >
        <div className="empty-state">MACHINE NOT FOUND — OR NOT VISIBLE TO THIS ACCOUNT</div>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Link
            href="/sensors"
            style={{
              fontFamily: MONO,
              fontSize: "10px",
              letterSpacing: "0.14em",
              color: "var(--amber)",
              textDecoration: "none",
            }}
          >
            ← BACK TO FLEET
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--night)",
        padding: "32px 24px 64px",
        maxWidth: "1080px",
        margin: "0 auto",
      }}
    >
      {/* ── Header: breadcrumb, name, type, health pill ── */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "var(--dim)",
            marginBottom: 8,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Link href="/sensors" style={{ color: "var(--dim)", textDecoration: "none" }}>
            Sites
          </Link>
          <span style={{ color: "var(--dim)" }}>/</span>
          {site ? (
            <Link
              href="/sensors"
              style={{ color: "var(--dim)", textDecoration: "none" }}
            >
              {site.name}
            </Link>
          ) : (
            <span>—</span>
          )}
          <span style={{ color: "var(--dim)" }}>/</span>
          <span style={{ color: "var(--muted)" }}>{machine?.assetId ?? machineId}</span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <h1
            style={{
              fontFamily: DISPLAY,
              fontVariationSettings: "'wdth' 124",
              fontWeight: 800,
              fontSize: "34px",
              lineHeight: 0.95,
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              color: "var(--bone)",
              margin: 0,
            }}
          >
            {machine?.name ?? (isLoading ? "LOADING…" : "MACHINE")}
          </h1>
          {machine && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 12px",
                border: `1px solid ${meta.key === "unknown" ? "var(--line2)" : meta.token}`,
                background: "var(--graphite)",
              }}
            >
              <HealthDot status={machine.status} />
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: "9.5px",
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: meta.token,
                }}
              >
                {meta.label}
              </span>
            </span>
          )}
        </div>

        <div
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--dim)",
            marginTop: 10,
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <span>TYPE · {machine?.machineType ?? DASH}</span>
          {machine?.serialNumber && <span>S/N · {machine.serialNumber}</span>}
          {machine?.location && <span>LOC · {machine.location}</span>}
          {machine?.status === "unknown" && machine?.healthUnknownReason && (
            <span style={{ color: "var(--muted)" }}>{machine.healthUnknownReason}</span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state">LOADING MACHINE…</div>
      ) : (
        <>
          {/* ══ 01 · LATEST PREDICTION — three tiles ══ */}
          <SecHead
            index="01"
            title="Latest Prediction"
            note={
              prediction?.timestamp
                ? `AT ${new Date(prediction.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : undefined
            }
          />
          {!prediction ? (
            <div className="empty-state" style={{ marginBottom: 40 }}>
              NO PREDICTION YET — PREDICTIONS START ONCE REQUIRED SENSORS REPORT
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <PredictionTile
                  label="RUL"
                  value={prediction.rulValue ?? DASH}
                  unit={prediction.rulUnit ?? undefined}
                  note={prediction.rulValue == null ? "NOT REPORTED BY MODEL" : undefined}
                />
                <PredictionTile
                  label="Anomaly Score"
                  value={prediction.anomalyScore?.toFixed(2) ?? DASH}
                  unit="0–1"
                  note={
                    prediction.anomalyScore != null && data?.thresholds
                      ? `WARN ≥ ${data.thresholds.warningAnomalyScore} · CRIT ≥ ${data.thresholds.criticalAnomalyScore}`
                      : undefined
                  }
                  noteColor={
                    prediction.anomalyScore != null && data?.thresholds
                      ? prediction.anomalyScore >= data.thresholds.criticalAnomalyScore
                        ? "var(--health-critical)"
                        : prediction.anomalyScore >= data.thresholds.warningAnomalyScore
                          ? "var(--health-warning)"
                          : undefined
                      : undefined
                  }
                />
                <PredictionTile
                  label="Fault Probability"
                  value={prediction.faultProbability?.toFixed(2) ?? DASH}
                  unit="0–1"
                  note={
                    prediction.faultType
                      ? `FAULT TYPE · ${prediction.faultType}`
                      : undefined
                  }
                />
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: "10px",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--dim)",
                  marginBottom: 40,
                }}
              >
                MODEL · {modelLabel}
                {prediction.confidence != null && ` · CONFIDENCE ${prediction.confidence.toFixed(2)}`}
              </div>
            </>
          )}

          {/* ══ 02 · SENSOR TRENDS — one SVG chart per sensor ══ */}
          <SecHead
            index="02"
            title="Sensor Trends"
            note={trends.length ? `LAST ${windowMin}M · ${trends.length} SENSOR${trends.length === 1 ? "" : "S"}` : undefined}
          />
          {trends.length === 0 ? (
            <div className="empty-state" style={{ marginBottom: 40 }}>
              NO SENSORS ATTACHED — ADD SENSORS TO SEE TELEMETRY
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 10,
                marginBottom: 40,
              }}
            >
              {trends.map((series) => (
                <div key={series.sensorId}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: "11px",
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "var(--muted)",
                      }}
                    >
                      {series.name}
                    </span>
                    <span style={{ ...LABEL, fontSize: "9px" }}>
                      {series.type}
                      {series.threshold != null
                        ? ` · THRESHOLD ${series.threshold}`
                        : ""}
                    </span>
                  </div>
                  <TrendChart series={series} windowMin={windowMin} />
                </div>
              ))}
            </div>
          )}

          {/* ══ 03 · PREDICTION HISTORY — mono table ══ */}
          <SecHead
            index="03"
            title="Prediction History"
            note={history.length ? `LAST ${history.length}` : undefined}
          />
          {history.length === 0 ? (
            <div className="empty-state" style={{ marginBottom: 40 }}>
              NO PREDICTIONS RECORDED
            </div>
          ) : (
            <div className="table-scroll" style={{ marginBottom: 40 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(120px, 1.4fr) repeat(4, minmax(84px, 1fr)) minmax(90px, 1fr)",
                  gap: 12,
                  padding: "8px 14px",
                  minWidth: 640,
                  borderBottom: "1px solid var(--line2)",
                  ...LABEL,
                }}
              >
                <span>Time</span>
                <span style={{ textAlign: "right" }}>RUL</span>
                <span style={{ textAlign: "right" }}>Anomaly</span>
                <span style={{ textAlign: "right" }}>Fault P</span>
                <span style={{ textAlign: "right" }}>Model</span>
                <span style={{ textAlign: "right" }}>Fault Type</span>
              </div>
              {history.map((p) => (
                <div
                  key={p.predictionId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(120px, 1.4fr) repeat(4, minmax(84px, 1fr)) minmax(90px, 1fr)",
                    gap: 12,
                    padding: "10px 14px",
                    minWidth: 640,
                    borderBottom: "1px solid var(--line)",
                    fontFamily: MONO,
                    fontSize: "12px",
                    color: "var(--fg-2)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <span style={{ color: "var(--fg-1)" }}>
                    {new Date(p.createdAt).toLocaleString([], {
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span style={{ textAlign: "right" }}>
                    {p.rulValue ?? DASH}
                    {p.rulValue != null && p.rulUnit ? ` ${p.rulUnit}` : ""}
                  </span>
                  <span style={{ textAlign: "right" }}>{p.anomalyScore?.toFixed(2) ?? DASH}</span>
                  <span style={{ textAlign: "right" }}>{p.faultProbability?.toFixed(2) ?? DASH}</span>
                  <span style={{ textAlign: "right", color: "var(--dim)" }}>
                    {p.model ? `${p.model} v${p.modelVersion}` : DASH}
                  </span>
                  <span style={{ textAlign: "right", color: "var(--dim)" }}>{p.faultType ?? DASH}</span>
                </div>
              ))}
            </div>
          )}

          {/* ══ 04 · ACTIVE INCIDENTS — severity dot + reason + age ══ */}
          <SecHead
            index="04"
            title="Active Incidents"
            note={incidents.length ? `${incidents.length} OPEN` : undefined}
            action={
              <Link
                href="/incidents"
                style={{
                  fontFamily: MONO,
                  fontSize: "10px",
                  letterSpacing: "0.14em",
                  color: "var(--amber)",
                  textDecoration: "none",
                  marginLeft: "auto",
                }}
              >
                VIEW ALL →
              </Link>
            }
          />
          {incidents.length === 0 ? (
            <div className="empty-state">NO OPEN INCIDENTS FOR THIS MACHINE</div>
          ) : (
            <div>
              {incidents.map((incident) => {
                const im = healthMeta(incident.severity);
                return (
                  <Link
                    key={incident.incidentId}
                    href={`/incidents/${incident.incidentId}`}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "12px 14px",
                      borderBottom: "1px solid var(--line)",
                      textDecoration: "none",
                      transition: "background var(--dur-fast)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ flexShrink: 0, paddingTop: 5 }}>
                      <span className={`hw-dot ${im.cssClass}`} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontFamily: MONO,
                          fontSize: "12px",
                          color: "var(--bone)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {incident.title}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: "13px",
                          color: "var(--muted)",
                          marginTop: 3,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {incident.reason}
                      </span>
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: "10px",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: im.token,
                        flexShrink: 0,
                        paddingTop: 5,
                      }}
                    >
                      {im.label}
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: "10px",
                        color: "var(--dim)",
                        flexShrink: 0,
                        paddingTop: 5,
                        minWidth: 64,
                        textAlign: "right",
                      }}
                    >
                      {new Date(incident.createdAt).toLocaleString([], {
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
