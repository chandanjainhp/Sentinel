"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Radar,
  Search,
  FileText,
  Shield,
  Server,
} from "lucide-react";

/* ── helpers ─────────────────────────────────────────── */
const SEV = {
  serious: {
    dot: "var(--sev-serious)",
    bg: "var(--sev-serious-bg)",
    border: "var(--sev-serious-dim)",
    text: "var(--sev-serious)",
    glow: "var(--glow-serious)",
  },
  minor: {
    dot: "var(--sev-minor)",
    bg: "var(--sev-minor-bg)",
    border: "var(--sev-minor-dim)",
    text: "var(--sev-minor)",
    glow: "var(--glow-minor)",
  },
  harmless: {
    dot: "var(--sev-harmless)",
    bg: "var(--sev-harmless-bg)",
    border: "var(--sev-harmless-dim)",
    text: "var(--sev-harmless)",
    glow: "var(--glow-harmless)",
  },
};

const TERM_COLOR = {
  tool: "var(--term-tool)",
  result: "var(--term-result)",
  classify: "var(--term-classify)",
  uncertain: "var(--term-uncertain)",
  dim: "var(--term-dim)",
};

/* ── demo preview data — illustrative only, shown on public landing page ── */
const DEMO_EVENTS = [
  {
    time: "04:17",
    sev: "serious",
    desc: "Spindle bearing — vibration spike",
    meta: "CRANE-04 · 8.2 mm/s RMS",
    label: "ESCALATED",
  },
  {
    time: "03:42",
    sev: "harmless",
    desc: "Spindle bearing — vibration (startup)",
    meta: "CRANE-04 · 2.1 mm/s RMS",
    label: "RESOLVED",
  },
  {
    time: "02:58",
    sev: "minor",
    desc: "Hydraulic pump — pressure dip",
    meta: "PUMP-02 · 168 bar",
    label: "MONITORING",
  },
  {
    time: "02:11",
    sev: "harmless",
    desc: "Coolant level — auto refill",
    meta: "CNC-07 · nominal",
    label: "RESOLVED",
  },
  {
    time: "01:33",
    sev: "minor",
    desc: "Gearbox — thermal anomaly",
    meta: "CRANE-04 · ΔT +12°C",
    label: "REVIEW",
  },
];

const DEMO_AGENT = [
  { type: "tool", text: '→ get_overnight_readings(machine="CRANE-04")' },
  { type: "result", text: "← 7 anomalies across spindle, hydraulic, gearbox sensors." },
  { type: "classify", text: "■ SERIOUS · confidence 0.81" },
  { type: "tool", text: '→ review CRANE-04 (hydraulic pressure + vibration + thermal)' },
  { type: "result", text: "← root cause: interlock bypass after pressure spike." },
  {
    type: "uncertain",
    text: "? gearbox vibration trending up — RUL estimate 62h ± 9h",
  },
  {
    type: "tool",
    text: '→ assess machine health(machineId="machine_xxxx")',
  },
  { type: "result", text: "← CRITICAL — schedule maintenance before next shift." },
  { type: "classify", text: "■ escalating to SITE OWNER" },
];

const FEATURES = [
  {
    sev: "serious",
    label: "AI Investigation",
    stat: "81% avg confidence",
    desc: "The Sentinel triages overnight signals, correlates evidence, and proposes traceable root causes. Teams arrive to findings, not a raw alert stream.",
  },
  {
    sev: "minor",
    label: "Computed Connectivity",
    stat: "10s refresh",
    desc: "Sensor status is computed from real readings — ONLINE, STALE, OFFLINE — and the dashboard polls every 10 seconds. No stale status fields, no manual refresh.",
  },
  {
    sev: "harmless",
    label: "Morning Briefing",
    stat: "ready by 06:10",
    desc: "By shift handoff the system compiles incidents, timelines, and confidence-backed recommendations. Approve and publish in minutes.",
  },
];

