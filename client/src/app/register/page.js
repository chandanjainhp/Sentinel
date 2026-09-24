'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { registerUser } from '@/lib/api';
import { initTheme } from '@/lib/theme';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-zA-Z0-9_]+$/;

function getPasswordScore(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  return s;
}

const STRENGTH_META = [
  { width: '25%', color: 'var(--sev-serious)', label: 'Weak' },
  { width: '25%', color: 'var(--sev-serious)', label: 'Weak' },
  { width: '50%', color: 'var(--sev-minor)', label: 'Fair' },
  { width: '75%', color: 'var(--sev-minor)', label: 'Good' },
  { width: '100%', color: 'var(--success)', label: 'Strong' },
];

const CAPABILITIES = [
  'Argus investigation feed',
  'Work-package incident list',
  'Morning Operations Briefing',
  'Incident detail & evidence',
  'Overnight telemetry timeline',
];

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: '', email: '', password: '', confirmPassword: '', terms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    username: '', email: '', password: '', confirmPassword: '', terms: '',
  });
  const [serverError, setServerError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => { initTheme(); }, []);

  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => router.push(`/opt?email=${encodeURIComponent(formData.email)}`), 1500);
    return () => clearTimeout(t);
  }, [router, successMessage, formData.email]);

  const mutation = useMutation({
    mutationFn: ({ username, email, password }) => registerUser({ username, email, password }),
    onSuccess: (data) => { 
      setServerError(''); 
      setSuccessMessage('Account created successfully.'); 
      if (data?.user) {
        localStorage.setItem('ridgeway_user', JSON.stringify(data.user));
        document.cookie = 'ridgeway_auth=1; path=/; max-age=86400; SameSite=Lax';
      }
    },
    onError: (error) => {
      setSuccessMessage('');
      setServerError(error?.message || 'Unable to create account. Please try again.');
    },
  });

  const validateForm = () => {
    const errors = { username: '', email: '', password: '', confirmPassword: '', terms: '' };
    if (!formData.username.trim()) errors.username = 'Username is required.';
    else if (formData.username.length < 3) errors.username = 'Min 3 characters.';
    else if (formData.username.length > 20) errors.username = 'Max 20 characters.';
    else if (!usernamePattern.test(formData.username)) errors.username = 'Letters, numbers, underscores only.';
    if (!formData.email.trim()) errors.email = 'Email is required.';
    else if (!emailPattern.test(formData.email)) errors.email = 'Enter a valid email address.';
    if (!formData.password) errors.password = 'Password is required.';
    else if (formData.password.length < 8) errors.password = 'Min 8 characters required.';
    else if (!/[A-Z]/.test(formData.password)) errors.password = 'Must include an uppercase letter.';
    else if (!/[0-9]/.test(formData.password)) errors.password = 'Must include a number.';
    if (!formData.confirmPassword) errors.confirmPassword = 'Confirm password is required.';
    else if (formData.confirmPassword !== formData.password) errors.confirmPassword = 'Passwords do not match.';
    if (!formData.terms) errors.terms = 'You must agree to the terms to continue.';
    setFieldErrors(errors);
    return !Object.values(errors).some(Boolean);
  };

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: '' }));
    if (serverError) setServerError('');
    if (successMessage) setSuccessMessage('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    mutation.mutate({ username: formData.username, email: formData.email, password: formData.password });
  };

  const strength = STRENGTH_META[getPasswordScore(formData.password)];

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
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px',
              color: 'var(--fg-4)', letterSpacing: '0.1em',
              textTransform: 'uppercase', paddingLeft: '15px',
            }}>6:10 Assistant</div>
          </div>

          {/* Section: Clearance Request */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--fg-4)', marginBottom: '12px',
            }}>Clearance Request</div>
            <p style={{
              fontFamily: 'var(--font-sans)', fontSize: '13px',
              color: 'var(--fg-2)', lineHeight: 1.6, margin: 0,
            }}>
              This is a restricted access system. Your account will be linked to the Sentinel operations team.
            </p>
          </div>

          <div style={{ height: '1px', background: 'var(--border-default)', marginBottom: '28px' }} />

          {/* Capabilities granted */}
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--fg-4)', marginBottom: '16px',
          }}>Capabilities Granted</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px' }}>
            {CAPABILITIES.map((cap) => (
              <div key={cap} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  width: '5px', height: '5px', borderRadius: '50%',
                  background: 'var(--accent-dim)', flexShrink: 0,
                }} />
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--fg-2)' }}>{cap}</span>
              </div>
            ))}
          </div>

          <div style={{ height: '1px', background: 'var(--border-default)', marginBottom: '24px' }} />

          {/* Notice */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: 'var(--sev-minor)', flexShrink: 0, marginTop: '3px',
            }} />
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px',
              color: 'var(--fg-4)', lineHeight: 1.6,
            }}>All access requests are reviewed and authorized by the site operations lead.</div>
          </div>

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
        <div style={{ width: '100%', maxWidth: '400px' }}>

          {/* Header */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--fg-4)', marginBottom: '10px',
            }}>New Project User</div>
            <h1 style={{
              fontFamily: 'var(--font-sans)', fontSize: '30px', fontWeight: 500,
              lineHeight: 1.05, letterSpacing: '-0.02em',
              color: 'var(--fg-1)', margin: '0 0 8px',
            }}>Create account</h1>
            <p style={{
              fontFamily: 'var(--font-sans)', fontSize: '13px',
              color: 'var(--fg-3)', lineHeight: 1.5, margin: 0,
            }}>Request access to the Sentinel platform.</p>
          </div>

          {/* Server error */}
          {serverError && (
            <div role="alert" aria-live="polite" style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 14px', marginBottom: '20px',
              background: 'var(--sev-serious-bg)',
              border: '1px solid var(--sev-serious-dim)',
            }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--sev-serious)', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--sev-serious)' }}>{serverError}</span>
            </div>
          )}

          {/* Success */}
          {successMessage && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 14px', marginBottom: '20px',
              background: 'var(--sev-harmless-bg)',
              border: '1px solid var(--sev-harmless-dim)',
            }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--success-text)' }}>Account created — redirecting to verification…</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Username */}
            <div>
              <label htmlFor="reg-username" style={labelStyle(fieldErrors.username)}>Username</label>
              <input
                id="reg-username"
                type="text"
                autoComplete="username"
                value={formData.username}
                onChange={(e) => handleFieldChange('username', e.target.value)}
                required
                placeholder="ops_lead"
                className={`auth-field${fieldErrors.username ? ' auth-field-err' : ''}`}
              />
              {fieldErrors.username
                ? <div style={errStyle}>{fieldErrors.username}</div>
                : <div style={hintStyle}>3–20 chars · letters, numbers, underscores</div>
              }
            </div>

            {/* Email */}
            <div>
              <label htmlFor="reg-email" style={labelStyle(fieldErrors.email)}>Email Address</label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={formData.email}
                onChange={(e) => handleFieldChange('email', e.target.value)}
                required
                placeholder="operator@example.com"
                className={`auth-field${fieldErrors.email ? ' auth-field-err' : ''}`}
              />
              {fieldErrors.email && <div style={errStyle}>{fieldErrors.email}</div>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="reg-password" style={labelStyle(fieldErrors.password)}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={(e) => handleFieldChange('password', e.target.value)}
                  required
                  className={`auth-field${fieldErrors.password ? ' auth-field-err' : ''}`}
                  style={{ paddingRight: '44px' }}
                />
                <button type="button" onClick={() => setShowPassword((p) => !p)} aria-label="Toggle password visibility" style={eyeBtn}>
                  <EyeIcon open={showPassword} />
                </button>
              </div>
              {/* Strength meter */}
              {formData.password && !fieldErrors.password && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '7px' }}>
                  <div style={{ flex: 1, height: '2px', background: 'var(--border-strong)' }}>
                    <div style={{
                      width: strength.width, height: '100%',
                      background: strength.color,
                      transition: 'width 200ms, background 200ms',
                    }} />
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '10px',
                    color: strength.color, letterSpacing: '0.08em', flexShrink: 0,
                  }}>{strength.label}</span>
                </div>
              )}
              {fieldErrors.password && <div style={errStyle}>{fieldErrors.password}</div>}
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="reg-confirm" style={labelStyle(fieldErrors.confirmPassword)}>Confirm Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="reg-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={formData.confirmPassword}
                  onChange={(e) => handleFieldChange('confirmPassword', e.target.value)}
                  required
                  className={`auth-field${fieldErrors.confirmPassword ? ' auth-field-err' : ''}`}
                  style={{ paddingRight: '44px' }}
                />
                <button type="button" onClick={() => setShowConfirm((p) => !p)} aria-label="Toggle confirm visibility" style={eyeBtn}>
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
              {fieldErrors.confirmPassword && <div style={errStyle}>{fieldErrors.confirmPassword}</div>}
            </div>

            {/* Terms */}
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ position: 'relative', marginTop: '1px' }}>
                  <input
                    id="terms"
                    type="checkbox"
                    checked={formData.terms}
                    onChange={(e) => handleFieldChange('terms', e.target.checked)}
                    style={{ position: 'absolute', opacity: 0, width: '16px', height: '16px', cursor: 'pointer', zIndex: 1 }}
                  />
                  <div style={{
                    width: '16px', height: '16px',
                    background: formData.terms ? 'var(--accent)' : 'var(--bg-surface-2)',
                    border: `1px solid ${formData.terms ? 'var(--accent)' : fieldErrors.terms ? 'var(--sev-serious-dim)' : 'var(--border-default)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {formData.terms && (
                      <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="var(--bg-base)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </div>
                </div>
                <label htmlFor="terms" style={{
                  fontFamily: 'var(--font-mono)', fontSize: '10px',
                  color: 'var(--fg-3)', lineHeight: 1.6, cursor: 'pointer',
                }}>
                  I agree to the{' '}
                  <Link href="#terms" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Terms of Service</Link>
                  {' '}and{' '}
                  <Link href="#privacy" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Privacy Policy</Link>
                </label>
              </div>
              {fieldErrors.terms && <div style={{ ...errStyle, marginTop: '6px' }}>{fieldErrors.terms}</div>}
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
                  Creating account…
                </span>
              ) : 'Create Account →'}
            </button>
          </form>

          {/* Footer links */}
          <div style={{
            marginTop: '24px', paddingTop: '20px',
            borderTop: '1px solid var(--border-hairline)',
            display: 'flex', flexDirection: 'column', gap: '10px',
          }}>
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
              Already have access?{' '}
              <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                Sign in →
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
        @media (max-width: 768px) { .auth-side { display: none !important; } }
      `}</style>
    </div>
  );
}

/* ── small helpers ───────────────────────────────────── */
function labelStyle(hasError) {
  return {
    display: 'block',
    fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    color: hasError ? 'var(--sev-serious)' : 'var(--fg-3)',
    marginBottom: '7px',
  };
}

const errStyle = {
  fontFamily: 'var(--font-mono)', fontSize: '10px',
  color: 'var(--sev-serious)', marginTop: '5px',
};

const hintStyle = {
  fontFamily: 'var(--font-mono)', fontSize: '10px',
  color: 'var(--fg-4)', marginTop: '5px',
};

const eyeBtn = {
  position: 'absolute', right: 0, top: 0, bottom: 0, width: '44px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-4)',
};

function EyeIcon({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18m-3.5-3.5A10.5 10.5 0 0 1 12 19c-6 0-10-7-10-7a19.2 19.2 0 0 1 5.2-5.6M9.9 5.3A9.8 9.8 0 0 1 12 5c6 0 10 7 10 7a19 19 0 0 1-2.6 3.6M14.1 14.1a3 3 0 0 1-4.2-4.2" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    </svg>
  );
}
