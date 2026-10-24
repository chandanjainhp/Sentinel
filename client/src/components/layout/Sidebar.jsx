"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronRight,
  FileText,
  Key,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  User,
  Webhook,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SentinelLockup } from "@/components/brand/SentinelMark";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";

// Top-level navigation entries.
// Settings is special: it has sub-items, so we render it as an expandable
// section. When the user is on any /settings/* route, the section auto-expands
// to reveal General / API Keys / Webhooks.
const NAV_ITEMS = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/sensors", label: "Machines", icon: Activity },
  { href: "/sensors/trends", label: "Sensor Trends", icon: BarChart3 },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/overnight-health", label: "Overnight Health", icon: Moon },
  { href: "/investigations", label: "Investigations", icon: Search },
  { href: "/briefing", label: "Reports", icon: FileText },
];

// Sub-items under "Settings" in the sidebar.
const SETTINGS_SUBITEMS = [
  { href: "/settings/general", label: "General", icon: Settings },
  { href: "/settings/api-keys", label: "API Keys", icon: Key },
  { href: "/settings/webhooks", label: "Webhooks", icon: Webhook },
];

function isActiveRoute(pathname, href) {
  // /sensors is its own page (machines list); /sensors/trends must not light
  // both entries, so it is matched exactly.
  if (href === "/sensors") return pathname === "/sensors";
  if (href === "/overview") return pathname === "/overview" || pathname === "/dashboard";
  // Nested detail routes keep their section active (/incidents/:id, …).
  return pathname === href || pathname?.startsWith(`${href}/`);
}

function isSettingsActive(pathname) {
  return pathname?.startsWith("/settings/");
}

export { NAV_ITEMS, SETTINGS_SUBITEMS, isActiveRoute };

export default function Sidebar() {
  const pathname = usePathname() || "";
  const [mobileOpen, setMobileOpen] = useState(false);
  // Auto-expand Settings when the user lands on /settings/*. They can collapse
  // it manually afterwards — the choice persists for the session.
  const [settingsExpanded, setSettingsExpanded] = useState(() =>
    isSettingsActive(pathname),
  );

  // Re-expand if the user navigates into /settings/* via another route.
  useEffect(() => {
    if (isSettingsActive(pathname)) setSettingsExpanded(true);
  }, [pathname]);

  const user = useAuthStore((state) => state.user);
  const { logout } = useAuth();

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const closeMobile = () => setMobileOpen(false);

  const navigation = (
    <nav className="sentinel-sidebar-nav" aria-label="Primary navigation">
      <div className="sentinel-sidebar-section-label">Workspace</div>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActiveRoute(pathname, href);
        return (
          <Link
            key={label}
            href={href}
            className={`sentinel-sidebar-link${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            title={label}
            onClick={closeMobile}
          >
            <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}

      {/* Settings — expandable section, no separate sidebar in /settings/*.
          One nav, one home for everything. */}
      <div className="sentinel-sidebar-section-label">Account</div>
      <div className="sentinel-sidebar-settings-group">
        <Link
          href="/settings/general"
          className={`sentinel-sidebar-link sentinel-sidebar-link--has-chevron${
            isSettingsActive(pathname) ? " is-active" : ""
          }`}
          aria-current={isSettingsActive(pathname) ? "page" : undefined}
          aria-label="Settings"
          title="Settings"
          onClick={closeMobile}
        >
          <Settings size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>Settings</span>
          <button
            type="button"
            className="sentinel-sidebar-chevron"
            aria-label={
              settingsExpanded ? "Collapse settings" : "Expand settings"
            }
            aria-expanded={settingsExpanded}
            aria-controls="sentinel-settings-subnav"
            // Stop propagation so the parent Link navigation doesn't fire —
            // clicking the chevron only toggles, doesn't navigate.
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSettingsExpanded((v) => !v);
            }}
          >
            <ChevronRight
              size={14}
              strokeWidth={2}
              aria-hidden="true"
              style={{
                transition: "transform 180ms ease",
                transform: settingsExpanded ? "rotate(90deg)" : "rotate(0deg)",
              }}
            />
          </button>
        </Link>

        {settingsExpanded && (
          <ul
            id="sentinel-settings-subnav"
            className="sentinel-sidebar-subnav"
            role="list"
          >
            {SETTINGS_SUBITEMS.map(({ href, label, icon: SubIcon }) => {
              const active = isActiveRoute(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`sentinel-sidebar-sublink${active ? " is-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    aria-label={label}
                    title={label}
                    onClick={closeMobile}
                  >
                    <SubIcon size={14} strokeWidth={1.8} aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );

  return (
    <>
      <button
        type="button"
        className="sentinel-sidebar-menu-button"
        aria-expanded={mobileOpen}
        aria-controls="sentinel-sidebar"
        aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
        onClick={() => setMobileOpen((open) => !open)}
      >
        {mobileOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        <span>Menu</span>
      </button>

      {mobileOpen && (
        <button
          type="button"
          className="sentinel-sidebar-overlay"
          aria-label="Close navigation menu"
          onClick={closeMobile}
        />
      )}

      <aside id="sentinel-sidebar" className={`sentinel-sidebar${mobileOpen ? " is-open" : ""}`}>
        <div className="sentinel-sidebar-brand">
          <Link href="/overview" aria-label="Sentinel overview" onClick={closeMobile}>
            <SentinelLockup boot markSize={28} fontSize={15} />
          </Link>
        </div>

        {navigation}

        <div className="sentinel-sidebar-footer">
          {user && (
            <Link
              href="/profile"
              className="sentinel-sidebar-user"
              aria-label={`Open profile for ${user.username || user.email || "account"}`}
              title="Profile"
              onClick={closeMobile}
            >
              <User size={16} aria-hidden="true" />
              <span>{user.username || user.email || "Account"}</span>
            </Link>
          )}
          <button
            type="button"
            className="sentinel-sidebar-logout"
            aria-label="Log out"
            title="Log out"
            onClick={() => { closeMobile(); logout(); }}
          >
            <LogOut size={16} aria-hidden="true" />
            <span>Log out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
