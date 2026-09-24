"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Copy, Check } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

const SECTIONS = [
  { id: "what-is",        label: "What is Sentinel?" },
  { id: "how-it-works",   label: "How it works" },
  { id: "getting-started",label: "Getting started" },
  { id: "sensors",        label: "Sensors & connectivity" },
  { id: "ingest",         label: "Sending readings" },
  { id: "api",            label: "API reference" },
  { id: "incidents",      label: "Understanding incidents" },
  { id: "briefing",       label: "Morning briefing" },
  { id: "security",       label: "Security" },
  { id: "webhooks",       label: "Webhooks" },
  { id: "self-host",      label: "Self-hosting" },
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{
        background: "none",
        border: "1px solid var(--border-strong)",
        borderRadius: "2px",
        padding: "4px 8px",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        color: copied ? "var(--sev-harmless)" : "var(--fg-3)",
        transition: "color 120ms ease",
      }}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({ children, copyable, text }) {
  const body = typeof children === "string" ? children : String(children);
  return (
    <div style={{ position: "relative", margin: "12px 0" }}>
      <pre style={{
        background: "var(--bg-surface-2)",
        border: "1px solid var(--border-default)",
        borderRadius: "2px",
        padding: "14px 16px",
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
        color: "var(--fg-2)",
        overflowX: "auto",
        lineHeight: 1.6,
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {body}
      </pre>
      {copyable && (
        <div style={{ position: "absolute", top: "8px", right: "8px" }}>
          <CopyButton text={text || body} />
        </div>
      )}
    </div>
  );
}

function SectionWrapper({ id, children }) {
  return (
    <section id={id} style={{
      background: "var(--bg-surface-1)",
      border: "1px solid var(--border-default)",
      borderRadius: "2px",
      overflow: "hidden",
      marginBottom: "24px",
      scrollMarginTop: "32px",
    }}>
      {children}
    </section>
  );
}

function SectionHead({ children }) {
  return (
    <div style={{
      padding: "10px 20px",
      borderBottom: "1px solid var(--border-hairline)",
      background: "var(--bg-surface-2)",
    }}>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "var(--fg-3)",
      }}>
        {children}
      </span>
    </div>
  );
}

function SectionBody({ children }) {
  return (
    <div style={{ padding: "20px" }}>
      {children}
    </div>
  );
}

function Body({ children, style }) {
  return (
    <p style={{
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-base)",
      color: "var(--fg-2)",
      lineHeight: 1.65,
      margin: "0 0 12px",
      ...style,
    }}>
      {children}
    </p>
  );
}

function Label({ children }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)",
      fontSize: "var(--text-xs)",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      color: "var(--fg-3)",
      margin: "20px 0 8px",
    }}>
      {children}
    </div>
  );
}

function Tag({ children }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)",
      fontSize: "11px",
      color: "var(--accent)",
      background: "rgba(184,212,232,0.08)",
      border: "1px solid rgba(184,212,232,0.2)",
      borderRadius: "2px",
      padding: "3px 8px",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function Method({ method, color }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      fontWeight: 700,
      letterSpacing: "0.08em",
      color,
      minWidth: "52px",
      flexShrink: 0,
      paddingTop: "1px",
    }}>
      {method}
    </span>
  );
}

const C_GREEN = "var(--sev-harmless)";
const C_BLUE = "var(--accent)";
const C_YELLOW = "var(--sev-minor)";
const C_RED = "var(--sev-serious)";

function EndpointList({ rows }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      {rows.map(([method, path, desc, color]) => (
        <div key={method + path} style={{
          display: "flex",
          gap: "12px",
          padding: "7px 0",
          borderBottom: "1px solid var(--border-hairline)",
          alignItems: "flex-start",
        }}>
          <Method method={method} color={color || (method === "GET" ? C_BLUE : method === "DELETE" ? C_RED : C_GREEN)} />
          <code style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--fg-1)",
            flexShrink: 0,
            width: "300px",
            wordBreak: "break-all",
            paddingTop: "1px",
          }}>
            {path}
          </code>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: "13px", color: "var(--fg-3)", lineHeight: 1.5 }}>
            {desc}
          </span>
        </div>
      ))}
    </div>
  );
}

