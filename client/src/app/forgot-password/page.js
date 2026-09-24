'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { forgotPassword } from '@/lib/api';
import { initTheme } from '@/lib/theme';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => { initTheme(); }, []);

  const mutation = useMutation({
    mutationFn: (email) => forgotPassword(email),
    onSuccess: () => {
      setServerError('');
      setSuccess(true);
      setTimeout(() => {
        router.push(`/opt?mode=forgot-password&email=${encodeURIComponent(email)}`);
      }, 1500);
    },
    onError: (error) => {
      setSuccess(false);
      setServerError(error?.message || 'Failed to send reset link. Please try again.');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email is required.');
      return;
    } else if (!emailPattern.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setServerError('');
    setSuccess(false);
    mutation.mutate(email);
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
          }}>Forgot Password</h1>
          <p style={{
            fontFamily: 'var(--font-sans)', fontSize: '13px',
            color: 'var(--fg-3)', lineHeight: 1.5, margin: 0,
          }}>Enter your email address and we will send you a code to reset your password.</p>
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
        {success && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 14px', marginBottom: '20px',
            background: 'var(--sev-harmless-bg)',
            border: '1px solid var(--sev-harmless-dim)',
          }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--success-text)' }}>Reset code sent — redirecting…</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label htmlFor="forgot-email" style={{
              display: 'block',
              fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: error ? 'var(--sev-serious)' : 'var(--fg-3)',
              marginBottom: '7px',
            }}>Email Address</label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
                setServerError('');
              }}
              required
              placeholder="operator@example.com"
              className={`auth-field${error ? ' auth-field-err' : ''}`}
            />
            {error && (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '10px',
                color: 'var(--sev-serious)', marginTop: '5px',
              }}>{error}</div>
            )}
          </div>

          <button
            type="submit"
            disabled={mutation.isPending || success}
            aria-busy={mutation.isPending}
            className="auth-submit"
            style={{ marginTop: '4px' }}
          >
            {mutation.isPending ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span className="auth-spinner" />
                Sending…
              </span>
            ) : 'Send Reset Code →'}
          </button>
        </form>

        {/* Footer links */}
        <div style={{
          marginTop: '28px', paddingTop: '20px',
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
            Remember your password?{' '}
            <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              Sign in →
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
      `}</style>
    </div>
  );
}
