'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyEmail, resendEmailVerification } from '@/lib/api';
import AuthShell, { AuthAlert } from '@/components/shared/AuthShell';
import SubmitButton from '@/components/shared/SubmitButton';
import { cn } from '@/lib/cn';

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
        if (s <= 1) {
          setExpired(true);
          clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [expired]);

  const formatTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

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
    if (e.key === 'ArrowLeft' && index > 0)
      inputRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1)
      inputRefs.current[index + 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = Array(CODE_LENGTH).fill('');
    pasted.split('').forEach((ch, i) => {
      next[i] = ch;
    });
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
        setTimeout(
          () =>
            router.push(
              `/reset-password?otp=${code}&email=${encodeURIComponent(email)}`,
            ),
          1500,
        );
      } else {
        await verifyEmail(code);
        setSuccess(true);
        setTimeout(() => router.push('/overview'), 1500);
      }
    } catch (err) {
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('expired')) {
        setError('This code has expired. Request a new one below.');
      } else if (msg.includes('invalid')) {
        setError('That code is invalid. Try again or request a new one.');
      } else if (err?.type === 'NETWORK_ERROR') {
        setError('Connection lost. Check your network and try again.');
      } else {
        setError(err?.message || 'Invalid code. Please try again.');
      }
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }, [isComplete, verifying, code, email, router, mode]);

  /* auto-submit when complete */
  useEffect(() => {
    if (isComplete && !expired && !verifying && !success) handleVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete]);

  const handleResend = async () => {
    try {
      if (mode !== 'forgot-password') {
        await resendEmailVerification();
      }
      setDigits(Array(CODE_LENGTH).fill(''));
      setSecondsLeft(CODE_TTL);
      setExpired(false);
      setError('');
      setResent(true);
      setTimeout(() => setResent(false), 3000);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err?.message || 'Failed to resend code.');
    }
  };

  /* ── color logic ─────────────────────────────────── */
  const timerColor = expired
    ? 'var(--sev-serious)'
    : secondsLeft < 30
    ? 'var(--sev-minor)'
    : 'var(--accent)';

  return (
    <AuthShell>
      {/* Header */}
      <div className="mb-12 text-center">
        <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-4)]">
          Identity Verification
        </div>
        <h1 className="m-0 mb-3 font-sans text-[28px] font-medium leading-[1.08] tracking-[-0.02em] text-[var(--fg-1)]">
          Enter your access code
        </h1>
        <p className="m-0 text-[13px] leading-[1.6] text-[var(--fg-3)]">
          A 6-digit code was sent to{' '}
          <span className="font-mono text-[var(--fg-2)]">{email}</span>
        </p>
      </div>

      {/* OTP boxes — scale down on narrow viewports so 6 digits fit.
          60px × 6 + 10px × 5 gaps = 410px; min viewport is 375px. */}
      <div
        role="group"
        aria-label="6-digit access code"
        className="mb-8 flex justify-center gap-[6px] sm:gap-[10px]"
      >
        {digits.map((digit, i) => (
          <div key={i} className="relative">
            <input
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              disabled={expired || success}
              aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
              className={cn(
                'h-[60px] w-[44px] text-center font-mono text-[24px] font-bold',
                'tabular-nums outline-none transition-colors',
                'bg-[var(--bg-surface-1)] border rounded-none',
                'focus:border-[var(--border-focus)] focus:shadow-[0_0_0_1px_var(--border-focus)]',
                'disabled:cursor-not-allowed',
                'sm:h-[72px] sm:w-[60px] sm:text-[28px]',
                success
                  ? 'border-[var(--sev-harmless-dim)] text-[var(--success-text)]'
                  : error
                  ? 'border-[var(--sev-serious-dim)] text-[var(--sev-serious)]'
                  : digit
                  ? 'border-[var(--accent-dim)] text-[var(--accent)]'
                  : 'border-[var(--border-default)] text-[var(--fg-1)]',
              )}
            />
            {/* Bottom bar indicator */}
            <div
              aria-hidden="true"
              className="absolute bottom-0 left-0 right-0 h-[2px] transition-colors"
              style={{
                background: success
                  ? 'var(--success)'
                  : error
                  ? 'var(--sev-serious)'
                  : digit
                  ? 'var(--accent)'
                  : 'transparent',
              }}
            />
          </div>
        ))}
      </div>

      {/* Timer */}
      <div className="mb-3 text-center">
        {!expired ? (
          <div
            className="font-mono text-[12px] tabular-nums transition-colors"
            style={{ color: timerColor }}
          >
            Code valid for{' '}
            <span className="text-[14px] font-bold">{formatTime(secondsLeft)}</span>
          </div>
        ) : (
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sev-serious)]">
            Code expired
          </div>
        )}
      </div>

      {error && <AuthAlert tone="error">{error}</AuthAlert>}

      {success && (
        <AuthAlert tone="success">
          {mode === 'forgot-password'
            ? 'Verified — proceeding to reset…'
            : 'Verified — entering ops…'}
        </AuthAlert>
      )}

      {resent && !error && (
        <AuthAlert tone="warning">New code sent — check your email.</AuthAlert>
      )}

      {/* Verify button */}
      <SubmitButton
        isLoading={verifying}
        disabled={!isComplete || verifying || success || expired}
        loadingLabel="Verifying…"
        onClick={handleVerify}
        type="button"
        className="mb-5"
      >
        {success ? 'Access Granted →' : 'Verify Access →'}
      </SubmitButton>

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-[var(--border-hairline)] pt-4">
        <button
          type="button"
          onClick={handleResend}
          disabled={!expired && secondsLeft > 0 && !error}
          className={cn(
            'font-mono text-[10px] tracking-[0.08em] transition-colors',
            'bg-transparent border-none p-0 focus-visible:outline-none',
            expired || error
              ? 'cursor-pointer text-[var(--accent)]'
              : 'cursor-not-allowed text-[var(--fg-4)]',
          )}
        >
          {expired ? 'Resend code →' : `Resend in ${formatTime(secondsLeft)}`}
        </button>
        <Link
          href="/login"
          className="font-mono text-[10px] tracking-[0.08em] text-[var(--fg-4)] no-underline hover:text-[var(--fg-2)] focus-visible:outline-none"
        >
          ← Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}

function OtpFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)]">
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--fg-4)]">
        Loading…
      </span>
    </div>
  );
}

export default function OtpPage() {
  return (
    <Suspense fallback={<OtpFallback />}>
      <OtpPageInner />
    </Suspense>
  );
}
