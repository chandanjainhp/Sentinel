'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { resetPassword } from '@/lib/api';
import { initTheme } from '@/lib/theme';
import AuthShell, { AuthAlert } from '@/components/shared/AuthShell';
import FormField from '@/components/shared/FormField';
import PasswordInput from '@/components/shared/PasswordInput';
import SubmitButton from '@/components/shared/SubmitButton';

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const otp = params.get('otp') || '';
  const email = params.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({
    password: '',
    confirmPassword: '',
  });
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    initTheme();
  }, []);

  const mutation = useMutation({
    mutationFn: (newPassword) => resetPassword(otp, newPassword),
    onSuccess: () => {
      setServerError('');
      setSuccess(true);
      setTimeout(() => {
        router.push('/login?reason=expired');
      }, 1500);
    },
    onError: (error) => {
      setSuccess(false);
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('expired') || msg.includes('invalid')) {
        setServerError('The reset link is invalid or has expired. Request a new code.');
      } else if (error?.type === 'NETWORK_ERROR') {
        setServerError('Connection lost. Check your network and try again.');
      } else {
        setServerError(
          error?.message || 'Failed to reset password. The code might be expired.',
        );
      }
    },
  });

  const validateForm = () => {
    const errors = { password: '', confirmPassword: '' };
    if (!password) errors.password = 'Password is required.';
    else if (password.length < 8)
      errors.password = 'Min 8 characters required.';
    else if (!/[A-Z]/.test(password))
      errors.password = 'Must include an uppercase letter.';
    else if (!/[0-9]/.test(password))
      errors.password = 'Must include a number.';
    if (!confirmPassword)
      errors.confirmPassword = 'Confirm password is required.';
    else if (confirmPassword !== password)
      errors.confirmPassword = 'Passwords do not match.';
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
    <AuthShell
      footerChildren={
        <div className="font-mono text-[10px] tracking-[0.06em] text-[var(--fg-4)]">
          <Link
            href="/login"
            className="text-[var(--fg-4)] no-underline hover:text-[var(--fg-2)] focus-visible:outline-none"
          >
            ← Back to sign in
          </Link>
        </div>
      }
    >
      {/* Header */}
      <div className="mb-9">
        <div className="mb-[10px] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-4)]">
          Recovery
        </div>
        <h1 className="m-0 mb-2 font-sans text-[30px] font-medium leading-[1.05] tracking-[-0.02em] text-[var(--fg-1)]">
          New Password
        </h1>
        <p className="m-0 text-[13px] leading-[1.5] text-[var(--fg-3)]">
          Create a new password for {email || 'your account'}.
        </p>
      </div>

      {serverError && <AuthAlert tone="error">{serverError}</AuthAlert>}

      {success && (
        <AuthAlert tone="success">
          Password reset successfully — redirecting…
        </AuthAlert>
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-[18px]"
      >
        <FormField
          label="New Password"
          htmlFor="reset-password"
          error={fieldErrors.password}
          required
          hint="Min 8 characters · one uppercase · one number"
        >
          <PasswordInput
            id="reset-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => handleFieldChange('password', e.target.value)}
            required
            placeholder="Create a new password"
            error={Boolean(fieldErrors.password)}
            aria-invalid={Boolean(fieldErrors.password)}
          />
        </FormField>

        <FormField
          label="Confirm Password"
          htmlFor="reset-confirm"
          error={fieldErrors.confirmPassword}
          required
        >
          <PasswordInput
            id="reset-confirm"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => handleFieldChange('confirmPassword', e.target.value)}
            required
            placeholder="Re-enter your new password"
            error={Boolean(fieldErrors.confirmPassword)}
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
          />
        </FormField>

        <SubmitButton
          isLoading={mutation.isPending}
          disabled={mutation.isPending || success}
          loadingLabel="Resetting…"
          className="mt-1"
        >
          Reset Password →
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

function ResetFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)]">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-4)]">
        Loading…
      </span>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetFallback />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