const STEPS = [
  {
    n: "01",
    label: "Events Detected",
    desc: "Sensors, cameras, and telemetry flag overnight anomalies across the site.",
  },
  {
    n: "02",
    label: "Agent Investigates",
    desc: "Sentinel correlates evidence, runs tools, and drafts causal hypotheses.",
  },
  {
    n: "03",
    label: "Ops Lead Reviews",
    desc: "Operations lead validates findings, adjusts narrative, and confirms confidence.",
  },
  {
    n: "04",
    label: "Briefing Approved",
    desc: "A final morning report is shared with all stakeholders before shift start.",
  },
];

const STAGES = [
  {
    Icon: Radar,
    label: "Ingest",
    desc: "Gateways POST sensor readings to the events API with your single API key.",
  },
  {
    Icon: Search,
    label: "Predict",
    desc: "The ML service scores every reading: RUL, anomaly, fault probability.",
  },
  {
    Icon: FileText,
    label: "Investigate",
    desc: "Argus finds root cause and opens incidents for degrading machines.",
  },
  {
    Icon: FileText,
    label: "Briefing",
    desc: "Morning Operations Briefing ready for the site owner.",
  },
];

function StageCard({ Icon, label, desc }) {
  return (
    <div
      style={{
        background: "var(--bg-surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-sm, 4px)",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        transition: "background var(--dur-fast, 120ms)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-surface-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-surface-1)";
      }}
    >
      <Icon size={24} color="var(--accent)" aria-hidden="true" />
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--fg-1)",
        }}
      >
        {label}
      </div>
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "13px",
          color: "var(--fg-3)",
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        {desc}
      </p>
    </div>
  );
}

function StageRow() {
  return (
    <div
      className="stage-row"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 24px 1fr 24px 1fr 24px 1fr",
        alignItems: "stretch",
        gap: "0",
      }}
    >
      {STAGES.map((s, i) => (
        <React.Fragment key={s.label}>
          <StageCard {...s} />
          {i < STAGES.length - 1 && (
            <div
              aria-hidden="true"
              className="stage-arrow"
              style={{
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
                fontSize: "22px",
                textAlign: "center",
                alignSelf: "center",
              }}
            >
              →
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function RoleCard({
  Icon,
  iconColor,
  labelColor,
  label,
  title,
  desc,
  ctaLabel,
  ctaHref,
  ctaColor,
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface-1)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-sm, 4px)",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        transition: "background var(--dur-fast, 120ms)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-surface-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-surface-1)";
      }}
    >
      <Icon size={28} color={iconColor} aria-hidden="true" />
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: labelColor,
        }}
      >
        {label}
      </div>
      <h3
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "18px",
          fontWeight: 500,
          color: "var(--fg-1)",
          margin: 0,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "13px",
          color: "var(--fg-3)",
          lineHeight: 1.55,
          margin: 0,
          flex: 1,
        }}
      >
        {desc}
      </p>
      <Link
        href={ctaHref}
        style={{
          marginTop: "10px",
          fontSize: "14px",
          fontWeight: 500,
          color: ctaColor,
          textDecoration: "none",
        }}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

