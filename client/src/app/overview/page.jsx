"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { getDashboardSummary } from "@/lib/api";
import HealthDot from "@/components/brand/HealthDot";
import { healthMeta } from "@/lib/health";

const MONO = "var(--font-mono)";
const DISPLAY = "var(--font-display)";

function useNightDate() {
  return useMemo(() => {
    if (process.env.NEXT_PUBLIC_SEED_NIGHT_DATE) return process.env.NEXT_PUBLIC_SEED_NIGHT_DATE;
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
}

/* ── Stat tile: mono uppercase label, huge Archivo value, state dot ── */
function StatTile({ label, value, dot, dotColor, href }) {
  const router = useRouter();
  const clickable = Boolean(href);
  return (
    <div
      onClick={clickable ? () => router.push(href) : undefined}
      style={{
        background: "var(--graphite)",
        border: "1px solid var(--line)",
        padding: "16px 18px",
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {dot && <span className={`hw-dot ${dot}`} />}
        <span
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "var(--dim)",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontVariationSettings: "'wdth' 120",
          fontWeight: 800,
          fontSize: "40px",
          lineHeight: 0.95,
          color: dotColor || "var(--bone)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

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

const rollupLabel = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function OverviewPage() {
  const { user } = useAuthStore();
  const nightDate = useNightDate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboardSummary,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const totals = data?.totals;
  const fleet = data?.fleet ?? [];
  const incidents = data?.incidents ?? [];
  const risk = data?.predictedRisk;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const dash = "—";

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
      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "var(--dim)",
            marginBottom: 8,
          }}
        >
          {greeting} — NIGHT OF {nightDate}
          {data?.generatedAt && (
            <span style={{ marginLeft: 12, color: "var(--dim)" }}>
              UPDATED {new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
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
          {user?.username ? `${user.username}'s fleet` : "Fleet"}
        </h1>
      </div>

      {isError ? (
        <div className="empty-state">DASHBOARD UNAVAILABLE — RETRY SHORTLY</div>
      ) : (
        <>
          {/* ══ 01 · STATS BAND — six tiles, all server-computed ══ */}
          <SecHead index="01" title="Overview" note={isLoading ? "LOADING…" : undefined} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
              marginBottom: 40,
            }}
          >
            <StatTile label="Total Machines" value={isLoading ? dash : totals?.machines ?? 0} />
            <StatTile
              label="Healthy"
              value={isLoading ? dash : totals?.healthy ?? 0}
              dot={(isLoading || (totals?.healthy ?? 0) === 0) ? null : "hw-dot--healthy"}
              dotColor={(isLoading || (totals?.healthy ?? 0) === 0) ? null : "var(--health-healthy)"}
            />
            <StatTile
              label="Warning"
              value={isLoading ? dash : totals?.warning ?? 0}
              dot={(isLoading || (totals?.warning ?? 0) === 0) ? null : "hw-dot--warning"}
              dotColor={(isLoading || (totals?.warning ?? 0) === 0) ? null : "var(--health-warning)"}
              href={totals?.warning > 0 ? "/incidents" : undefined}
            />
            <StatTile
              label="Critical"
              value={isLoading ? dash : totals?.critical ?? 0}
              dot={(isLoading || (totals?.critical ?? 0) === 0) ? null : "hw-dot--critical"}
              dotColor={(isLoading || (totals?.critical ?? 0) === 0) ? null : "var(--health-critical)"}
              href={totals?.critical > 0 ? "/incidents" : undefined}
            />
            <StatTile
              label="Active Incidents"
              value={isLoading ? dash : totals?.activeIncidents ?? 0}
              href="/incidents"
            />
            <StatTile
              label="Predicted Risk"
              value={isLoading ? dash : risk ? risk.anomalyScore.toFixed(2) : "0.00"}
              dot={risk && risk.level !== "healthy" ? "hw-dot--warning" : null}
              dotColor={risk && risk.level !== "healthy" ? "var(--health-warning)" : null}
            />
          </div>

          {/* ══ 02 · FLEET — sites with health rollups ══ */}
          <SecHead
            index="02"
            title="Fleet"
            note={fleet.length ? `${fleet.length} SITE${fleet.length === 1 ? "" : "S"}` : undefined}
          />
          {isLoading ? (
            <div className="empty-state">LOADING FLEET…</div>
          ) : fleet.length === 0 ? (
            <div className="empty-state" style={{ marginBottom: 40 }}>
              NO SITES REGISTERED — ADD A SITE TO BEGIN
            </div>
          ) : (
            <div className="table-scroll" style={{ marginBottom: 40 }}>
              {/* header row */}
              <div
                className="fleet-row fleet-head"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(140px, 2fr) 1fr 1fr 1fr 1fr 1fr",
                  gap: 12,
                  padding: "8px 14px",
                  minWidth: 560,
                  borderBottom: "1px solid var(--line2)",
                  fontFamily: MONO,
                  fontSize: "9.5px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--dim)",
                }}
              >
                <span>Site</span>
                <span style={{ textAlign: "right" }}>Machines</span>
                <span style={{ textAlign: "right" }}>OK</span>
                <span style={{ textAlign: "right" }}>Warn</span>
                <span style={{ textAlign: "right" }}>Crit</span>
                <span style={{ textAlign: "right" }}>Status</span>
              </div>
              {fleet.map((site) => {
                const meta = healthMeta(site.status === "healthy" ? "healthy" : site.status);
                return (
                  <Link
                    key={site._id}
                    href={`/sensors`}
                    className="fleet-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(140px, 2fr) 1fr 1fr 1fr 1fr 1fr",
                      gap: 12,
                      padding: "12px 14px",
                      minWidth: 560,
                      borderBottom: "1px solid var(--line)",
                      textDecoration: "none",
                      alignItems: "center",
                      transition: "background var(--dur-fast)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: "12px",
                        color: "var(--bone)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {site.name}
                    </span>
                    <span className="num" style={{ fontFamily: MONO, fontSize: "12px", color: "var(--fg-2)", textAlign: "right" }}>
                      {site.machines}
                    </span>
                    <span className="num" style={{ fontFamily: MONO, fontSize: "12px", color: "var(--fg-2)", textAlign: "right" }}>
                      {site.healthy}
                    </span>
                    <span
                      className="num"
                      style={{
                        fontFamily: MONO,
                        fontSize: "12px",
                        textAlign: "right",
                        color: site.warning > 0 ? "var(--health-warning)" : "var(--fg-3)",
                      }}
                    >
                      {site.warning}
                    </span>
                    <span
                      className="num"
                      style={{
                        fontFamily: MONO,
                        fontSize: "12px",
                        textAlign: "right",
                        color: site.critical > 0 ? "var(--health-critical)" : "var(--fg-3)",
                      }}
                    >
                      {site.critical}
                    </span>
                    <span style={{ display: "flex", justifyContent: "flex-end" }}>
                      <HealthDot status={site.status} />
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* ══ 03 · OPEN INCIDENTS — severity dot + machine + reason + age ══ */}
          <SecHead
            index="03"
            title="Open Incidents"
            note={incidents.length ? `${incidents.length} SHOWN` : undefined}
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
          {isLoading ? (
            <div className="empty-state">LOADING INCIDENTS…</div>
          ) : incidents.length === 0 ? (
            <div className="empty-state">
              NO OPEN INCIDENTS — FLEET NOMINAL FOR {nightDate}
            </div>
          ) : (
            <div>
              {incidents.map((incident) => {
                const meta = healthMeta(incident.severity);
                return (
                  <Link
                    key={incident.incidentId}                      href={`/incidents/${incident.incidentId}`}
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
                      <span className={`hw-dot ${meta.cssClass}`} />
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
                        {incident.machine?.name || "—"}
                        {incident.machine?.assetId ? (
                          <span style={{ color: "var(--dim)" }}> · {incident.machine.assetId}</span>
                        ) : null}
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
                        {incident.title}
                      </span>
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: "10px",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: meta.token,
                        flexShrink: 0,
                        paddingTop: 5,
                      }}
                    >
                      {meta.label}
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
                      {incident.age}
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
