'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { resetPassword } from '@/lib/api';
import { initTheme } from '@/lib/theme';

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const otp = params.get('otp') || '';
  const email = params.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ password: '', confirmPassword: '' });
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => { initTheme(); }, []);

  const mutation = useMutation({
    mutationFn: (newPassword) => resetPassword(otp, newPassword),
    onSuccess: () => {
      setServerError('');
      setSuccess(true);
      setTimeout(() => {
        router.push('/login?message=Password%20reset%20successfully');
      }, 1500);
    },
    onError: (error) => {
      setSuccess(false);
      setServerError(error?.message || 'Failed to reset password. The code might be expired.');
    },
  });

  const validateForm = () => {
    const errors = { password: '', confirmPassword: '' };
    if (!password) errors.password = 'Password is required.';
    else if (password.length < 8) errors.password = 'Min 8 characters required.';
    else if (!/[A-Z]/.test(password)) errors.password = 'Must include an uppercase letter.';
    else if (!/[0-9]/.test(password)) errors.password = 'Must include a number.';
    
    if (!confirmPassword) errors.confirmPassword = 'Confirm password is required.';
    else if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match.';
    
    setFieldErrors(errors);
    return !errors.password && !errors.confirmPassword;
  };

  const handleFieldChange = (field, value) => {
    if (field === 'password') setPassword(value);
    if (field === 'confirmPassword') setConfirmPassword(value);
    setFieldErrors((prev) => ({ ...prev, [field]: '' }));
    if (serverError) setServerError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSuccess(false);
    mutation.mutate(password);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        
        {/* Header */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--fg-4)', marginBottom: '10px',
          }}>Recovery</div>
          <h1 style={{
            fontFamily: 'var(--font-sans)', fontSize: '30px', fontWeight: 500,
            lineHeight: 1.05, letterSpacing: '-0.02em',
            color: 'var(--fg-1)', margin: '0 0 8px',
          }}>New Password</h1>
          <p style={{
            fontFamily: 'var(--font-sans)', fontSize: '13px',
            color: 'var(--fg-3)', lineHeight: 1.5, margin: 0,
          }}>Create a new password for {email || 'your account'}.</p>
        </div>

        {/* Server error */}
        {serverError && (
          <div style={{
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
        {success && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 14px', marginBottom: '20px',
            background: 'var(--sev-harmless-bg)',
            border: '1px solid var(--sev-harmless-dim)',
          }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--success-text)' }}>Password reset successfully — redirecting…</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          <div>
            <label htmlFor="reset-password" style={labelStyle(fieldErrors.password)}>New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="reset-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => handleFieldChange('password', e.target.value)}
                required
                className={`auth-field${fieldErrors.password ? ' auth-field-err' : ''}`}
                style={{ paddingRight: '44px' }}
              />
              <button type="button" onClick={() => setShowPassword((p) => !p)} aria-label="Toggle password visibility" style={eyeBtn}>
                <EyeIcon open={showPassword} />
              </button>
            </div>
            {fieldErrors.password && <div style={errStyle}>{fieldErrors.password}</div>}
          </div>

          <div>
            <label htmlFor="reset-confirm" style={labelStyle(fieldErrors.confirmPassword)}>Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="reset-confirm"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
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

          <button
            type="submit"
            disabled={mutation.isPending || success}
            className="auth-submit"
            style={{ marginTop: '4px' }}
          >
            {mutation.isPending ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span className="auth-spinner" />
                Resetting…
              </span>
            ) : 'Reset Password →'}
          </button>
        </form>

        {/* Footer links */}
        <div style={{
          marginTop: '28px', paddingTop: '20px',
          borderTop: '1px solid var(--border-hairline)',
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px',
            color: 'var(--fg-4)', letterSpacing: '0.06em',
          }}>
            <Link href="/login" style={{ color: 'var(--fg-4)', textDecoration: 'none' }}>
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>

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
      `}</style>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg-base)' }} />}>
      <ResetPasswordInner />
    </Suspense>
  );
}

/* ── helpers ─────────────────────────────────────────── */
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