const FIRST_READING_CURL = `curl -X POST http://localhost:8000/api/v1/events \\
  -H "Authorization: Bearer <YOUR_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "siteId": "site_xxxxxxxx",
    "machineId": "machine_xxxxxxxx",
    "sensorId": "sensor_xxxxxxxx",
    "type": "sensor_reading",
    "timestamp": "2026-09-24T10:00:00.000Z",
    "values": { "vibration": 0.42 }
  }'`;

const READING_NOTE = `The sensorId in the payload is the string id shown in the
Connect step (sensor_...), not the internal database id. siteId and
machineId must belong to the same hierarchy as the sensor.`;

const SENSOR_STATUS_ROWS = [
  ["WAITING", "var(--fg-4)", "No reading has ever arrived (lastReadingAt is null)."],
  ["ONLINE", C_GREEN, "Age of last reading \u2264 3 \u00d7 expectedIntervalSec."],
  ["STALE", C_YELLOW, "Age \u2264 10 \u00d7 expectedIntervalSec (older than 3\u00d7)."],
  ["OFFLINE", C_RED, "Age > 10 \u00d7 expectedIntervalSec, or still nothing after data stopped."],
];

const API_GROUPS = [
  {
    title: "Auth — session (JWT httpOnly cookies)",
    rows: [
      ["POST", "/api/v1/auth/register", "Create the account (email + username + password)."],
      ["POST", "/api/v1/auth/verify-email", "Verify with the emailed OTP."],
      ["POST", "/api/v1/auth/login", "Log in, sets the session cookie."],
      ["POST", "/api/v1/auth/refresh-token", "Rotate the access token."],
      ["GET", "/api/v1/auth/current-user", "Current account."],
      ["POST", "/api/v1/auth/logout", "End the session."],
    ],
  },
  {
    title: "Sites",
    rows: [
      ["GET", "/api/v1/sites", "List your sites."],
      ["POST", "/api/v1/sites", "Create a site (name, timezone, coordinates)."],
      ["GET", "/api/v1/sites/:siteId", "Site detail."],
      ["PATCH", "/api/v1/sites/:siteId", "Update site fields."],
      ["DELETE", "/api/v1/sites/:siteId", "Delete a site."],
    ],
  },
  {
    title: "Machines",
    rows: [
      ["GET", "/api/v1/machines/sites/:siteId/machines", "List machines at a site."],
      ["POST", "/api/v1/machines/sites/:siteId/machines", "Create a machine (name, machineType, assetId)."],
      ["GET", "/api/v1/machines/:machineId", "Machine detail incl. computed health."],
      ["PATCH", "/api/v1/machines/:machineId", "Update machine."],
      ["DELETE", "/api/v1/machines/:machineId", "Delete a machine."],
    ],
  },
  {
    title: "Sensors — connectivity is computed on read, never stored",
    rows: [
      ["GET", "/api/v1/sensors/summary", "limit / total / remaining, status counts, byType — one aggregation."],
      ["GET", "/api/v1/sensors", "Flat list with siteName, machineName, status, ageSec."],
      ["GET", "/api/v1/sensors/machines/:machineId/sensors", "Per-machine list, includes computed status."],
      ["POST", "/api/v1/sensors/machines/:machineId/sensors", "Create a sensor (name, type, expectedIntervalSec)."],
      ["GET", "/api/v1/sensors/:sensorId", "Sensor detail."],
      ["PATCH", "/api/v1/sensors/:sensorId", "Rename or change the expected interval."],
      ["DELETE", "/api/v1/sensors/:sensorId", "Delete — frees a slot against the limit."],
    ],
  },
  {
    title: "Events — gateway ingestion (Bearer API key, not cookies)",
    rows: [
      ["POST", "/api/v1/events", "Ingest a reading. Idempotent per user; stamps sensor lastReadingAt."],
      ["GET", "/api/v1/events", "Query stored events (session auth)."],
      ["GET", "/api/v1/events/:eventId", "Event detail (session auth)."],
    ],
  },
  {
    title: "Predictions & machine health",
    rows: [
      ["GET", "/api/v1/predictions/machines/:machineId", "Prediction history for a machine."],
      ["GET", "/api/v1/predictions/machines/:machineId/latest", "Most recent prediction."],
      ["GET", "/api/v1/predictions/:predictionId", "Prediction detail."],
    ],
  },
  {
    title: "Incidents",
    rows: [
      ["GET", "/api/v1/incidents", "List (filter by nightDate, status, severity)."],
      ["GET", "/api/v1/incidents/:incidentId", "Incident detail."],
      ["PATCH", "/api/v1/incidents/:incidentId/status", "Review / escalate / close."],
    ],
  },
  {
    title: "Morning briefing (Argus)",
    rows: [
      ["GET", "/api/v1/briefings/latest?nightDate=YYYY-MM-DD", "Latest briefing."],
      ["PATCH", "/api/v1/briefings/:id/sections/:sectionName", "Edit one section."],
      ["POST", "/api/v1/briefings/:id/approve", "Approve and trigger the webhook handoff."],
    ],
  },
  {
    title: "Settings — one API key per account",
    rows: [
      ["GET", "/api/v1/settings/api-key", "Metadata only: prefix, created, last used — never the secret."],
      ["POST", "/api/v1/settings/api-key", "Generate a key (replaces the old one). Raw key shown once."],
      ["DELETE", "/api/v1/settings/api-key", "Revoke immediately."],
    ],
  },
  {
    title: "Health",
    rows: [
      ["GET", "/api/v1/health", "Liveness + mongo/redis status. No auth."],
    ],
  },
];

