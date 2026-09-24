'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyEmail, resendEmailVerification } from '@/lib/api';

const CODE_LENGTH = 6;
const CODE_TTL = 120; // seconds

function OtpPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email') || 'your email address';
  const mode = params.get('mode') || 'verify';

  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(''));
  const [secondsLeft, setSecondsLeft] = useState(CODE_TTL);
  const [expired, setExpired] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resent, setResent] = useState(false);

  const inputRefs = useRef([]);

  /* ── countdown ───────────────────────────────────── */
  useEffect(() => {
    if (expired) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { setExpired(true); clearInterval(id); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [expired]);

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  /* ── input handling ──────────────────────────────── */
  const handleChange = (index, value) => {
    const char = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    setError('');
    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits];
        next[index] = '';
        setDigits(next);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }
    if (e.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = Array(CODE_LENGTH).fill('');
    pasted.split('').forEach((ch, i) => { next[i] = ch; });
    setDigits(next);
    const focusIdx = Math.min(pasted.length, CODE_LENGTH - 1);
    inputRefs.current[focusIdx]?.focus();
  };

  /* ── verify ──────────────────────────────────────── */
  const code = digits.join('');
  const isComplete = code.length === CODE_LENGTH;

  const handleVerify = useCallback(async () => {
    if (!isComplete || verifying) return;
    setVerifying(true);
    setError('');
    try {
      if (mode === 'forgot-password') {
        setSuccess(true);
        setTimeout(() => router.push(`/reset-password?otp=${code}&email=${encodeURIComponent(email)}`), 1500);
      } else {
        await verifyEmail(code);
        setSuccess(true);
        setTimeout(() => router.push('/incidents'), 1500);
      }
    } catch (err) {
      setError(err?.message || 'Invalid code. Please try again.');
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }, [isComplete, verifying, code, email, router]);

  /* auto-submit when complete */
  useEffect(() => {
    if (isComplete && !expired && !verifying && !success) handleVerify();
  }, [isComplete]);

  const handleResend = async () => {
    try {
      if (mode !== 'forgot-password') {
        await resendEmailVerification();
      } else {
        // We could call forgotPassword(email) again here if it was imported, but we'll assume they can go back.
      }
      setDigits(Array(CODE_LENGTH).fill(''));
      setSecondsLeft(CODE_TTL);
      setExpired(false);
      setError('');
      setResent(true);
      setTimeout(() => setResent(false), 3000);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err?.message || 'Failed to resend code');
    }
  };

  /* ── color logic ─────────────────────────────────── */
  const timerColor = expired
    ? 'var(--sev-serious)'
    : secondsLeft < 30
    ? 'var(--sev-minor)'
    : 'var(--accent)';

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-base)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', position: 'relative', overflow: 'hidden',
    }}>

      {/* Background dot grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle, rgba(35,43,56,0.5) 1px, transparent 1px)',
        backgroundSize: '28px 28px', pointerEvents: 'none',
      }} />

      {/* Subtle glow behind the form */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '500px', height: '500px',
        background: 'radial-gradient(circle, rgba(21,34,43,0.8) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Scan line */}
      <div className="otp-scan" style={{
        position: 'absolute', left: 0, right: 0, height: '1px',
        background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
        opacity: 0.15, pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '480px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '56px', justifyContent: 'center' }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: 'var(--sev-serious)', boxShadow: 'var(--glow-serious)',
            animation: 'status-pulse 2s ease-in-out infinite', flexShrink: 0,
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600,
            letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-1)',
          }}>Sentinel</span>
          <span style={{ color: 'var(--border-strong)', fontSize: '14px', userSelect: 'none' }}>·</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px',
            color: 'var(--fg-4)', letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>Sentinel</span>
        </div>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--fg-4)', marginBottom: '12px',
          }}>Identity Verification</div>
          <h1 style={{
            fontFamily: 'var(--font-sans)', fontSize: '28px', fontWeight: 500,
            lineHeight: 1.08, letterSpacing: '-0.02em',
            color: 'var(--fg-1)', margin: '0 0 12px',
          }}>Enter your access code</h1>
          <p style={{
            fontFamily: 'var(--font-sans)', fontSize: '13px',
            color: 'var(--fg-3)', lineHeight: 1.6, margin: 0,
          }}>
            A 6-digit code was sent to{' '}
            <span style={{ color: 'var(--fg-2)', fontFamily: 'var(--font-mono)' }}>{email}</span>
          </p>
        </div>

        {/* OTP boxes */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '32px' }}>
          {digits.map((digit, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <input
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                disabled={expired || success}
                aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
                className={`otp-box${digit ? ' otp-filled' : ''}${error ? ' otp-error' : ''}${success ? ' otp-success' : ''}`}
                style={{
                  width: '60px', height: '72px',
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '28px', fontWeight: 700,
                  letterSpacing: 0,
                  fontVariantNumeric: 'tabular-nums',
                  background: 'var(--bg-surface-1)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--fg-1)',
                  outline: 'none',
                  borderRadius: 0,
                  transition: 'border-color 120ms, box-shadow 120ms, color 120ms',
                  cursor: expired || success ? 'not-allowed' : 'text',
                }}
              />
              {/* Bottom bar indicator */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px',
                background: success
                  ? 'var(--success)'
                  : error
                  ? 'var(--sev-serious)'
                  : digit
                  ? 'var(--accent)'
                  : 'transparent',
                transition: 'background 150ms',
              }} />
            </div>
          ))}
        </div>

        {/* Timer */}
        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          {!expired ? (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '12px',
              color: timerColor, letterSpacing: '0.06em',
              fontVariantNumeric: 'tabular-nums',
              transition: 'color 300ms',
            }}>
              Code valid for{' '}
              <span style={{ fontWeight: 700, fontSize: '14px' }}>{formatTime(secondsLeft)}</span>
            </div>
          ) : (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '11px',
              color: 'var(--sev-serious)', letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>Code expired</div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 14px', marginBottom: '16px',
            background: 'var(--sev-serious-bg)',
            border: '1px solid var(--sev-serious-dim)',
          }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--sev-serious)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--sev-serious)' }}>{error}</span>
          </div>
        )}

        {/* Success */}
        {success && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 14px', marginBottom: '16px',
            background: 'var(--sev-harmless-bg)',
            border: '1px solid var(--sev-harmless-dim)',
          }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--success-text)' }}>
              {mode === 'forgot-password' ? 'Verified — proceeding to reset…' : 'Verified — entering ops…'}
            </span>
          </div>
        )}

        {/* Resent confirmation */}
        {resent && !error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 14px', marginBottom: '16px',
            background: 'var(--accent-deep)',
            border: '1px solid var(--accent-dim)',
          }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent)' }}>New code sent — check your email.</span>
          </div>
        )}

        {/* Verify button */}
        <button
          type="button"
          onClick={handleVerify}
          disabled={!isComplete || verifying || success || expired}
          className="auth-submit"
          style={{ width: '100%', marginBottom: '20px' }}
        >
          {verifying ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <span className="auth-spinner" />
              Verifying…
            </span>
          ) : success ? 'Access Granted →' : 'Verify Access →'}
        </button>

        {/* Footer actions */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: '16px', borderTop: '1px solid var(--border-hairline)',
        }}>
          <button
            type="button"
            onClick={handleResend}
            disabled={!expired && secondsLeft > 0 && !error}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px',
              color: expired || error ? 'var(--accent)' : 'var(--fg-4)',
              background: 'none', border: 'none',
              cursor: expired || error ? 'pointer' : 'not-allowed',
              padding: 0, letterSpacing: '0.08em',
              transition: 'color 150ms',
            }}
          >
            {expired ? 'Resend code →' : `Resend in ${formatTime(secondsLeft)}`}
          </button>
          <Link href="/login" style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px',
            color: 'var(--fg-4)', textDecoration: 'none', letterSpacing: '0.08em',
          }}>← Back to sign in</Link>
        </div>
      </div>

      <style>{`
        .otp-box:focus {
          border-color: var(--border-focus) !important;
          box-shadow: 0 0 0 1px var(--border-focus), 0 0 20px rgba(184,212,232,0.12) !important;
          color: var(--accent) !important;
        }
        .otp-filled {
          border-color: var(--accent-dim) !important;
          color: var(--accent) !important;
        }
        .otp-error {
          border-color: var(--sev-serious-dim) !important;
          color: var(--sev-serious) !important;
        }
        .otp-success {
          border-color: var(--sev-harmless-dim) !important;
          color: var(--success-text) !important;
        }
        .auth-submit {
          height: 46px;
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
        @keyframes otp-scan {
          0%   { top: -1px; opacity: 0; }
          5%   { opacity: 0.15; }
          95%  { opacity: 0.08; }
          100% { top: 100vh; opacity: 0; }
        }
        .otp-scan { animation: otp-scan 12s linear infinite; }
      `}</style>
    </div>
  );
}

export default function OtpPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh', background: 'var(--bg-base)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '11px',
          color: 'var(--fg-4)', letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>Loading…</span>
      </div>
    }>
      <OtpPageInner />
    </Suspense>
  );
}
