'use client';

import { usePathname } from 'next/navigation';
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
const SETTINGS_SECTIONS = [{ path: '/settings/api-keys', name: 'API Keys' }];

/**
 * Settings layout — NO SECOND SIDEBAR.
 *
 * Previously this layout rendered its own 220px secondary sidebar. That created two sidebars on /settings/*
 * (the main 256px project sidebar + the 220px settings sidebar), which was
 * visually noisy and wasted horizontal space.
 *
 * Now the settings sub-nav lives inside the MAIN sidebar as an expandable
 * "Settings" section (see components/layout/Sidebar.jsx). This layout just
 * renders a breadcrumb header + the children at full width.
 *
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
          ${mediaMax(BREAKPOINT_TABLET)} {
            .settings-content { padding: ${PAGE_PADDING_MOBILE} !important; }
          }
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

        {children}
      </div>
    </div>
  );
}
