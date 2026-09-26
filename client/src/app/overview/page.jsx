"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { getSites } from "@/lib/api";
import { useIncidents } from "@/hooks/useIncidents";
import { uniqueAssets } from "@/lib/projectContext";
import SeverityBadge from "@/components/events/SeverityBadge";
import ProjectContextBadge from "@/components/shared/ProjectContextBadge";

const MONO = "var(--font-mono)";
const SANS = "var(--font-sans)";

function useNightDate() {
  return useMemo(() => {
    if (process.env.NEXT_PUBLIC_SEED_NIGHT_DATE) return process.env.NEXT_PUBLIC_SEED_NIGHT_DATE;
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
}

function StatCard({ label, value, sub, accent, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        minWidth: "160px",
        background: hovered && onClick ? "var(--bg-surface-3)" : "var(--bg-surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "2px",
        padding: "16px",
        cursor: onClick ? "pointer" : "default",
        transition: `background var(--dur-fast)`,
      }}>
      <div style={{
        fontFamily: MONO,
        fontSize: "10px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "var(--fg-3)",
        marginBottom: "8px",
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: MONO,
        fontSize: "28px",
        fontWeight: 700,
        color: accent || "var(--fg-1)",
        lineHeight: 1,
        marginBottom: "4px",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontFamily: SANS,
          fontSize: "12px",
          color: "var(--fg-4)",
          marginTop: "6px",
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}


function GhostBtn({ children, href }) {
  return (
    <Link href={href} style={{
      background: "transparent",
      color: "var(--fg-3)",
      border: "1px solid var(--border-default)",
      borderRadius: "2px",
      padding: "7px 16px",
      fontSize: "13px",
      fontFamily: SANS,
      cursor: "pointer",
      textDecoration: "none",
      display: "inline-block",
    }}>
      {children}
    </Link>
  );
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function OverviewPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const nightDate = useNightDate();

  const { data: sites, isLoading: sitesLoading } = useQuery({
    queryKey: ["sites"],
    queryFn: getSites,
    staleTime: 60 * 1000,
  });

  const { data: incidentsData, isLoading: incidentsLoading } = useIncidents(
    { nightDate },
    { staleTime: 60 * 1000, retry: false },
  );

  const incidents = incidentsData?.incidents ?? [];

  const totalIncidents = incidents.length;
  const criticalCount = incidentsData?.critical?.length ?? 0;
  const warningCount = incidentsData?.warning?.length ?? 0;
  const assetsImpacted = uniqueAssets(incidents);

  const isLoading = incidentsLoading || sitesLoading;

  const firstSite = sites?.[0];
  // Prefer the user's first real Site record; fall back to a label derived
  // from the account name. (Previously `firstSite?.name || user?.username ?
  // ...` bound the wrong way: ANY username produced "<username>'s site",
  // ignoring the real site name entirely.)
  const siteName = firstSite?.name
    ? firstSite.name
    : user?.username
      ? `${user.username}'s site`
      : "Your site";
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-base)",
      padding: "32px 24px",
      maxWidth: "900px",
      margin: "0 auto",
    }}>
      {/* Morning status card */}
      <section style={{
        background: "var(--bg-surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "2px",
        padding: "24px",
        marginBottom: "24px",
      }}>
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
        }}>
          <div>
            <div style={{
              fontFamily: MONO,
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--fg-4)",
              marginBottom: "8px",
            }}>
              {greeting} — {nightDate}
              <Link
                href="/docs#how-it-works"
                style={{
                  marginLeft: "12px",
                  color: "var(--accent)",
                  textDecoration: "none",
                  fontSize: "10px",
                  letterSpacing: "0.1em",
                }}
              >
                ? Learn more
              </Link>
            </div>
            <h1 style={{
              fontFamily: SANS,
              fontSize: "24px",
              fontWeight: 500,
              color: "var(--fg-1)",
              margin: "0 0 6px",
            }}>
              {siteName}
            </h1>

            {isLoading ? (
              <div style={{ fontFamily: SANS, fontSize: "13px", color: "var(--fg-4)" }}>
                Loading overnight data…
              </div>
            ) : totalIncidents > 0 ? (
              <div style={{ fontFamily: SANS, fontSize: "14px", color: "var(--fg-2)" }}>
                {totalIncidents} incident{totalIncidents !== 1 ? "s" : ""} recorded overnight
                {criticalCount > 0 ? ` — ${criticalCount} critical` : warningCount > 0 ? ` — ${warningCount} warning` : ""}.
              </div>
            ) : (
              <div style={{ fontFamily: SANS, fontSize: "14px", color: "var(--fg-3)" }}>
                No overnight incidents for {nightDate} yet. Telemetry recorded tonight will appear here tomorrow morning.
              </div>
            )}
          </div>

          {/* CTA */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
            <GhostBtn href="/incidents">View incidents</GhostBtn>
          </div>
        </div>
      </section>

      {incidents.length === 0 && isLoading ? (
        <section style={{
          background: "var(--bg-surface-1)",
          border: "1px solid var(--border-default)",
          borderRadius: "2px",
          padding: "48px 24px",
          textAlign: "center",
        }}>
          <div style={{
            fontFamily: MONO,
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "var(--fg-4)",
            marginBottom: "8px",
          }}>
            Overnight
          </div>
          <div style={{
            fontFamily: SANS,
            fontSize: "14px",
            color: "var(--fg-4)",
          }}>
            Loading overnight data…
          </div>
        </section>
      ) : (
        <>
          {/* Stat cards — only features with real backing in this build. */}
          <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "12px",
        marginBottom: "24px",
      }}>
        <StatCard
          label="Incidents"
          value={incidentsLoading ? "—" : totalIncidents}
          sub={
            criticalCount > 0 && warningCount > 0 ? `${criticalCount} critical · ${warningCount} warning` :
            criticalCount > 0 ? `${criticalCount} critical` :
            warningCount > 0 ? `${warningCount} warning` :
            "None flagged"
          }
          accent={criticalCount > 0 ? "var(--sev-serious)" : "var(--fg-1)"}
          onClick={() => router.push("/incidents")}
        />
        <StatCard
          label="Assets Impacted"
          value={incidentsLoading ? "—" : assetsImpacted}
          sub={assetsImpacted === 1 ? "1 machine involved" : "Distinct machines in overnight incidents"}
          accent={assetsImpacted > 0 ? "var(--sev-minor)" : "var(--fg-4)"}
          onClick={() => router.push("/incidents")}
        />
        <StatCard
          label="Night"
          value={nightDate}
        />
      </div>

      {/* Recent incidents */}
      {totalIncidents > 0 && (
        <section style={{
          background: "var(--bg-surface-1)",
          border: "1px solid var(--border-default)",
          borderRadius: "2px",
          overflow: "hidden",
          marginBottom: "24px",
        }}>
          <div style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--border-hairline)",
            background: "var(--bg-surface-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{
              fontFamily: MONO,
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--fg-3)",
            }}>
              Recent incidents
            </span>
            <Link href="/incidents" style={{
              fontFamily: MONO,
              fontSize: "10px",
              color: "var(--accent)",
              textDecoration: "none",
              letterSpacing: "0.08em",
            }}>
              View all →
            </Link>
          </div>
          {incidents.slice(0, 5).map((incident) => {
            const incidentId = incident.id || incident._id;
            return (
            <Link
              key={incidentId}
              href={`/incident/${incidentId}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "var(--space-3)",
                padding: "var(--space-3) var(--space-4)",
                borderBottom: "1px solid var(--border-hairline)",
                textDecoration: "none",
                transition: "background 120ms",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface-2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ flexShrink: 0, paddingTop: "var(--space-1)" }}>
                <SeverityBadge severity={incident.severity || 'uncertain'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: SANS,
                  fontSize: "13px",
                  color: "var(--fg-1)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {incident.title || incident.description || "Unnamed incident"}
                </div>
                <div style={{
                  fontFamily: MONO,
                  fontSize: "11px",
                  color: "var(--fg-4)",
                  marginTop: "var(--space-1)",
                }}>
                  <ProjectContextBadge projectContext={incident.projectContext} fallback="—" />
                </div>
              </div>
              <div style={{
                fontFamily: MONO,
                fontSize: "10px",
                color: "var(--fg-4)",
                flexShrink: 0,
                paddingTop: "var(--space-1)",
              }}>
                {incident.createdAt ? formatTime(incident.createdAt) : "—"}
              </div>
            </Link>
          );
          })}
        </section>
      )}

          {/* Empty state — real pipeline-backed: reflects actual incident queries for the period */}
      {!isLoading && totalIncidents === 0 && (
        <section style={{
          background: "var(--bg-surface-1)",
          border: "1px solid var(--border-default)",
          borderRadius: "2px",
          padding: "48px 24px",
          textAlign: "center",
        }}>
          <div style={{
            fontFamily: MONO,
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "var(--fg-4)",
            marginBottom: "8px",
          }}>
            Overnight
          </div>
          <div style={{
            fontFamily: SANS,
            fontSize: "16px",
            color: "var(--fg-3)",
            marginBottom: "4px",
          }}>
            No incidents recorded for {nightDate}
          </div>
          <div style={{
            fontFamily: SANS,
            fontSize: "13px",
            color: "var(--fg-4)",
          }}>
            Telemetry recorded tonight will be scored overnight; any resulting incidents will appear here tomorrow morning.
          </div>
        </section>
      )}
        </>
      )}
    </div>
  );
}
