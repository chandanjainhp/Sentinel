'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Settings, Key, Webhook } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const MONO = 'var(--font-mono)';
const SANS = 'var(--font-sans)';

const NAV_ITEMS = [
  { name: 'General',  path: '/settings/general',  icon: Settings, helpAnchor: null },
  { name: 'API Keys', path: '/settings/api-keys', icon: Key,      helpAnchor: '#ingest' },
  { name: 'Webhooks', path: '/settings/webhooks', icon: Webhook,  helpAnchor: '#webhooks' },
];

export default function SettingsLayout({ children }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="settings-shell" style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        /* Phones/tablets: the 220px sticky sidebar becomes a horizontal tab
           strip so settings content keeps full width. */
        @media (max-width: 768px) {
          .settings-shell { flex-direction: column !important; }
          .settings-sidebar {
            width: 100% !important;
            position: static !important;
            height: auto !important;
            flex-direction: row !important;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            overflow-x: auto;
            overflow-y: hidden;
            border-right: none !important;
            border-bottom: 1px solid var(--border-default);
          }
          .settings-sidebar-header {
            padding: 0 !important;
            border-bottom: none !important;
            flex-shrink: 0;
          }
          .settings-sidebar-nav {
            display: flex !important;
            flex-direction: row !important;
            gap: 4px;
            padding: 0 !important;
          }
          .settings-sidebar-link {
            margin-bottom: 0 !important;
            white-space: nowrap;
            border-left: none !important;
            border-bottom: 2px solid transparent;
            padding: 12px 10px !important;
          }
          .settings-sidebar-link.active {
            border-bottom-color: var(--accent);
          }
          .settings-sidebar-footer { display: none; }
          .settings-content { padding: 20px 16px !important; }
        }
      ` }} />
      {/* Sidebar */}
      <div className="settings-sidebar" style={{
        width: '220px',
        flexShrink: 0,
        background: 'var(--bg-surface-1)',
        borderRight: '1px solid var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: '56px',
        height: 'calc(100vh - 56px)',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div className="settings-sidebar-header" style={{
          padding: '16px',
          borderBottom: '1px solid var(--border-hairline)',
        }}>
          <div style={{
            fontFamily: MONO,
            fontSize: '10px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--fg-3)',
          }}>
            Settings
          </div>
        </div>

        {/* Nav */}
        <nav className="settings-sidebar-nav" style={{ flex: 1, padding: '8px' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.path}
                className={`settings-sidebar-link${isActive ? ' active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  marginBottom: '2px',
                  borderRadius: '2px',
                  borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  background: isActive ? 'var(--bg-surface-3)' : 'transparent',
                  color: isActive ? 'var(--fg-1)' : 'var(--fg-3)',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  fontFamily: SANS,
                  fontSize: '13px',
                  transition: 'background 120ms, color 120ms',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'var(--fg-2)';
                    e.currentTarget.style.background = 'var(--bg-surface-2)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'var(--fg-3)';
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <Icon size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: back link + account info */}
        <div className="settings-sidebar-footer" style={{
          padding: '12px',
          borderTop: '1px solid var(--border-hairline)',
        }}>
          <Link
            href="/overview"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 10px',
              fontFamily: MONO,
              fontSize: '10px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--fg-3)',
              textDecoration: 'none',
              transition: 'color 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg-1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-3)'; }}
          >
            ← Dashboard
          </Link>
          {user?.email && (
            <div style={{
              marginTop: '8px',
              padding: '8px 10px',
              background: 'var(--bg-surface-2)',
              borderRadius: '2px',
              border: '1px solid var(--border-hairline)',
            }}>
              <div style={{
                fontFamily: SANS,
                fontSize: '12px',
                color: 'var(--fg-2)',
                marginBottom: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {user.email}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="settings-content" style={{
        flex: 1,
        minWidth: 0,
        overflowY: 'auto',
        background: 'var(--bg-base)',
        padding: '32px 24px',
      }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          {/* Breadcrumb header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            marginBottom: '24px',
            fontFamily: MONO, fontSize: '10px',
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            <span style={{ color: 'var(--fg-3)' }}>Settings</span>
            {(() => {
              const current = NAV_ITEMS.find(
                (n) => pathname === n.path || pathname.startsWith(n.path + '/')
              );
              if (!current) return null;
              return (
                <>
                  <span style={{ color: 'var(--fg-4)' }}>/</span>
                  <span style={{ color: 'var(--fg-1)' }}>{current.name}</span>
                  {current.helpAnchor && (
                    <Link
                      href={`/docs${current.helpAnchor}`}
                      style={{
                        marginLeft: '12px',
                        color: 'var(--accent)',
                        textDecoration: 'none',
                        fontSize: '10px',
                      }}
                    >
                      ? Learn more
                    </Link>
                  )}
                </>
              );
            })()}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
