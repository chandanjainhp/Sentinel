'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { forgotPassword } from '@/lib/api';
import { initTheme } from '@/lib/theme';
import AuthShell, { AuthAlert, AuthFooterLink } from '@/components/shared/AuthShell';
import FormField from '@/components/shared/FormField';
import SubmitButton from '@/components/shared/SubmitButton';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    initTheme();
  }, []);

  const mutation = useMutation({
    mutationFn: (emailArg) => forgotPassword(emailArg),
    onSuccess: () => {
      setServerError('');
      setSuccess(true);
      setTimeout(() => {
        router.push(`/opt?mode=forgot-password&email=${encodeURIComponent(email)}`);
      }, 1500);
    },
    onError: (error) => {
      setSuccess(false);
      const msg = (error?.message || '').toLowerCase();
      if (error?.type === 'NETWORK_ERROR' || msg.includes('network')) {
        setServerError('Connection lost. Check your network and try again.');
      } else if (msg.includes('not found') || msg.includes('no account')) {
        // For privacy, we do NOT leak that the email isn't registered.
        // The server may decide to return success either way; if it does
        // surface a not-found, surface a generic message instead.
        setServerError('If an account exists for that email, a reset code is on its way.');
      } else {
        setServerError(
          error?.message || 'Failed to send reset link. Please try again.',
        );
      }
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

  const fieldClass = (hasError) =>
    [
      'h-11 w-full px-[14px] bg-[var(--bg-surface-2)] text-[var(--fg-1)]',
      'border font-mono text-[13px] tracking-[0.02em] transition-colors rounded-none',
      'placeholder:text-[var(--fg-4)] placeholder:text-[12px]',
      'focus:outline-none focus:border-[var(--border-focus)] focus:shadow-[0_0_0_1px_var(--border-focus)]',
      hasError
        ? 'border-[var(--sev-serious-dim)] focus:border-[var(--sev-serious)] focus:shadow-[0_0_0_1px_var(--sev-serious)]'
        : 'border-[var(--border-default)]',
    ].join(' ');

  return (
    <AuthShell
      footerChildren={
        <div className="flex flex-col gap-[10px]">
          <AuthFooterLink href="/docs">Documentation</AuthFooterLink>
          <div className="font-mono text-[10px] tracking-[0.06em] text-[var(--fg-4)]">
            Remember your password?{' '}
            <Link
              href="/login"
              className="text-[var(--accent)] no-underline hover:underline focus-visible:outline-none"
            >
              Sign in →
            </Link>
          </div>
        </div>
      }
    >
      {/* Header */}
      <div className="mb-9">
        <div className="mb-[10px] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-4)]">
          Recovery
        </div>
        <h1 className="m-0 mb-2 font-sans text-[30px] font-medium leading-[1.05] tracking-[-0.02em] text-[var(--fg-1)]">
          Forgot Password
        </h1>
        <p className="m-0 text-[13px] leading-[1.5] text-[var(--fg-3)]">
          Enter your email address and we will send you a code to reset your
          password.
        </p>
      </div>

      {serverError && <AuthAlert tone="error">{serverError}</AuthAlert>}

      {success && (
        <AuthAlert tone="success">Reset code sent — redirecting…</AuthAlert>
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-[18px]"
      >
        <FormField
          label="Email Address"
          htmlFor="forgot-email"
          error={error}
          required
        >
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
              if (serverError) setServerError('');
            }}
            required
            placeholder="operator@example.com"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'forgot-email-error' : undefined}
            className={fieldClass(Boolean(error))}
          />
        </FormField>

        <SubmitButton
          isLoading={mutation.isPending}
          disabled={mutation.isPending || success}
          loadingLabel="Sending…"
          className="mt-1"
        >
          Send Reset Code →
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