function StepCard({ n, title, desc, ctaLabel, ctaHref }) {
  return (
    <div
      style={{
        background: "var(--bg-surface-2)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-sm, 4px)",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "32px",
          fontWeight: 700,
          color: "var(--fg-4)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {n}
      </div>
      <h3
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "17px",
          fontWeight: 500,
          color: "var(--fg-1)",
          margin: 0,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "13px",
          color: "var(--fg-3)",
          lineHeight: 1.55,
          margin: 0,
          flex: 1,
        }}
      >
        {desc}
      </p>
      <Link
        href={ctaHref}
        style={{
          marginTop: "8px",
          fontSize: "14px",
          fontWeight: 500,
          color: "var(--accent)",
          textDecoration: "none",
        }}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

function LandingFooter() {
  return (
    <footer
      style={{
        background: "var(--bg-surface-1)",
        borderTop: "1px solid var(--border-hairline)",
        padding: "48px 24px",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "32px",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "16px",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--fg-1)",
              }}
            >
              Sentinel
            </div>
            <div
              style={{
                marginTop: "6px",
                fontSize: "12px",
                color: "var(--fg-4)",
              }}
            >
              Night Watch design system
            </div>
          </div>
          <FooterCol
            heading="Product"
            links={[
              ["How it works", "/docs#how-it-works"],
              ["Security", "/docs#security"],
              ["API reference", "/docs#api"],
            ]}
          />
          <FooterCol
            heading="Resources"
            links={[
              ["Documentation", "/docs"],
              ["Sign in", "/login"],
              ["Create account", "/register"],
            ]}
          />
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
                marginBottom: "12px",
              }}
            >
              Status
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "var(--sev-harmless)",
                }}
              />
              <span style={{ fontSize: "13px", color: "var(--fg-2)" }}>
                All systems operational
              </span>
            </div>
            <div
              style={{
                marginTop: "6px",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--fg-4)",
              }}
            >
              Last updated: 2026-09-24 06:00 UTC
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "32px",
            paddingTop: "16px",
            borderTop: "1px solid var(--border-hairline)",
            textAlign: "center",
            fontSize: "12px",
            color: "var(--fg-4)",
          }}
        >
          © 2026 Sentinel — Built for industrial site operators
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ heading, links }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--fg-3)",
          marginBottom: "12px",
        }}
      >
        {heading}
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {links.map(([label, href]) => (
          <li key={label}>
            <Link
              href={href}
              style={{
                fontSize: "14px",
                color: "var(--fg-2)",
                textDecoration: "none",
                transition: "color var(--dur-fast, 120ms)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--fg-1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--fg-2)";
              }}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LandingPage() {
  const [time, setTime] = useState("--:--:--");

  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        background: "var(--bg-base)",
        minHeight: "100vh",
        color: "var(--fg-1)",
      }}
    >
      {/* Skip-to-content */}
      <a
        href="#main"
        style={{
          position: "absolute",
          left: "-9999px",
          top: "8px",
          background: "var(--bg-surface-2)",
          color: "var(--fg-1)",
          padding: "8px 14px",
          zIndex: 200,
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          textDecoration: "none",
          border: "1px solid var(--accent)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.left = "8px";
        }}
        onBlur={(e) => {
          e.currentTarget.style.left = "-9999px";
        }}
      >
        Skip to content
      </a>

      {/* ══ NAV ══════════════════════════════════════════ */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
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
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "var(--sev-serious)",
              boxShadow: "var(--glow-serious)",
              animation: "status-pulse 2s ease-in-out infinite",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--fg-1)",
            }}
          >
            Sentinel
          </span>
          <span
            style={{
              color: "var(--border-strong)",
              fontSize: "16px",
              lineHeight: 1,
              userSelect: "none",
            }}
          ></span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Nav links — hidden on very small screens via media query below */}
        <nav
          className="landing-nav"
          style={{ display: "flex", gap: "20px", alignItems: "center" }}
        >
          <Link
            href="#features"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              textDecoration: "none",
              color: "var(--fg-3)",
            }}
          >
            Features
          </Link>
          <Link
            href="#how-it-works"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              textDecoration: "none",
              color: "var(--fg-3)",
            }}
          >
            Workflow
          </Link>
        </nav>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Link
            href="/login"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              textDecoration: "none",
              color: "var(--fg-3)",
              padding: "6px 14px",
              border: "1px solid var(--border-default)",
            }}
          >
            Login
          </Link>
          <Link
            href="/register"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              textDecoration: "none",
              color: "var(--bg-base)",
              background: "var(--accent)",
              padding: "6px 14px",
            }}
          >
            Get Access
          </Link>
        </div>
      </header>

      {/* ══ HERO ═════════════════════════════════════════ */}
      <section
        id="main"
        style={{
          minHeight: "100vh",
          paddingTop: "48px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          position: "relative",
          overflow: "hidden",
        }}
        className="hero-grid"
      >
        {/* Dot grid background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle, rgba(35,43,56,0.9) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            pointerEvents: "none",
          }}
        />

        {/* Radar sweep */}
        <div
          className="radar-sweep"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: "1px",
            background:
              "linear-gradient(90deg, transparent 0%, var(--accent) 40%, var(--accent) 60%, transparent 100%)",
            opacity: 0.25,
            pointerEvents: "none",
          }}
        />

        {/* Ambient glow behind left content */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 55% 75% at 25% 55%, rgba(21,34,43,0.65) 0%, transparent 65%)",
            pointerEvents: "none",
          }}
        />

        {/* ── LEFT: proposition ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding:
              "clamp(48px,8vw,96px) clamp(24px,5vw,64px) clamp(48px,8vw,96px) clamp(32px,6vw,80px)",
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* Live badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "36px",
              alignSelf: "flex-start",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--sev-serious)",
                boxShadow: "var(--glow-serious)",
                animation: "status-pulse 1.6s ease-in-out infinite",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--sev-serious)",
              }}
            >
              Live — overnight intelligence active
            </span>
          </div>

          {/* Giant clock */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(52px, 9vw, 104px)",
              fontWeight: 700,
              lineHeight: 1,
              color: "var(--accent)",
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
              marginBottom: "20px",
              textShadow: "0 0 60px rgba(184,212,232,0.18)",
            }}
          >
            {time.slice(0, 5)}
          </div>

          {/* Headline */}
          <h1
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "clamp(28px, 4vw, 52px)",
              fontWeight: 500,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              color: "var(--fg-1)",
              marginBottom: "20px",
            }}
          >
            Investigations
            <br />
            <span style={{ color: "var(--fg-3)" }}>Before Sunrise</span>
          </h1>

          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "14px",
              color: "var(--fg-2)",
              lineHeight: "var(--lh-loose)",
              maxWidth: "420px",
              marginBottom: "44px",
            }}
          >
            Sentinel ingests your machines' sensor readings around the clock, scores them with predictive-maintenance models, and computes machine health — so you start each day knowing exactly which equipment needs attention.
          </p>

          {/* CTA buttons */}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link
              href="/register"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                textDecoration: "none",
                color: "var(--bg-base)",
                background: "var(--accent)",
                padding: "12px 24px",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              Get started <span>→</span>
            </Link>
            <Link
              href="/login"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                textDecoration: "none",
                color: "var(--fg-3)",
                padding: "12px 24px",
                border: "1px solid var(--border-default)",
              }}
            >
              Sign in
            </Link>
            <Link
              href="/docs"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                textDecoration: "none",
                color: "var(--fg-4)",
                padding: "12px 24px",
              }}
            >
              Read the docs
            </Link>
          </div>

          {/* Stats strip */}
          <div
            style={{
              marginTop: "56px",
              paddingTop: "24px",
              borderTop: "1px solid var(--border-hairline)",
              display: "flex",
              gap: "36px",
              flexWrap: "wrap",
            }}
          >
            {[
              { val: "6:10", label: "briefing ready" },
              { val: "81%", label: "avg confidence" },
              { val: "10s", label: "status refresh" },
            ].map(({ val, label }) => (
              <div key={label}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "clamp(18px,2.5vw,26px)",
                    fontWeight: 700,
                    color: "var(--fg-1)",
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {val}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    color: "var(--fg-4)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginTop: "4px",
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: live ops panel preview ── */}
        <div
          className="hero-right"
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding:
              "clamp(48px,8vw,96px) clamp(32px,6vw,80px) clamp(48px,8vw,96px) clamp(16px,3vw,32px)",
            position: "relative",
            zIndex: 1,
            gap: "12px",
          }}
        >
          {/* Agent terminal panel */}
          <div
            style={{
              background: "var(--bg-terminal)",
              border: "1px solid var(--border-default)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 14px",
                background: "var(--bg-surface-1)",
                borderBottom: "1px solid var(--border-hairline)",
              }}
            >
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  background: "var(--accent)",
                  boxShadow: "var(--glow-accent)",
                  animation: "status-pulse 1.6s ease-in-out infinite",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--fg-1)",
                }}
              >
                Argus Activity
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "var(--fg-4)",
                }}
              >
                9 tool calls · running
              </span>
            </div>
            <div
              style={{
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "5px",
              }}
            >
              {DEMO_AGENT.map((line, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: TERM_COLOR[line.type] || "var(--term-fg)",
                    lineHeight: 1.5,
                    opacity: i < DEMO_AGENT.length - 3 ? 0.55 : 1,
                  }}
                >
                  {line.text}
                </div>
              ))}
              {/* Blinking cursor */}
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--accent)",
                  marginTop: "3px",
                  animation: "status-pulse 1s ease-in-out infinite",
                }}
              >
                ▋
              </div>
            </div>
          </div>

          {/* Events panel */}
          <div
            style={{
              background: "var(--bg-surface-1)",
              border: "1px solid var(--border-default)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 14px",
                borderBottom: "1px solid var(--border-hairline)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--fg-1)",
                }}
              >
                Events
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "var(--fg-4)",
                }}
              >
                5 logged · 1 escalated
              </span>
            </div>
            {DEMO_EVENTS.map((evt, i) => {
              const s = SEV[evt.sev];
              return (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr auto",
                    padding: "8px 14px",
                    gap: "10px",
                    alignItems: "center",
                    borderTop:
                      i === 0 ? "none" : "1px solid var(--border-hairline)",
                    borderLeft:
                      evt.sev === "serious"
                        ? "2px solid var(--sev-serious)"
                        : "2px solid transparent",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      color: "var(--fg-4)",
                    }}
                  >
                    {evt.time}
                  </span>
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--fg-1)",
                        fontWeight: 500,
                        marginBottom: "2px",
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {evt.desc}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        color: "var(--fg-4)",
                      }}
                    >
                      {evt.meta}
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      padding: "2px 7px",
                      background: s.bg,
                      color: s.text,
                      border: `1px solid ${s.border}`,
                      borderRadius: "2px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {evt.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══ SECTION 2 — HOW IT WORKS (4 stages) ══════════ */}
      <section
        id="how-it-works"
        style={{
          background: "var(--bg-surface-1)",
          borderTop: "1px solid var(--border-default)",
          padding: "clamp(48px,8vw,80px) clamp(24px,6vw,80px)",
          scrollMarginTop: "48px",
        }}
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
              marginBottom: "14px",
            }}
          >
            How it works
          </div>
          <h2
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "clamp(22px, 3vw, 36px)",
              fontWeight: 500,
              lineHeight: 1.1,
              letterSpacing: "-0.015em",
              color: "var(--fg-1)",
              marginBottom: "48px",
            }}
          >
            From overnight ops to briefing in four stages.
          </h2>

          <StageRow />
        </div>
      </section>

      {/* ══ SECTION 3 — ROLES ════════════════════════════ */}
      <section
        style={{
          background: "var(--bg-base)",
          padding: "clamp(48px,8vw,80px) clamp(24px,6vw,80px)",
        }}
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
              marginBottom: "14px",
            }}
          >
            Access
          </div>
          <h2
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "clamp(22px, 3vw, 36px)",
              fontWeight: 500,
              lineHeight: 1.1,
              letterSpacing: "-0.015em",
              color: "var(--fg-1)",
              marginBottom: "8px",
            }}
          >
            One platform. One owner.
          </h2>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "14px",
              color: "var(--fg-3)",
              marginBottom: "40px",
            }}
          >
            No organizations, no roles, no admin panels. Your account owns sites, machines, sensors, events, and incidents — top to bottom.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "16px",
            }}
          >
            <RoleCard
              Icon={Shield}
              iconColor="var(--accent)"
              labelColor="var(--accent)"
              label="Single Owner"
              title="Your account owns everything"
              desc="Register once and own the whole tree: sites, machines, sensors, events, predictions, and incidents. No orgs, no roles, no middlemen."
              ctaLabel="Create account →"
              ctaHref="/register"
              ctaColor="var(--accent)"
            />
            <RoleCard
              Icon={Radar}
              iconColor="var(--accent)"
              labelColor="var(--accent)"
              label="Setup & Status"
              title="Sensors that self-report health"
              desc="Declare an expected interval; Sentinel computes ONLINE, STALE, or OFFLINE from the actual data — and shows added/limit counts on one page."
              ctaLabel="Sensor guide →"
              ctaHref="/docs#sensors"
              ctaColor="var(--accent)"
            />
            <RoleCard
              Icon={Server}
              iconColor="var(--sev-serious)"
              labelColor="var(--sev-serious)"
              label="API-first"
              title="One key, one endpoint"
              desc="Generate a single API key, copy the curl from the Connect step, and your first reading is seconds away. Full API reference in the docs."
              ctaLabel="API reference →"
              ctaHref="/docs#api"
              ctaColor="var(--sev-serious)"
            />
          </div>
        </div>
      </section>

      {/* ══ SECTION 4 — GETTING STARTED ══════════════════ */}
      <section
        style={{
          background: "var(--bg-surface-1)",
          borderTop: "1px solid var(--border-default)",
          padding: "clamp(48px,8vw,80px) clamp(24px,6vw,80px)",
        }}
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
              marginBottom: "14px",
            }}
          >
            First time?
          </div>
          <h2
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "clamp(22px, 3vw, 36px)",
              fontWeight: 500,
              lineHeight: 1.1,
              letterSpacing: "-0.015em",
              color: "var(--fg-1)",
              marginBottom: "40px",
            }}
          >
            From zero to your first briefing in 5 minutes.
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "16px",
            }}
          >
            <StepCard
              n="01"
              title="Create your site"
              desc="Sign up with your work email — your account owns the whole system."
              ctaLabel="Create account →"
              ctaHref="/register"
            />
            <StepCard
              n="02"
              title="Add a sensor"
              desc="Create a site and machine inline, name the sensor, pick its type, and set the expected interval between readings."
              ctaLabel="Getting started →"
              ctaHref="/docs#getting-started"
            />
            <StepCard
              n="03"
              title="Send the first reading"
              desc="Generate your API key, paste the ready-made curl from the Connect step, and watch the sensor flip to Connected — live."
              ctaLabel="API reference →"
              ctaHref="/docs#api"
            />
          </div>

          <div
            style={{
              textAlign: "center",
              marginTop: "40px",
              fontFamily: "var(--font-sans)",
              fontSize: "15px",
              color: "var(--fg-3)",
            }}
          >
            Just exploring?{" "}
            <Link
              href="/docs"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              Read the full documentation →
            </Link>
          </div>
        </div>
      </section>

      {/* ══ SECTION 5 — FOOTER ═══════════════════════════ */}
      <LandingFooter />

      {/* ══ GLOBAL STYLES for this page ══════════════════ */}
      <style>{`
        @keyframes radar-sweep {
          0%   { top: -1px; opacity: 0; }
          5%   { opacity: 0.25; }
          95%  { opacity: 0.15; }
          100% { top: 100vh; opacity: 0; }
        }

        .radar-sweep {
          animation: radar-sweep 10s linear infinite;
        }

        @media (max-width: 768px) {
          .hero-grid {
            grid-template-columns: 1fr !important;
          }
          .hero-right {
            display: none !important;
          }
          .landing-nav {
            display: none !important;
          }
          .stage-row {
            grid-template-columns: 1fr !important;
          }
          .stage-arrow {
            transform: rotate(90deg);
            padding: 8px 0;
          }
        }
        html { scroll-behavior: smooth; }
        button, a { cursor: pointer; }
      `}</style>
    </div>
  );
}
