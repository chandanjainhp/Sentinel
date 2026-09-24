'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { loginUser } from '@/lib/api';
import { initTheme } from '@/lib/theme';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SYSTEM_FEATURES = [
  { color: 'var(--sev-serious)', label: 'Drone Patrol', desc: 'Sensors capture motion, badge swipes, vehicle movement, and environmental readings overnight.' },
  { color: 'var(--accent)', label: 'AI Investigation', desc: 'Claude correlates events, investigates anomalies, and classifies each incident before morning.' },
  { color: 'var(--sev-harmless)', label: 'Morning Briefing', desc: 'Project Managers review structured findings, approve the briefing, and distribute to stakeholders.' },
];

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '' });
  const [serverError, setServerError] = useState('');
  const [loginSuccess, setLoginSuccess] = useState(false);

  useEffect(() => {
    initTheme();
    if (reason === 'session_ended') {
      setServerError('Your session has ended. Please log in again.');
    }
  }, [reason]);

  const mutation = useMutation({
    mutationFn: ({ email, password }) => loginUser(email, password),
    onSuccess: async (data) => {
      setServerError('');

      if (data?.user?.isActive === false) {
        setServerError('__disabled__');
        return;
      }

      setLoginSuccess(true);
      if (data?.user) {
        localStorage.setItem('ridgeway_user', JSON.stringify(data.user));
        const { useAuthStore } = require('@/store/authStore');
        useAuthStore.getState().setUser(data.user);
      }
      document.cookie = 'ridgeway_auth=1; path=/; max-age=86400; SameSite=Lax';

      router.replace('/overview');
    },
    onError: (error) => {
      setLoginSuccess(false);
      const msg = error?.message || '';
      if (msg.toLowerCase().includes('suspend') || error?.code === 'ORG_SUSPENDED') {
        setServerError('__suspended__');
      } else {
        setServerError(msg || 'Unable to sign in. Please try again.');
      }
    },
  });

  const validateForm = () => {
    const errors = { email: '', password: '' };
    if (!formData.email.trim()) errors.email = 'Email is required.';
    else if (!emailPattern.test(formData.email)) errors.email = 'Enter a valid email address.';
    if (!formData.password) errors.password = 'Password is required.';
    else if (formData.password.length < 8) errors.password = 'Min 8 characters required.';
    setFieldErrors(errors);
    return !errors.email && !errors.password;
  };

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: '' }));
    if (serverError) setServerError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoginSuccess(false);
    mutation.mutate(formData);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex' }}>

      {/* ── LEFT CONTEXT PANEL ────────────────────────── */}
      <aside className="auth-side" style={{
        width: '360px', flexShrink: 0,
        background: 'var(--bg-surface-1)',
        borderRight: '1px solid var(--border-default)',
        display: 'flex', flexDirection: 'column',
        padding: '40px 32px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Dot grid texture */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(35,43,56,0.7) 1px, transparent 1px)',
          backgroundSize: '24px 24px', pointerEvents: 'none',
        }} />
        {/* Bottom gradient fade */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '120px',
          background: 'linear-gradient(to bottom, transparent, var(--bg-surface-1))',
          pointerEvents: 'none', zIndex: 2,
        }} />

        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* Logo */}
          <div style={{ marginBottom: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: 'var(--sev-serious)', boxShadow: 'var(--glow-serious)',
                animation: 'status-pulse 2s ease-in-out infinite', flexShrink: 0,
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-1)',
              }}>Sentinel</span>
            </div>
          </div>

          <div style={{ height: '1px', background: 'var(--border-default)', marginBottom: '28px', marginTop: '28px' }} />

          {/* How it works */}
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--fg-4)', marginBottom: '16px',
          }}>How It Works</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {SYSTEM_FEATURES.map((f, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '8px 1fr',
                alignItems: 'start', gap: '10px',
                padding: '10px 0',
                borderTop: i > 0 ? '1px solid var(--border-hairline)' : 'none',
              }}>
                <span style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: f.color, flexShrink: 0, marginTop: '3px',
                }} />
                <div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'var(--fg-2)', marginBottom: '3px',
                  }}>{f.label}</div>
                  <div style={{
                    fontSize: '11px', color: 'var(--fg-3)', lineHeight: 1.5,
                  }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            marginTop: 'auto', paddingTop: '32px',
            fontFamily: 'var(--font-mono)', fontSize: '10px',
            color: 'var(--fg-4)', letterSpacing: '0.06em',
          }}>v0.1 · restricted system</div>
        </div>
      </aside>

      {/* ── RIGHT FORM PANEL ──────────────────────────── */}
      <main style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px', minHeight: '100vh',
      }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>

          {/* Header */}
          <div style={{ marginBottom: '36px' }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--fg-4)', marginBottom: '10px',
            }}>Project Access</div>
            <h1 style={{
              fontFamily: 'var(--font-sans)', fontSize: '30px', fontWeight: 500,
              lineHeight: 1.05, letterSpacing: '-0.02em',
              color: 'var(--fg-1)', margin: '0 0 8px',
            }}>Sign in</h1>
            <p style={{
              fontFamily: 'var(--font-sans)', fontSize: '13px',
              color: 'var(--fg-3)', lineHeight: 1.5, margin: 0,
            }}>Enter your credentials to access the platform.</p>
          </div>

          {/* Account disabled banner */}
          {serverError === '__disabled__' && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '8px',
              padding: '10px 14px', marginBottom: '20px',
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.3)',
            }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0, marginTop: '4px' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#f59e0b' }}>
                Your account is disabled. Contact your administrator.
              </span>
            </div>
          )}

          {/* Org suspended banner */}
          {serverError === '__suspended__' && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '8px',
              padding: '10px 14px', marginBottom: '20px',
              background: 'var(--sev-serious-bg)',
              border: '1px solid var(--sev-serious-dim)',
            }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--sev-serious)', flexShrink: 0, marginTop: '4px' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--sev-serious)' }}>
                This site has been suspended. Contact support at support@sentinel.io.
              </span>
            </div>
          )}

          {/* Server error */}
          {serverError && serverError !== '__disabled__' && serverError !== '__suspended__' && (
            <div role="alert" aria-live="polite" style={{
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
              }}>{serverError}</span>
            </div>
          )}

          {/* Success */}
          {loginSuccess && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 14px', marginBottom: '20px',
              background: 'var(--sev-harmless-bg)',
              border: '1px solid var(--sev-harmless-dim)',
            }}>
              <span style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: 'var(--success)', flexShrink: 0,
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '11px',
                color: 'var(--success-text)',
              }}>Authenticated — redirecting to ops…</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

            <div>
              <label htmlFor="login-email" style={{
                display: 'block',
                fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: fieldErrors.email ? 'var(--sev-serious)' : 'var(--fg-3)',
                marginBottom: '7px',
              }}>Email Address</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={formData.email}
                onChange={(e) => handleFieldChange('email', e.target.value)}
                required
                placeholder="operator@example.com"
                className={`auth-field${fieldErrors.email ? ' auth-field-err' : ''}`}
              />
              {fieldErrors.email && (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '10px',
                  color: 'var(--sev-serious)', marginTop: '5px',
                }}>{fieldErrors.email}</div>
              )}
            </div>

            <div>
              <label htmlFor="login-password" style={{
                display: 'block',
                fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: fieldErrors.password ? 'var(--sev-serious)' : 'var(--fg-3)',
                marginBottom: '7px',
              }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={formData.password}
                  onChange={(e) => handleFieldChange('password', e.target.value)}
                  required
                  className={`auth-field${fieldErrors.password ? ' auth-field-err' : ''}`}
                  style={{ paddingRight: '44px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0,
                    width: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-4)',
                  }}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 3l18 18m-3.5-3.5A10.5 10.5 0 0 1 12 19c-6 0-10-7-10-7a19.2 19.2 0 0 1 5.2-5.6M9.9 5.3A9.8 9.8 0 0 1 12 5c6 0 10 7 10 7a19 19 0 0 1-2.6 3.6M14.1 14.1a3 3 0 0 1-4.2-4.2" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                    </svg>
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '10px',
                  color: 'var(--sev-serious)', marginTop: '5px',
                }}>{fieldErrors.password}</div>
              )}
            </div>

            <button
              type="submit"
              disabled={mutation.isPending}
              aria-busy={mutation.isPending}
              className="auth-submit"
              style={{ marginTop: '4px' }}
            >
              {mutation.isPending ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span className="auth-spinner" />
                  Authenticating…
                </span>
              ) : 'Sign In →'}
            </button>
          </form>

          {/* Footer links */}
          <div style={{
            marginTop: '28px', paddingTop: '20px',
            borderTop: '1px solid var(--border-hairline)',
            display: 'flex', flexDirection: 'column', gap: '10px',
          }}>
            <Link href="/forgot-password" style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px',
              color: 'var(--fg-3)', background: 'none', border: 'none',
              cursor: 'pointer', textAlign: 'left',
              letterSpacing: '0.06em', padding: 0, textDecoration: 'none',
            }}>
              Forgot your password?
            </Link>
            <Link href="/docs" style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px',
              color: 'var(--fg-3)', background: 'none', border: 'none',
              cursor: 'pointer', textAlign: 'left',
              letterSpacing: '0.06em', padding: 0, textDecoration: 'none',
            }}>
              Documentation
            </Link>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px',
              color: 'var(--fg-4)', letterSpacing: '0.06em',
            }}>
              No account?{' '}
              <Link href="/register" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                Request access →
              </Link>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .auth-field {
          width: 100%; box-sizing: border-box; height: 44px;
          padding: 0 14px;
          background: var(--bg-surface-2);
          border: 1px solid var(--border-default);
          color: var(--fg-1);
          font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.02em;
          border-radius: 0;
          transition: border-color 120ms, box-shadow 120ms;
        }
        .auth-field::placeholder { color: var(--fg-4); font-size: 12px; }
        .auth-field:focus {
          border-color: var(--border-focus);
          box-shadow: 0 0 0 1px var(--border-focus), 0 0 14px rgba(184,212,232,0.07);
        }
        .auth-field-err { border-color: var(--sev-serious-dim) !important; }
        .auth-field-err:focus {
          border-color: var(--sev-serious) !important;
          box-shadow: 0 0 0 1px var(--sev-serious), 0 0 8px rgba(255,56,56,0.08) !important;
        }
        .auth-submit {
          width: 100%; height: 46px;
          background: var(--accent); color: var(--bg-base);
          border: none;
          font-family: var(--font-mono); font-size: 11px; font-weight: 600;
          letter-spacing: 0.12em; text-transform: uppercase;
          cursor: pointer; transition: opacity 150ms; border-radius: 0;
        }
        .auth-submit:hover:not(:disabled) { opacity: 0.85; }
        .auth-submit:active:not(:disabled) { opacity: 0.7; }
        .auth-submit:disabled { opacity: 0.4; cursor: not-allowed; }
        .auth-spinner {
          display: inline-block; width: 10px; height: 10px;
          border: 1.5px solid rgba(7,9,12,0.3);
          border-top-color: var(--bg-base);
          border-radius: 50%;
          animation: auth-spin 0.7s linear infinite;
        }
        @keyframes auth-spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .auth-side { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function LoginFallback() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-base)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "10px",
        letterSpacing: "0.14em", textTransform: "uppercase",
        color: "var(--fg-4)",
      }}>
        Loading…
      </span>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageInner />
    </Suspense>
  );
}
