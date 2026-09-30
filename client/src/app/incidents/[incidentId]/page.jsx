"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getIncidentDetail, updateIncidentStatus } from "@/lib/api";
import { healthMeta } from "@/lib/health";
import HealthDot from "@/components/brand/HealthDot";
import ArgusExplanation from "@/components/incident/ArgusExplanation";

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
function SecHead({ index, title, note }) {
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
        <span style={{ ...LABEL, marginLeft: "auto", fontSize: "9.5px" }}>{note}</span>
      )}
    </div>
  );
}

/* ── Mono evidence block: raw JSON on the lowest surface, copyable feel ── */
function EvidenceBlock({ label, value }) {
  return (
    <div>
      <div style={{ ...LABEL, marginBottom: 8 }}>{label}</div>
      <pre
        className="json-block"
        style={{ margin: 0, fontSize: "11px", userSelect: "all" }}
      >
        {value}
      </pre>
    </div>
  );
}

const LIFECYCLE = ["open", "reviewed", "closed"];

/* ── Status lifecycle: open → reviewed → closed, with the update control ── */
function StatusLifecycle({ incidentId, status }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);

  const mutation = useMutation({
    mutationFn: (next) => updateIncidentStatus(incidentId, next),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["incident-detail", incidentId] });
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (e) => setError(e?.message || "Could not update status"),
  });

  const idx = LIFECYCLE.indexOf(status);
  const next = LIFECYCLE[idx + 1];
  const advancing = mutation.isPending;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        padding: "10px 14px",
        border: "1px solid var(--line)",
        background: "var(--graphite)",
      }}
    >
      {LIFECYCLE.map((s, i) => {
        const done = idx > i;
        const current = idx === i;
        return (
          <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
            {i > 0 && (
              <span
                aria-hidden="true"
                style={{ width: 22, height: 1, background: done ? "var(--line2)" : "var(--line)" }}
              />
            )}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: MONO,
                fontSize: "10px",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: current ? "var(--bone)" : done ? "var(--muted)" : "var(--dim)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: current ? "var(--amber)" : done ? "var(--muted)" : "var(--line2)",
                }}
              />
              {s}
            </span>
          </span>
        );
      })}

      {next && (
        <button
          onClick={() => mutation.mutate(next)}
          disabled={advancing}
          style={{
            marginLeft: "auto",
            background: "transparent",
            color: "var(--amber)",
            border: "1px solid var(--amber)",
            fontFamily: MONO,
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "6px 14px",
            cursor: advancing ? "wait" : "pointer",
            opacity: advancing ? 0.6 : 1,
            transition: "background var(--dur-fast), color var(--dur-fast)",
          }}
          onMouseEnter={(e) => {
            if (!advancing) {
              e.currentTarget.style.background = "var(--amber)";
              e.currentTarget.style.color = "var(--night)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--amber)";
          }}
        >
          {advancing ? "Updating…" : `Mark ${next}`}
        </button>
      )}
      {!next && (
        <span style={{ ...LABEL, marginLeft: "auto", fontSize: "9.5px" }}>
          CLOSED — LIFECYCLE COMPLETE
        </span>
      )}
      {error && (
        <span
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            color: "var(--health-critical)",
            flexBasis: "100%",
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

export default function IncidentDetailPage() {
  const params = useParams();
  const incidentId = params?.incidentId;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["incident-detail", incidentId],
    queryFn: () => getIncidentDetail(incidentId),
    enabled: Boolean(incidentId),
    staleTime: 15 * 1000,
    retry: 1,
  });

  const incident = data?.incident;
  const machine = data?.machine;
  const event = data?.event;
  const prediction = data?.prediction;

  const meta = incident ? healthMeta(incident.severity) : null;
  const fmt = (d) =>
    d ? new Date(d).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : DASH;

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
        <div className="empty-state">INCIDENT NOT FOUND — OR NOT VISIBLE TO THIS ACCOUNT</div>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Link
            href="/incidents"
            style={{
              fontFamily: MONO,
              fontSize: "10px",
              letterSpacing: "0.14em",
              color: "var(--amber)",
              textDecoration: "none",
            }}
          >
            ← BACK TO INCIDENTS
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
      {/* ── Header: breadcrumb, severity dot, title, machine link ── */}
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
          <Link href="/incidents" style={{ color: "var(--dim)", textDecoration: "none" }}>
            Incidents
          </Link>
          <span style={{ color: "var(--dim)" }}>/</span>
          <span style={{ color: "var(--muted)" }}>{incident?.incidentId ?? incidentId}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Severity dot — the one amber-spend on this page is here and the CTA */}
          {incident && <HealthDot status={incident.severity} size={10} />}
          <h1
            style={{
              fontFamily: DISPLAY,
              fontVariationSettings: "'wdth' 124",
              fontWeight: 800,
              fontSize: "30px",
              lineHeight: 0.95,
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              color: "var(--bone)",
              margin: 0,
            }}
          >
            {incident?.title ?? (isLoading ? "LOADING…" : "INCIDENT")}
          </h1>
        </div>

        <div
          style={{
            fontFamily: MONO,
            fontSize: "10px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--dim)",
            marginTop: 12,
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {machine && (
            <Link
              href={`/machines/${machine._id}`}
              style={{
                color: "var(--bone)",
                textDecoration: "none",
                borderBottom: "1px solid var(--line2)",
                paddingBottom: 1,
              }}
            >
              {machine.name} · {machine.assetId}
            </Link>
          )}
          {data?.site && <span>SITE · {data.site.name}</span>}
          <span>RAISED · {fmt(incident?.createdAt)}</span>
          {incident?.lastSeenAt && <span>LAST SEEN · {fmt(incident.lastSeenAt)}</span>}
          {incident && incident.occurrenceCount > 1 && (
            <span>SEEN ×{incident.occurrenceCount}</span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state">LOADING INCIDENT…</div>
      ) : (
        <>
          {/* ══ 01 · STATUS LIFECYCLE — open → reviewed → closed ══ */}
          <SecHead index="01" title="Status" note={incident ? `TYPE · ${incident.type}` : undefined} />
          <div style={{ marginBottom: 40 }}>
            <StatusLifecycle incidentId={incidentId} status={incident?.status ?? "open"} />
          </div>

          {/* ══ 02 · REASON — one deterministic sentence ══ */}
          <SecHead index="02" title="Reason" />
          <div
            style={{
              background: "var(--graphite)",
              border: "1px solid var(--line)",
              padding: "14px 16px",
              fontSize: "15px",
              lineHeight: 1.6,
              color: "var(--fg-2)",
              marginBottom: 40,
            }}
          >
            {incident?.reason || DASH}
          </div>

          {/* ══ 03 · RECOMMENDED NEXT ACTION — plain checklist item ══ */}
          <SecHead index="03" title="Recommended Next Action" />
          <div style={{ marginBottom: 40 }}>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                background: "var(--graphite)",
                border: "1px solid var(--line)",
                padding: "14px 16px",
                cursor: "default",
              }}
            >
              <input
                type="checkbox"
                readOnly
                checked={incident?.status === "closed"}
                style={{
                  marginTop: 4,
                  width: 14,
                  height: 14,
                  accentColor: "var(--amber)",
                }}
              />
              <span style={{ fontSize: "15px", lineHeight: 1.6, color: "var(--fg-2)" }}>
                {data?.nextAction || DASH}
              </span>
            </label>
          </div>

          {/* ══ 04 · EVIDENCE — triggering event + prediction, verbatim JSON ══ */}
          <SecHead
            index="04"
            title="Evidence"
            note={event && prediction ? "EVENT → PREDICTION" : event ? "EVENT ONLY" : undefined}
          />
          {!event && !prediction ? (
            <div className="empty-state">NO EVIDENCE ATTACHED TO THIS INCIDENT</div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 10,
              }}
            >
              <EvidenceBlock
                label="TRIGGERING SENSOR EVENT"
                value={JSON.stringify(event ?? { note: "not retained for this incident" }, null, 2)}
              />
              <EvidenceBlock
                label="PREDICTION THAT CAUSED IT"
                value={JSON.stringify(prediction ?? { note: "not retained for this incident" }, null, 2)}
              />
            </div>
          )}

          {/* ══ 05 · ARGUS EXPLANATION — plain-language root cause ══
           * The explanation rides on the incident sub-document, which the
           * detail aggregation already includes. ArgusExplanation handles
           * pending / failed / missing / ready states on its own. */}
          <SecHead
            index="05"
            title="Argus Explanation"
            note={
              incident?.explanation?.source
                ? `SOURCE · ${String(incident.explanation.source).toUpperCase()}`
                : undefined
            }
          />
          <div>
            <ArgusExplanation explanation={incident?.explanation ?? null} />
          </div>
        </>
      )}
    </div>
  );
}
