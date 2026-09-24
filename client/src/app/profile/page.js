'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getCurrentUser, changePassword } from '@/lib/api';

function getInitials(user) {
  if (!user) return '?';
  const name = user.username || user.email || '';
  if (user.username) return user.username.slice(0, 2).toUpperCase();
  const parts = name.split('@');
  return parts[0].slice(0, 2).toUpperCase();
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function ProfilePage() {
  const router = useRouter();

  // Seed from localStorage immediately to avoid flash
  const [localUser, setLocalUser] = useState(null);
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ridgeway_user');
      if (stored) setLocalUser(JSON.parse(stored));
    } catch { /* noop */ }
  }, []);

  const { data: fetchedUser, isLoading: userLoading } = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
    retry: false,
    onError: () => router.push('/login'),
  });

  // Merge: remote data wins if available
  const user = fetchedUser || localUser;

  // ── Password change form ──────────────────────────────
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [pwSuccess, setPwSuccess] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const pwMutation = useMutation({
    mutationFn: () =>
      changePassword({ currentPassword: pwForm.current, newPassword: pwForm.next }),
    onSuccess: () => {
      setPwSuccess(true);
      setPwForm({ current: '', next: '', confirm: '' });
      setTimeout(() => setPwSuccess(false), 4000);
    },
    onError: (err) => {
      setPwErrors({ server: err?.message || 'Password change failed.' });
    },
  });

  function validatePw() {
    const errs = {};
    if (!pwForm.current) errs.current = 'Current password is required.';
    if (!pwForm.next) errs.next = 'New password is required.';
    else if (pwForm.next.length < 8) errs.next = 'Min 8 characters required.';
    if (!pwForm.confirm) errs.confirm = 'Please confirm your new password.';
    else if (pwForm.confirm !== pwForm.next) errs.confirm = 'Passwords do not match.';
    setPwErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handlePwChange(field, val) {
    setPwForm((p) => ({ ...p, [field]: val }));
    setPwErrors((p) => ({ ...p, [field]: '', server: '' }));
    if (pwSuccess) setPwSuccess(false);
  }

  function handlePwSubmit(e) {
    e.preventDefault();
    if (!validatePw()) return;
    pwMutation.mutate();
  }

  const initials = getInitials(user);
  const displayName = user?.username || user?.email?.split('@')[0] || '—';
  const email = user?.email || '—';
  const joinedAt = formatDate(user?.createdAt);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex' }}>

      {/* ── LEFT IDENTITY PANEL ────────────────────────── */}
      <aside style={{
        width: '300px', flexShrink: 0,
        background: 'var(--bg-surface-1)',
        borderRight: '1px solid var(--border-default)',
        display: 'flex', flexDirection: 'column',
        padding: '40px 28px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Dot grid */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(35,43,56,0.7) 1px, transparent 1px)',
          backgroundSize: '24px 24px', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '120px',
          background: 'linear-gradient(to bottom, transparent, var(--bg-surface-1))',
          pointerEvents: 'none', zIndex: 2,
        }} />

        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* Wordmark */}
          <div style={{ marginBottom: '36px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: 'var(--accent)', flexShrink: 0,
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-1)',
              }}>Sentinel</span>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px',
              color: 'var(--fg-4)', letterSpacing: '0.1em',
              textTransform: 'uppercase', paddingLeft: '15px',
            }}>Operator Profile</div>
          </div>

          {/* Avatar */}
          <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: 'var(--accent-deep)',
              border: '1px solid var(--border-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700,
              color: 'var(--accent)', letterSpacing: '-0.02em',
              userSelect: 'none',
            }}>
              {userLoading && !localUser ? '·' : initials}
            </div>
          </div>

          {/* Name */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{
              fontFamily: 'var(--font-sans)', fontSize: '16px', fontWeight: 500,
              color: 'var(--fg-1)', marginBottom: '6px',
              letterSpacing: '-0.01em',
            }}>{displayName}</div>
          </div>

          <div style={{ height: '1px', background: 'var(--border-default)', marginBottom: '24px' }} />

          {/* Meta rows */}
          {[
            { label: 'Username', value: user?.username || '—' },
            { label: 'Email', value: email },
            { label: 'Member since', value: joinedAt },
          ].map((row) => (
            <div key={row.label} style={{ marginBottom: '16px' }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'var(--fg-4)', marginBottom: '3px',
              }}>{row.label}</div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '12px',
                color: 'var(--fg-2)', wordBreak: 'break-all',
              }}>{row.value}</div>
            </div>
          ))}

          <div style={{
            marginTop: 'auto', paddingTop: '24px',
            fontFamily: 'var(--font-mono)', fontSize: '10px',
            color: 'var(--fg-4)', letterSpacing: '0.06em',
          }}>v0.1 · restricted system</div>
        </div>
      </aside>

      {/* ── RIGHT CONTENT PANEL ───────────────────────── */}
      <main style={{
        flex: 1, padding: '48px 48px',
        overflowY: 'auto',
        maxWidth: '680px',
      }}>

        {/* Page header */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--fg-4)', marginBottom: '10px',
          }}>Account Settings</div>
          <h1 style={{
            fontFamily: 'var(--font-sans)', fontSize: '28px', fontWeight: 500,
            lineHeight: 1.05, letterSpacing: '-0.02em',
            color: 'var(--fg-1)', margin: '0 0 8px',
          }}>Your Profile</h1>
          <p style={{
            fontFamily: 'var(--font-sans)', fontSize: '13px',
            color: 'var(--fg-3)', lineHeight: 1.5, margin: 0,
          }}>Manage your operator credentials and security settings.</p>
        </div>

        {/* ── Section: Account Info ── */}
        <section style={{ marginBottom: '40px' }}>
          <SectionHeader label="Account Information" />

          <div style={{
            background: 'var(--bg-surface-1)',
            border: '1px solid var(--border-default)',
          }}>
            {[
              { label: 'Username', value: user?.username || '—' },
              { label: 'Email Address', value: email },
              { label: 'Account Created', value: joinedAt },
            ].map((row, i, arr) => (
              <div key={row.label} style={{
                display: 'grid', gridTemplateColumns: '160px 1fr',
                gap: '16px', alignItems: 'center',
                padding: '14px 20px',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border-hairline)' : 'none',
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'var(--fg-4)',
                }}>{row.label}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: '12px',
                  color: 'var(--fg-2)',
                }}>{row.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Section: Change Password ── */}
        <section style={{ marginBottom: '40px' }}>
          <SectionHeader label="Change Password" />

          {/* Server error banner */}
          {pwErrors.server && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 14px', marginBottom: '20px',
              background: 'var(--sev-serious-bg)',
              border: '1px solid var(--sev-serious-dim)',
            }}>
              <span style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: 'var(--sev-serious)', flexShrink: 0,
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '11px',
                color: 'var(--sev-serious)',
              }}>{pwErrors.server}</span>
            </div>
          )}

          {/* Success banner */}
          {pwSuccess && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 14px', marginBottom: '20px',
              background: 'var(--sev-harmless-bg)',
              border: '1px solid var(--sev-harmless-dim)',
            }}>
              <span style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: '#4ade80', flexShrink: 0,
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '11px',
                color: '#4ade80',
              }}>Password updated successfully.</span>
            </div>
          )}

          <form onSubmit={handlePwSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

            <PasswordField
              id="pw-current"
              label="Current Password"
              value={pwForm.current}
              show={showCurrent}
              onToggle={() => setShowCurrent((p) => !p)}
              onChange={(v) => handlePwChange('current', v)}
              error={pwErrors.current}
              autoComplete="current-password"
            />

            <PasswordField
              id="pw-next"
              label="New Password"
              value={pwForm.next}
              show={showNext}
              onToggle={() => setShowNext((p) => !p)}
              onChange={(v) => handlePwChange('next', v)}
              error={pwErrors.next}
              autoComplete="new-password"
            />

            {/* Strength bar */}
            {pwForm.next && (
              <StrengthMeter password={pwForm.next} />
            )}

            <PasswordField
              id="pw-confirm"
              label="Confirm New Password"
              value={pwForm.confirm}
              show={showNext}
              onToggle={() => setShowNext((p) => !p)}
              onChange={(v) => handlePwChange('confirm', v)}
              error={pwErrors.confirm}
              autoComplete="new-password"
            />

            <div>
              <button
                type="submit"
                disabled={pwMutation.isPending}
                style={{
                  height: '44px', padding: '0 28px',
                  background: 'var(--accent)', color: 'var(--bg-base)',
                  border: 'none', borderRadius: 0,
                  fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  cursor: pwMutation.isPending ? 'not-allowed' : 'pointer',
                  opacity: pwMutation.isPending ? 0.4 : 1,
                  transition: 'opacity 150ms',
                }}
              >
                {pwMutation.isPending ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      display: 'inline-block', width: '10px', height: '10px',
                      border: '1.5px solid rgba(7,9,12,0.3)',
                      borderTopColor: 'var(--bg-base)',
                      borderRadius: '50%',
                      animation: 'spin 0.7s linear infinite',
                    }} />
                    Updating…
                  </span>
                ) : 'Update Password →'}
              </button>
            </div>
          </form>
        </section>

        {/* ── Section: Session ── */}
        <section>
          <SectionHeader label="Session" />
          <div style={{
            background: 'var(--bg-surface-1)',
            border: '1px solid var(--border-default)',
            padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600,
                color: 'var(--fg-2)', marginBottom: '3px',
              }}>Active session</div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '10px',
                color: 'var(--fg-4)',
              }}>Authenticated via JWT · expires in 24h</div>
            </div>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('ridgeway_user');
                document.cookie = 'ridgeway_auth=; path=/; max-age=0; SameSite=Lax';
                document.cookie = 'ridgeway_setup=; path=/; max-age=0; SameSite=Lax';
                router.replace('/login');
              }}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--sev-serious)', background: 'none',
                border: '1px solid var(--sev-serious-dim)',
                padding: '7px 14px', cursor: 'pointer', borderRadius: 0,
                transition: 'background 120ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sev-serious-bg)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              Sign Out
            </button>
          </div>
        </section>
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .pw-field {
          width: 100%; box-sizing: border-box; height: 44px;
          padding: 0 44px 0 14px;
          background: var(--bg-surface-2);
          border: 1px solid var(--border-default);
          color: var(--fg-1);
          font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.02em;
          border-radius: 0;
          transition: border-color 120ms, box-shadow 120ms;
        }
        .pw-field::placeholder { color: var(--fg-4); font-size: 12px; }
        .pw-field:focus {
          border-color: var(--border-focus);
          box-shadow: 0 0 0 1px var(--border-focus), 0 0 14px rgba(184,212,232,0.07);
        }
        .pw-field-err { border-color: var(--sev-serious-dim) !important; }
        .pw-field-err:focus {
          border-color: var(--sev-serious) !important;
          box-shadow: 0 0 0 1px var(--sev-serious), 0 0 8px rgba(255,56,56,0.08) !important;
        }
        @media (max-width: 768px) {
          aside { display: none !important; }
          main { padding: 32px 20px !important; max-width: 100% !important; }
        }
      `}</style>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────── */

function SectionHeader({ label }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
      letterSpacing: '0.14em', textTransform: 'uppercase',
      color: 'var(--fg-4)', marginBottom: '12px',
      paddingBottom: '8px',
      borderBottom: '1px solid var(--border-hairline)',
    }}>{label}</div>
  );
}

function PasswordField({ id, label, value, show, onToggle, onChange, error, autoComplete }) {
  return (
    <div>
      <label htmlFor={id} style={{
        display: 'block',
        fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: error ? 'var(--sev-serious)' : 'var(--fg-3)',
        marginBottom: '7px',
      }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`pw-field${error ? ' pw-field-err' : ''}`}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? 'Hide password' : 'Show password'}
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0,
            width: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-4)',
          }}
        >
          {show ? (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l18 18m-3.5-3.5A10.5 10.5 0 0 1 12 19c-6 0-10-7-10-7a19.2 19.2 0 0 1 5.2-5.6M9.9 5.3A9.8 9.8 0 0 1 12 5c6 0 10 7 10 7a19 19 0 0 1-2.6 3.6M14.1 14.1a3 3 0 0 1-4.2-4.2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            </svg>
          )}
        </button>
      </div>
      {error && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '10px',
          color: 'var(--sev-serious)', marginTop: '5px',
        }}>{error}</div>
      )}
    </div>
  );
}

function StrengthMeter({ password }) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { label: 'Weak', color: 'var(--sev-serious)' },
    { label: 'Weak', color: 'var(--sev-serious)' },
    { label: 'Fair', color: 'var(--sev-minor)' },
    { label: 'Good', color: 'var(--sev-harmless)' },
    { label: 'Strong', color: 'var(--accent)' },
    { label: 'Strong', color: 'var(--accent)' },
  ];
  const level = levels[Math.min(score, 5)];

  return (
    <div>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '5px' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            flex: 1, height: '2px',
            background: i < score ? level.color : 'var(--border-default)',
            transition: 'background 200ms',
          }} />
        ))}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '10px',
        color: level.color, letterSpacing: '0.08em',
      }}>{level.label}</div>
    </div>
  );
}
