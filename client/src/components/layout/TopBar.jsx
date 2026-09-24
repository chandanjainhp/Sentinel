"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useAuth } from "@/hooks/useAuth";
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
      height: "56px",
      background: "var(--bg-surface-1)",
      borderBottom: "1px solid var(--border-default)",
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      paddingLeft: "20px",
      paddingRight: "20px",
      gap: "0",
    }}>
      {/* Wordmark */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, marginRight: "20px" }}>
        <span style={{
          width: "7px", height: "7px", borderRadius: "50%",
          background: "var(--accent)", flexShrink: 0,
        }} />
        <Link href="/overview" style={{
          fontFamily: MONO,
          fontSize: "12px",
          fontWeight: 700,
          color: "var(--fg-1)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          textDecoration: "none",
        }}>
          Sentinel
        </Link>
      </div>

      {/* Divider */}
      <div style={{ width: "1px", height: "20px", background: "var(--border-default)", flexShrink: 0, marginRight: "20px" }} />

      {/* Primary Nav */}
      <nav aria-label="Primary navigation" style={{ display: "flex", alignItems: "center", gap: "20px", flex: 1 }}>
        <Link href="/overview" style={navLink(is(["/overview", "/dashboard"]))}>
          Overview
        </Link>
        <Link href="/incidents" style={navLink(is(["/incidents", "/incident"]))}>
          Incidents
        </Link>
        <Link href="/sensors" style={navLink(is("/sensors"))}>
          Sensors
        </Link>
        <Link href="/docs" style={navLink(is("/docs"))}>
          Docs
        </Link>
      </nav>

      {/* User Session Info & Logout */}
      {user && (
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginLeft: "auto" }}>
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
    </header>
  );
}
