'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  PAGE_PADDING,
  PAGE_PADDING_MOBILE,
  SETTINGS_CONTENT_MAX_WIDTH,
  BREAKPOINT_TABLET,
  mediaMax,
} from '@/lib/layout-tokens';

const MONO = 'var(--font-mono)';

// Mirror of SETTINGS_SUBITEMS in components/layout/Sidebar.jsx — kept here
// so the breadcrumb can render the current section name without importing
// the sidebar component (which would re-mount the sidebar in the layout).
const SETTINGS_SECTIONS = [
  { path: '/settings/general', name: 'General' },
  { path: '/settings/api-keys', name: 'API Keys' },
  { path: '/settings/webhooks', name: 'Webhooks' },
];

/**
 * Settings layout — NO SECOND SIDEBAR.
 *
 * Previously this layout rendered its own 220px secondary sidebar with
 * General / API Keys / Webhooks. That created two sidebars on /settings/*
 * (the main 256px project sidebar + the 220px settings sidebar), which was
 * visually noisy and wasted horizontal space.
 *
 * Now the settings sub-nav lives inside the MAIN sidebar as an expandable
 * "Settings" section (see components/layout/Sidebar.jsx). This layout just
 * renders a breadcrumb header + the children at full width.
 *
 * A horizontal tab strip is also shown at the top of the content area on
 * narrow viewports (<= 768px) where the main sidebar collapses to a drawer
 * — so users on phones can still switch between settings sections without
 * opening the drawer.
 */
export default function SettingsLayout({ children }) {
  const pathname = usePathname() || '';

  const current = SETTINGS_SECTIONS.find(
    (s) => pathname === s.path || pathname.startsWith(s.path + '/'),
  );

  return (
    <div
      className="settings-content"
      style={{
        flex: 1,
        minWidth: 0,
        overflowY: 'auto',
        background: 'var(--bg-base)',
        padding: PAGE_PADDING,
      }}
    >
      <style dangerouslySetInnerHTML={{
        __html: `
          /* On phones/tablets where the main sidebar collapses to a drawer,
             show a horizontal tab strip so settings sub-sections are still
             reachable without re-opening the drawer. */
          ${mediaMax(BREAKPOINT_TABLET)} {
            .settings-content { padding: ${PAGE_PADDING_MOBILE} !important; }
            .settings-tabs { display: flex !important; }
            .settings-breadcrumb { display: none !important; }
          }
          /* Desktop: breadcrumb only, no tabs (the sidebar handles it). */
          .settings-tabs { display: none; }
          .settings-breadcrumb { display: flex; }
        `,
      }} />

      <div style={{ maxWidth: SETTINGS_CONTENT_MAX_WIDTH, margin: '0 auto' }}>
        {/* Breadcrumb — desktop / wide */}
        <div
          className="settings-breadcrumb"
          style={{
            alignItems: 'center',
            gap: '10px',
            marginBottom: '24px',
            fontFamily: MONO,
            fontSize: '10px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ color: 'var(--fg-3)' }}>Settings</span>
          {current && (
            <>
              <span style={{ color: 'var(--fg-4)' }}>/</span>
              <span style={{ color: 'var(--fg-1)' }}>{current.name}</span>
            </>
          )}
        </div>

        {/* Tab strip — mobile / tablet only */}
        <nav
          className="settings-tabs"
          aria-label="Settings sections"
          style={{
            display: 'none',
            alignItems: 'center',
            gap: '4px',
            marginBottom: '20px',
            overflowX: 'auto',
            borderBottom: '1px solid var(--border-default)',
            paddingBottom: '8px',
          }}
        >
          {SETTINGS_SECTIONS.map((section) => {
            const active =
              pathname === section.path ||
              pathname.startsWith(section.path + '/');
            return (
              <Link
                key={section.path}
                href={section.path}
                aria-current={active ? 'page' : undefined}
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  fontFamily: MONO,
                  fontSize: '10px',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: active ? 'var(--fg-1)' : 'var(--fg-3)',
                  background: active ? 'var(--bg-surface-2)' : 'transparent',
                  borderBottom: active
                    ? '2px solid var(--accent)'
                    : '2px solid transparent',
                  textDecoration: 'none',
                  transition: 'background 120ms, color 120ms',
                }}
              >
                {section.name}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </div>
  );
}
