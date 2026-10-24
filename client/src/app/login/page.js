'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { loginUser } from '@/lib/api';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import SentinelMark, { SentinelLockup } from '@/components/brand/SentinelMark';
import { initTheme } from '@/lib/theme';
import { useAuthStore } from '@/store/authStore';
import AuthShell, {
  AuthAlert,
  AuthFooterLink,
  OrDivider,
} from '@/components/shared/AuthShell';
import FormField from '@/components/shared/FormField';
import PasswordInput from '@/components/shared/PasswordInput';
import SubmitButton from '@/components/shared/SubmitButton';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SYSTEM_FEATURES = [
  {
    label: 'Sensor Watch',
    desc: 'Sensors stream machine readings overnight; Sentinel scores every reading with predictive models.',
  },
  {
    label: 'AI Investigation',
    desc: 'Argus correlates events, investigates anomalies, and classifies each incident before morning.',
  },
  {
    label: 'Morning Briefing',
    desc: 'Review structured findings, approve the briefing, and act before the next shift starts.',
  },
];

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '' });
  const [serverError, setServerError] = useState('');
  const [loginSuccess, setLoginSuccess] = useState(false);

  // Mark state machine for the boot/auth animation above the form.
  const [markPhase, setMarkPhase] = useState('idle');
  const MARK_STATE = {
    idle: 'idle',
    auth: 'warning',
    success: 'healthy',
    error: 'critical',
  };

  useEffect(() => {
    initTheme();
    if (reason === 'session_ended') {
      setServerError('Your session has ended. Please log in again.');
    } else if (reason === 'expired') {
      setServerError('Your session has expired. Please log in again.');
    }
  }, [reason]);

  const mutation = useMutation({
    mutationFn: ({ email, password }) => loginUser(email, password),
    onMutate: () => setMarkPhase('auth'),
    onSuccess: async (data) => {
      setServerError('');

      if (data?.user?.isActive === false) {
        setServerError('__disabled__');
        setMarkPhase('error');
        setTimeout(() => setMarkPhase('idle'), 1000);
        return;
      }

      setLoginSuccess(true);
      setMarkPhase('success');
      if (data?.user) {
        localStorage.setItem('ridgeway_user', JSON.stringify(data.user));
        useAuthStore.getState().setUser(data.user);
      }
      document.cookie = 'ridgeway_auth=1; path=/; max-age=86400; SameSite=Lax';

      // Let the healthy ping land before navigating (~500ms).
      setTimeout(() => router.replace('/overview'), 500);
    },
    onError: (error) => {
      setLoginSuccess(false);
      setMarkPhase('error');
      setTimeout(() => setMarkPhase('idle'), 1000);
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('suspend') || error?.code === 'ORG_SUSPENDED') {
        setServerError('__suspended__');
      } else if (
        error?.type === 'NETWORK_ERROR' ||
        msg.includes('network error')
      ) {
        setServerError(
          'Connection lost. Check your network and try again.',
        );
      } else if (
        msg.includes('invalid') &&
        (msg.includes('credential') || msg.includes('email') || msg.includes('password'))
      ) {
        setServerError('Incorrect email or password.');
      } else {
        setServerError(error?.message || 'Unable to sign in. Please try again.');
      }
    },
  });

  const validateForm = () => {
    const errors = { email: '', password: '' };
    if (!formData.email.trim()) errors.email = 'Email is required.';
    else if (!emailPattern.test(formData.email))
      errors.email = 'Enter a valid email address.';
    if (!formData.password) errors.password = 'Password is required.';
    else if (formData.password.length < 8)
      errors.password = 'Min 8 characters required.';
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
    <AuthShell
      asideChildren={
        <>
          {/* Logo */}
          <div className="mb-10">
            <SentinelLockup markSize={22} fontSize={13} />
          </div>

          <div className="mb-7 mt-7 h-px bg-[var(--border-default)]" />

          {/* How it works */}
          <div className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-4)]">
            How It Works
          </div>

          <div className="flex flex-col">
            {SYSTEM_FEATURES.map((f, i) => (
              <div
                key={f.label}
                className="grid grid-cols-[8px_1fr] items-start gap-[10px] border-t border-[var(--border-hairline)] py-[10px] first:border-t-0"
              >
                <span
                  aria-hidden="true"
                  className="mt-[3px] inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--dim)]"
                />
                <div>
                  <div className="mb-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--fg-2)]">
                    {f.label}
                  </div>
                  <div className="text-[11px] leading-[1.5] text-[var(--fg-3)]">
                    {f.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-auto pt-8 font-mono text-[10px] tracking-[0.06em] text-[var(--fg-4)]">
            v0.1 · restricted system
          </div>
        </>
      }
      footerChildren={
        <div className="flex flex-col gap-[10px]">
          <AuthFooterLink href="/forgot-password">
            Forgot your password?
          </AuthFooterLink>
          <AuthFooterLink href="/docs">Documentation</AuthFooterLink>
          <div className="font-mono text-[10px] tracking-[0.06em] text-[var(--fg-4)]">
            No account?{' '}
            <Link
              href="/register"
              className="text-[var(--accent)] no-underline hover:underline focus-visible:outline-none"
            >
              Request access →
            </Link>
          </div>
        </div>
      }
    >
      {/* Sentinel mark — fixed 96px box so nothing shifts when state changes */}
      <div className="mx-auto mb-7 flex h-24 w-24 items-center justify-center">
        <SentinelMark boot size={88} state={MARK_STATE[markPhase]} />
      </div>

      {/* Header */}
      <div className="mb-9">
        <div className="mb-[10px] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-4)]">
          Project Access
        </div>
        <h1 className="m-0 mb-2 font-sans text-[30px] font-medium leading-[1.05] tracking-[-0.02em] text-[var(--fg-1)]">
          Sign in
        </h1>
        <p className="m-0 text-[13px] leading-[1.5] text-[var(--fg-3)]">
          Enter your credentials to access the platform.
        </p>
      </div>

      {/* Account disabled banner */}
      {serverError === '__disabled__' && (
        <AuthAlert tone="warning">
          Your account is disabled. Contact your administrator.
        </AuthAlert>
      )}

      {/* Org suspended banner */}
      {serverError === '__suspended__' && (
        <AuthAlert tone="error">
          This site has been suspended. Contact support at support@sentinel.io.
        </AuthAlert>
      )}

      {/* Generic server error */}
      {serverError &&
        serverError !== '__disabled__' &&
        serverError !== '__suspended__' && (
          <AuthAlert tone="error">{serverError}</AuthAlert>
        )}

      {/* Success */}
      {loginSuccess && (
        <AuthAlert tone="success">Authenticated — redirecting to ops…</AuthAlert>
      )}

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-[18px]"
      >
        <FormField
          label="Email Address"
          htmlFor="login-email"
          error={fieldErrors.email}
          required
        >
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={(e) => handleFieldChange('email', e.target.value)}
            required
            placeholder="operator@example.com"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
            className="h-11 w-full px-[14px] bg-[var(--bg-surface-2)] text-[var(--fg-1)] border font-mono text-[13px] tracking-[0.02em] transition-colors rounded-none placeholder:text-[var(--fg-4)] placeholder:text-[12px] focus:outline-none focus:border-[var(--border-focus)] focus:shadow-[0_0_0_1px_var(--border-focus)]"
            style={{
              borderColor: fieldErrors.email
                ? 'var(--sev-serious-dim)'
                : 'var(--border-default)',
            }}
          />
        </FormField>

        <FormField
          label="Password"
          htmlFor="login-password"
          error={fieldErrors.password}
          required
        >
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={formData.password}
            onChange={(e) => handleFieldChange('password', e.target.value)}
            required
            placeholder="Enter your password"
            error={Boolean(fieldErrors.password)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={
              fieldErrors.password ? 'login-password-error' : undefined
            }
          />
        </FormField>

        <SubmitButton
          isLoading={mutation.isPending}
          loadingLabel="Authenticating…"
          className="mt-1"
        >
          Sign In →
        </SubmitButton>
      </form>

      <OrDivider />

      <GoogleSignInButton />
    </AuthShell>
  );
}

function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)]">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-4)]">
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