const WEBHOOK_EVENTS = [
  ["incident.created",        "Correlation produces a new incident."],
  ["incident.classified",     "Argus assigns final severity classification."],
  ["investigation.completed", "Investigation finishes (any outcome)."],
  ["briefing.approved",       "Operator approves the morning briefing."],
];

const WEBHOOK_VERIFY_NODE = `import crypto from "crypto";

export function verifySentinelSignature(rawBody, header, secret) {
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(rawBody)              // raw JSON bytes, NOT parsed object
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`;

const WEBHOOK_VERIFY_PY = `import hmac, hashlib

def verify_sentinel_signature(raw_body: bytes, header: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, header or "")`;

export default function DocsPage() {
  const user = useAuthStore((s) => s.user);
  const [activeSection, setActiveSection] = useState("what-is");
  const contentRef = useRef(null);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      { root: content, threshold: 0.2 }
    );

    SECTIONS.forEach(({ id }) => {
      const el = content.querySelector(`#${id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      background: "var(--bg-base)",
    }}>
      {/* Sidebar */}
      <div style={{
        width: "220px",
        flexShrink: 0,
        position: "fixed",
        top: 0,
        bottom: 0,
        left: 0,
        background: "var(--bg-surface-1)",
        borderRight: "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}>
        {/* Logo */}
        <div style={{
          padding: "20px 16px 16px",
          borderBottom: "1px solid var(--border-hairline)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{
              width: "7px", height: "7px", borderRadius: "50%",
              background: "var(--accent)", flexShrink: 0,
            }} />
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              fontWeight: 700,
              color: "var(--fg-1)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}>
              Sentinel
            </span>
          </div>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--fg-4)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            paddingLeft: "15px",
          }}>
            Documentation
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px" }}>
          {SECTIONS.map(({ id, label }) => {
            const active = activeSection === id;
            return (
              <a
                key={id}
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  const el = document.getElementById(id);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  setActiveSection(id);
                }}
                style={{
                  display: "block",
                  padding: "6px 10px",
                  marginBottom: "2px",
                  borderRadius: "2px",
                  fontFamily: "var(--font-sans)",
                  fontSize: "13px",
                  color: active ? "var(--fg-1)" : "var(--fg-3)",
                  background: active ? "var(--bg-surface-3)" : "transparent",
                  borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                  textDecoration: "none",
                  transition: "color 120ms ease, background 120ms ease",
                }}
              >
                {label}
              </a>
            );
          })}
        </nav>

        {/* Bottom CTAs */}
        <div style={{
          padding: "12px 8px 16px",
          borderTop: "1px solid var(--border-hairline)",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}>
          {user ? (
            <Link href="/overview" style={{
              display: "block",
              padding: "7px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--bg-base)",
              background: "var(--accent)",
              borderRadius: "2px",
              textDecoration: "none",
              textAlign: "center",
              fontWeight: 600,
            }}>
              Console →
            </Link>
          ) : (
            <>
              <Link href="/login" style={{
                display: "block",
                padding: "7px 10px",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--fg-2)",
                background: "var(--bg-surface-2)",
                border: "1px solid var(--border-default)",
                borderRadius: "2px",
                textDecoration: "none",
                textAlign: "center",
              }}>
                Sign in →
              </Link>
              <Link href="/register" style={{
                display: "block",
                padding: "7px 10px",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--bg-base)",
                background: "var(--accent)",
                borderRadius: "2px",
                textDecoration: "none",
                textAlign: "center",
              }}>
                Get started →
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        style={{
          marginLeft: "220px",
          flex: 1,
          padding: "32px 48px 80px",
          maxWidth: "900px",
          overflowY: "auto",
        }}
      >
        {/* ══ What is Sentinel ══ */}
        <SectionWrapper id="what-is">
          <SectionHead>What is Sentinel?</SectionHead>
          <SectionBody>
            <Body>
              Sentinel is a single-owner industrial predictive-maintenance platform. You register your sites, machines, and sensors; gateways POST real readings to the events API; a Python ML service turns them into Remaining Useful Life, anomaly, and fault-probability predictions; and those predictions roll up into machine health and actionable incidents.
            </Body>
            <Body>
              There are no organizations, roles, or teams. One account owns everything: <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--accent)" }}>User → Site → Machine → Sensor → Event → Prediction → Machine Health → Incident</span>. Overnight, Argus — the AI analyst — investigates what happened and drafts the Morning Operations Briefing.
            </Body>
            <div style={{ display: "flex", gap: "12px", marginTop: "16px", flexWrap: "wrap" }}>
              {[
                ["Sensor connectivity", "Computed from real data — never a manually-set status"],
                ["ML predictions", "RUL, anomaly score, fault probability per reading"],
                ["Morning briefing", "Argus drafts it overnight; you review and approve"],
              ].map(([title, desc]) => (
                <div key={title} style={{
                  flex: "1",
                  minWidth: "180px",
                  padding: "12px",
                  background: "var(--bg-surface-2)",
                  border: "1px solid var(--border-hairline)",
                  borderRadius: "2px",
                }}>
                  <div style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "var(--accent)",
                    marginBottom: "6px",
                  }}>
                    {title}
                  </div>
                  <div style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "13px",
                    color: "var(--fg-3)",
                    lineHeight: 1.5,
                  }}>
                    {desc}
                  </div>
                </div>
              ))}
            </div>
          </SectionBody>
        </SectionWrapper>

        {/* ══ How it works ══ */}
        <SectionWrapper id="how-it-works">
          <SectionHead>How it works</SectionHead>
          <SectionBody>
            <Body>Every reading flows through five stages:</Body>
            <div style={{ display: "flex", alignItems: "stretch", gap: "0", margin: "20px 0", overflowX: "auto" }}>
              {[
                { step: "01", label: "INGEST", desc: "Gateways POST readings to /api/v1/events with your API key.", color: "var(--fg-3)" },
                { step: "02", label: "PREDICT", desc: "A queue feeds the ML service: RUL, anomaly, fault probability.", color: "var(--accent-dim)" },
                { step: "03", label: "HEALTH", desc: "Predictions roll up into machine health: HEALTHY → CRITICAL.", color: "var(--accent)" },
                { step: "04", label: "INCIDENT", desc: "Threshold crossings open incidents for review and escalation.", color: "var(--sev-minor)" },
                { step: "05", label: "BRIEFING", desc: "Argus drafts the morning briefing; you approve for day shift.", color: "var(--sev-harmless)" },
              ].map(({ step, label, desc, color }, i) => (
                <div key={step} style={{ display: "flex", alignItems: "stretch" }}>
                  <div style={{
                    padding: "16px",
                    background: "var(--bg-surface-2)",
                    border: "1px solid var(--border-default)",
                    borderRight: i < 4 ? "none" : "1px solid var(--border-default)",
                    width: "140px",
                    flexShrink: 0,
                  }}>
                    <div style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      color: "var(--fg-4)",
                      letterSpacing: "0.1em",
                      marginBottom: "4px",
                    }}>
                      {step}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      color,
                      marginBottom: "8px",
                    }}>
                      {label}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "12px",
                      color: "var(--fg-3)",
                      lineHeight: 1.5,
                    }}>
                      {desc}
                    </div>
                  </div>
                  {i < 4 && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "0 4px",
                      background: "var(--bg-surface-2)",
                      border: "1px solid var(--border-default)",
                      borderLeft: "none",
                      borderRight: "none",
                    }}>
                      <span style={{ color: "var(--accent)", fontSize: "12px" }}>→</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Body>
              Sensor connectivity is computed on every read from <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--fg-1)" }}>lastReadingAt</span> and <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--fg-1)" }}>expectedIntervalSec</span> — there is no stored status field to go stale. Stop the data and the sensor drifts ONLINE → STALE → OFFLINE on its own.
            </Body>
          </SectionBody>
        </SectionWrapper>

        {/* ══ Getting started ══ */}
        <SectionWrapper id="getting-started">
          <SectionHead>Getting started</SectionHead>
          <SectionBody>
            <Body>
              The whole journey happens on the <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--fg-1)" }}>/sensors</span> page — an onboarding checklist tracks these steps from your real data and hides itself when everything is done.
            </Body>
            {[
              ["Register", "Create your account at /register and verify with the emailed code. Your account owns the whole system."],
              ["Create a site and machine", "On /sensors, use Add sensor — step 1 lets you create a site and machine inline if you don't have them yet."],
              ["Add a sensor", "Step 2: name it, pick the type (temperature, vibration, pressure, current, voltage, rpm, flow) and the expected interval between readings."],
              ["Generate your API key", "Step 3 (Connect): generate the single API key for your account. The secret is shown exactly once."],
              ["Send the first reading", "Copy the curl example from the Connect step and run it. The indicator flips from \u201cWaiting for first reading\u2026\u201d to \u201cConnected\u201d within seconds — no refresh needed."],
            ].map(([title, desc], i) => (
              <div key={i} style={{ display: "flex", gap: "16px", alignItems: "flex-start", marginBottom: "16px" }}>
                <div style={{
                  flexShrink: 0,
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: "var(--bg-surface-2)",
                  border: "1px solid var(--border-strong)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--accent)",
                }}>
                  {i + 1}
                </div>
                <div>
                  <div style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--fg-1)",
                    marginBottom: "4px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}>
                    {title}
                  </div>
                  <div style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "13px",
                    color: "var(--fg-2)",
                    lineHeight: 1.5,
                  }}>
                    {desc}
                  </div>
                </div>
              </div>
            ))}
          </SectionBody>
        </SectionWrapper>

        {/* ══ Sensors & connectivity ══ */}
        <SectionWrapper id="sensors">
          <SectionHead>Sensors &amp; connectivity</SectionHead>
          <SectionBody>
            <Body>
              Every sensor declares an <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--fg-1)" }}>expectedIntervalSec</span> — how often it should report (default 60, minimum 1, maximum 86400). Ingestion stamps <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--fg-1)" }}>lastReadingAt</span> atomically on every accepted reading; the status is always computed at read time.
            </Body>

            <Label>Status rules (boundaries inclusive)</Label>
            <div style={{ marginBottom: "20px" }}>
              {SENSOR_STATUS_ROWS.map(([sev, color, desc]) => (
                <div key={sev} style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  background: "var(--bg-surface-2)",
                  border: "1px solid var(--border-hairline)",
                  borderBottom: "none",
                }}>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    color,
                    minWidth: "72px",
                    paddingTop: "1px",
                  }}>
                    {sev}
                  </span>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: "13px", color: "var(--fg-2)", lineHeight: 1.5 }}>
                    {desc}
                  </span>
                </div>
              ))}
              <div style={{ height: "1px", background: "var(--border-hairline)" }} />
            </div>
            <Body style={{ fontSize: "13px", color: "var(--fg-3)" }}>
              Example: a sensor with a 60s interval is ONLINE for 3 minutes after its last reading, STALE until 10 minutes, then OFFLINE. The multipliers live in named constants (<span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>ONLINE_MULTIPLIER = 3</span>, <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>STALE_MULTIPLIER = 10</span>).
            </Body>

            <Label>Limits</Label>
            <Body style={{ fontSize: "13px" }}>
              Each account can have up to <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--fg-1)" }}>MAX_SENSORS</span> sensors (default 20, configurable via env). Creating past the limit returns <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>409 Sensor limit reached (n/N)</span>; deleting a sensor frees its slot immediately. Editing and deleting always work regardless of the limit.
            </Body>

            <Label>The summary strip</Label>
            <Body style={{ fontSize: "13px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--fg-1)" }}>GET /api/v1/sensors/summary</span> returns everything the dashboard strip shows — computed in one aggregation, scoped to your account:
            </Body>
            <CodeBlock copyable text={`{
  "limit": 20,
  "total": 3,
  "remaining": 17,
  "counts": { "online": 2, "stale": 0, "offline": 0, "waiting": 1 },
  "byType": { "vibration": 2, "temperature": 1 }
}`}>{`{
  "limit": 20,
  "total": 3,
  "remaining": 17,
  "counts": { "online": 2, "stale": 0, "offline": 0, "waiting": 1 },
  "byType": { "vibration": 2, "temperature": 1 }
}`}</CodeBlock>
          </SectionBody>
        </SectionWrapper>

        {/* ══ Sending readings ══ */}
        <SectionWrapper id="ingest">
          <SectionHead>Sending readings</SectionHead>
          <SectionBody>
            <Body>
              Gateways POST readings to a single endpoint using your API key: <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--accent)" }}>Authorization: Bearer &lt;key&gt;</span>. There is exactly one key per account; generating a new one invalidates the old immediately.
            </Body>

            <Label>Endpoint</Label>
            <CodeBlock copyable>{"POST /api/v1/events\nAuthorization: Bearer <your-api-key>\nContent-Type: application/json"}</CodeBlock>

            <Label>First reading — copy-paste curl</Label>
            <CodeBlock copyable>{FIRST_READING_CURL}</CodeBlock>
            <Body style={{ fontSize: "13px", color: "var(--fg-3)", whiteSpace: "pre-line" }}>
              {READING_NOTE}
            </Body>

            <Label>Event types</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
              {["sensor_reading", "equipment_anomaly", "machine_state_change"].map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
            <Body style={{ fontSize: "13px", color: "var(--fg-3)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>values</span> is an object of numeric readings (at least one) — e.g. <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>{`{ "vibration": 0.42 }`}</span>. Optionally set <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>source</span> (api, edge, gateway, opcua, mqtt, manual) and <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>rawData</span> for anything free-form.
            </Body>

            <Label>Idempotency</Label>
            <Body style={{ fontSize: "13px" }}>
              Retries are safe. Send an <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>Idempotency-Key</span> header to dedupe on your terms; without one, Sentinel hashes the payload (site + machine + sensor + type + timestamp + values) to detect duplicates. A duplicate returns the original event instead of creating a second one.
            </Body>
          </SectionBody>
        </SectionWrapper>

        {/* ══ API reference ══ */}
        <SectionWrapper id="api">
          <SectionHead>API reference</SectionHead>
          <SectionBody>
            <Body>
              Everything lives under <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--fg-1)" }}>/api/v1</span>. Browser routes use session cookies; gateway ingestion uses the Bearer API key. All responses use the same envelope: <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>{`{ statusCode, data, message, success }`}</span>.
            </Body>
            {API_GROUPS.map((group) => (
              <div key={group.title}>
                <Label>{group.title}</Label>
                <EndpointList rows={group.rows} />
              </div>
            ))}
            <Body style={{ fontSize: "13px", color: "var(--fg-3)" }}>
              Note the sensor route order: <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>/sensors/summary</span> is matched before <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>/sensors/:sensorId</span>, so &quot;summary&quot; is never treated as an id.
            </Body>
          </SectionBody>
        </SectionWrapper>

        {/* ══ Incidents ══ */}
        <SectionWrapper id="incidents">
          <SectionHead>Understanding incidents</SectionHead>
          <SectionBody>
            <Body>
              When machine health degrades past your thresholds — driven by ML predictions, not raw noise — Sentinel opens an incident. Argus classifies severity from the evidence:
            </Body>

            <div style={{ marginBottom: "20px" }}>
              {[
                { sev: "SERIOUS", color: C_RED, bg: "rgba(255,56,56,0.07)", desc: "Machine critical — act now. Equipment risk is high or rising fast." },
                { sev: "MINOR",   color: C_YELLOW, bg: "rgba(232,154,43,0.07)", desc: "Needs morning action — warning state trending the wrong way." },
                { sev: "HARMLESS",color: C_GREEN, bg: "rgba(125,138,106,0.1)",  desc: "Absorbed noise — within tolerance, logged for the record." },
                { sev: "UNCERTAIN",color:"var(--sev-unknown)", bg: "var(--bg-surface-2)", desc: "Insufficient data. You decide with the evidence at hand." },
              ].map(({ sev, color, bg, desc }) => (
                <div key={sev} style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  background: bg,
                  border: "1px solid var(--border-hairline)",
                  borderBottom: "none",
                }}>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    color,
                    minWidth: "72px",
                    paddingTop: "1px",
                  }}>
                    {sev}
                  </span>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: "13px", color: "var(--fg-2)", lineHeight: 1.5 }}>
                    {desc}
                  </span>
                </div>
              ))}
              <div style={{ height: "1px", background: "var(--border-hairline)" }} />
            </div>

            <Label>Incident lifecycle</Label>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexWrap: "wrap",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: "var(--fg-3)",
            }}>
              {["OPEN", "→", "INVESTIGATING", "→", "REVIEWED", "→", "ESCALATED / CLOSED"].map((s, i) => (
                <span key={i} style={{ color: s === "→" ? "var(--accent)" : "var(--fg-2)" }}>{s}</span>
              ))}
            </div>
          </SectionBody>
        </SectionWrapper>

        {/* ══ Briefing ══ */}
        <SectionWrapper id="briefing">
          <SectionHead>Morning briefing</SectionHead>
          <SectionBody>
            <Body>
              After the overnight investigations complete, Argus generates a structured Morning Operations Briefing: an executive summary, a prioritised incident list, recommended actions, and a site health assessment.
            </Body>
            <Body>
              The briefing lives at <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--fg-1)" }}>/briefing</span> as a formatted document ready for day-shift handover. You can edit individual sections before approving.
            </Body>
            <Body>
              Approving the briefing triggers a webhook POST to your configured endpoint — typically Slack, PagerDuty, or a custom integration. The webhook carries an HMAC-SHA256 signature you can verify (see Webhooks below).
            </Body>
          </SectionBody>
        </SectionWrapper>

        {/* ══ Security ══ */}
        <SectionWrapper id="security">
          <SectionHead>Security</SectionHead>
          <SectionBody>
            {[
              ["Passwords", "bcrypt-hashed with 10 rounds. Raw passwords are never stored."],
              ["API keys", "SHA-256 hashed at rest. The raw key is shown exactly once at creation — never stored, never returned by any GET, never logged. Treat it like a password."],
              ["One key per account", "Generating a key replaces the old one instantly; revoking kills gateway access immediately."],
              ["OTPs", "SHA-256 hashed, 20-minute TTL. The raw OTP is only ever sent by email."],
              ["JWTs", "Short-lived (15 minutes), httpOnly cookies. Instant invalidation via token version tracking."],
              ["User scoping", "Every query is scoped to the authenticated user server-side. Client-supplied ids are never trusted for ownership."],
              ["Webhook signatures", "Outgoing webhooks carry X-Sentinel-Signature: sha256=<hmac> computed with your webhook secret."],
              ["In transit", "Terminate TLS at your reverse proxy or tunnel in production."],
            ].map(([title, desc]) => (
              <div key={title} style={{
                display: "flex",
                gap: "16px",
                padding: "10px 0",
                borderBottom: "1px solid var(--border-hairline)",
              }}>
                <div style={{
                  flexShrink: 0,
                  width: "150px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--fg-2)",
                  paddingTop: "1px",
                }}>
                  {title}
                </div>
                <div style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "13px",
                  color: "var(--fg-3)",
                  lineHeight: 1.5,
                }}>
                  {desc}
                </div>
              </div>
            ))}
          </SectionBody>
        </SectionWrapper>

        {/* ══ Webhooks ══ */}
        <SectionWrapper id="webhooks">
          <SectionHead>Webhooks</SectionHead>
          <SectionBody>
            <Body>
              Configure receivers under Settings → Webhooks. Every delivery carries an
              {" "}<code style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--accent)" }}>X-Sentinel-Signature</code>{" "}
              HMAC-SHA256 header computed over the raw JSON body. Use cases: shift handoff alerts, Slack posts, downstream automation.
            </Body>

            <Label>Event types fired</Label>
            <div style={{ marginBottom: "16px" }}>
              {WEBHOOK_EVENTS.map(([evt, desc]) => (
                <div key={evt} style={{
                  display: "flex",
                  gap: "12px",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border-hairline)",
                  alignItems: "flex-start",
                }}>
                  <code style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--accent)",
                    flexShrink: 0,
                    width: "180px",
                    paddingTop: "1px",
                  }}>
                    {evt}
                  </code>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: "13px", color: "var(--fg-3)", lineHeight: 1.5 }}>
                    {desc}
                  </span>
                </div>
              ))}
            </div>

            <Label>Verification — Node.js</Label>
            <CodeBlock copyable>{WEBHOOK_VERIFY_NODE}</CodeBlock>

            <Label>Verification — Python</Label>
            <CodeBlock copyable>{WEBHOOK_VERIFY_PY}</CodeBlock>

            <Body style={{ fontSize: "13px", color: "var(--fg-3)", marginTop: "12px" }}>
              <strong style={{ color: "var(--fg-2)" }}>Important:</strong> verify against
              the <em>raw</em> request body, not the parsed JSON. Whitespace differences
              invalidate the signature.
            </Body>
          </SectionBody>
        </SectionWrapper>

        {/* ══ Self-hosting ══ */}
        <SectionWrapper id="self-host">
          <SectionHead>Self-hosting</SectionHead>
          <SectionBody>
            <Body>
              Sentinel ships as three services: a Next.js client, an Express API with BullMQ workers, and the Python ML service. MongoDB and Redis are the only infrastructure dependencies.
            </Body>

            <Label>Local data plane</Label>
            <CodeBlock copyable>{"docker compose -f docker-compose.dev.yml up -d   # mongo + redis\n\ncd server && bun run dev                          # API on :8000\ncd client && npm run dev                          # UI on :3000"}</CodeBlock>

            <Label>Key environment variables (server/.env)</Label>
            <EndpointList rows={[
              ["ENV", "MONGODB_URL", "Mongo connection string."],
              ["ENV", "REDIS_URL", "Redis for BullMQ queues and rate limiting."],
              ["ENV", "MAX_SENSORS", "Sensor limit per account. Default 20."],
              ["ENV", "PORT", "API port. Default 8000."],
              ["ENV", "CORS_ORIGIN", "Allowed browser origin, e.g. http://localhost:3000."],
            ]} />

            <Body style={{ fontSize: "13px", color: "var(--fg-3)" }}>
              The client proxies <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>/api/v1/*</span> to the server, so the browser stays same-origin. Point it elsewhere with <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>API_UPSTREAM_URL</span> (used by the Docker build) or <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>NEXT_PUBLIC_API_URL</span>.
            </Body>

            <Label>Production</Label>
            <Body style={{ fontSize: "13px" }}>
              The production stack targets a Raspberry Pi 5 behind a Cloudflare Tunnel — <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>docker compose --env-file server/.env up -d --build</span>. No host ports are published; traffic enters only through cloudflared.
            </Body>
          </SectionBody>
        </SectionWrapper>
      </div>
    </div>
  );
}
