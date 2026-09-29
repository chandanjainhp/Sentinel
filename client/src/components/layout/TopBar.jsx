"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useAuth } from "@/hooks/useAuth";
import { SentinelLockup } from "@/components/brand/SentinelMark";
import { LogOut, User } from "lucide-react";

const MONO = "var(--font-mono)";

const navLink = (active) => ({
  fontFamily: MONO,
  fontSize: "11px",
  fontWeight: active ? 600 : 400,
  color: active ? "var(--fg-1)" : "var(--fg-4)",
  textDecoration: "none",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  padding: "4px 0",
  borderBottom: active ? "1px solid var(--accent)" : "1px solid transparent",
  transition: "color 120ms ease, border-color 120ms ease",
  position: "relative",
});

function useNightDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}



export default function TopBar() {
  const pathname = usePathname();
  const nightDate = useNightDate();
  const { user } = useAuthStore();
  const { logout } = useAuth();

  const is = (prefix) =>
    Array.isArray(prefix)
      ? prefix.some((p) => pathname?.startsWith(p))
      : pathname?.startsWith(prefix);

  return (
    <header style={{
      position: "fixed",
      top: 0, left: 0, right: 0,
      background: "var(--bg-surface-1)",
      borderBottom: "1px solid var(--border-default)",
      zIndex: 1000,
    }}>
      {/* Two-row header on phones (≤640px): the row that holds the primary
          nav drops below the brand row, so nothing overflows off-screen.
          Desktop keeps the single 56px row. See globals.css breakpoints. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .topbar-inner {
          height: 56px;
          display: flex;
          align-items: center;
          padding-left: 20px;
          padding-right: 20px;
          gap: 0;
        }
        @media (max-width: 640px) {
          .topbar-inner {
            height: auto;
            flex-wrap: wrap;
            row-gap: 0;
            padding-left: 12px;
            padding-right: 12px;
          }
          .topbar-brand { margin-right: 12px !important; }
          .topbar-divider { display: none !important; }
          .topbar-nav {
            order: 3;
            flex: 0 0 100% !important; /* beat inline flex:1 so nav drops to row 2 */
            gap: 18px !important;
            padding: 6px 0 8px;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .topbar-user { margin-left: auto !important; gap: 10px !important; }
          .topbar-user a span { display: none; } /* icon-only user chip */
          .topbar-user a, .topbar-user button {
            min-width: 44px;
            min-height: 44px;
            justify-content: center;
          }
        }
      ` }} />
      <div className="topbar-inner">
      {/* Brand lockup — Night Watch mark + stretched wordmark */}
      <div className="topbar-brand" style={{ flexShrink: 0, marginRight: "20px" }}>
        <Link href="/overview" aria-label="Sentinel home" style={{ textDecoration: "none" }}>
          <SentinelLockup markSize={22} fontSize={13} />
        </Link>
      </div>

      {/* Divider */}
      <div className="topbar-divider" style={{ width: "1px", height: "20px", background: "var(--border-default)", flexShrink: 0, marginRight: "20px" }} />

      {/* Primary Nav */}
      <nav aria-label="Primary navigation" className="topbar-nav" style={{ display: "flex", alignItems: "center", gap: "20px", flex: 1 }}>
        <Link href="/overview" style={navLink(is(["/overview", "/dashboard"]))}>
          Overview
        </Link>
        <Link href="/incidents" style={navLink(is(["/incidents", "/incident"]))}>
          Incidents
        </Link>
        <Link href="/sensors" style={navLink(is("/sensors"))}>
          Sensors
        </Link>
      </nav>

      {/* User Session Info & Logout */}
      {user && (
        <div className="topbar-user" style={{ display: "flex", alignItems: "center", gap: "16px", marginLeft: "auto" }}>
          <Link
            href="/profile"
            style={{
              fontFamily: MONO,
              fontSize: "11px",
              color: "var(--fg-3)",
              textDecoration: "none",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--fg-1)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--fg-3)"}
          >
            <User size={12} style={{ color: "var(--fg-4)" }} />
            <span>{user.username}</span>
          </Link>
          <button
            onClick={() => logout()}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px 8px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontFamily: MONO,
              fontSize: "11px",
              color: "var(--fg-4)",
              textTransform: "uppercase",
              transition: "color 120ms ease",
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--sev-serious)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--fg-4)"}
            title="Log out"
          >
            <LogOut size={12} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      )}
      </div>
    </header>
  );
}
