'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { registerUser } from '@/lib/api';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import { SentinelLockup } from '@/components/brand/SentinelMark';
import { initTheme } from '@/lib/theme';
import AuthShell, {
  AuthAlert,
  AuthFooterLink,
  OrDivider,
} from '@/components/shared/AuthShell';
import FormField from '@/components/shared/FormField';
import PasswordInput from '@/components/shared/PasswordInput';
import SubmitButton from '@/components/shared/SubmitButton';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-zA-Z0-9_]+$/;

const STRENGTH_META = [
  { width: '0%', color: 'var(--dim)', label: '—' },
  { width: '25%', color: 'var(--sev-serious)', label: 'Weak' },
  { width: '50%', color: 'var(--sev-minor)', label: 'Fair' },
  { width: '75%', color: 'var(--sev-minor)', label: 'Good' },
  { width: '100%', color: 'var(--health-healthy)', label: 'Strong' },
];

function getPasswordScore(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  return s;
}

const CAPABILITIES = [
  'Argus investigation feed',
  'Work-package incident list',
  'Morning Operations Briefing',
  'Incident detail & evidence',
  'Overnight telemetry timeline',
];

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

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    terms: false,
    ageConfirmed: false,
  });
  const [fieldErrors, setFieldErrors] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    terms: '',
    ageConfirmed: '',
  });
  const [serverError, setServerError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    initTheme();
  }, []);

  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(
      () => router.push(`/opt?email=${encodeURIComponent(formData.email)}`),
      1500,
    );
    return () => clearTimeout(t);
  }, [router, successMessage, formData.email]);

  const mutation = useMutation({
    mutationFn: ({ username, email, password, ageConfirmed }) =>
      registerUser({ username, email, password, ageConfirmed }),
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
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('exists')) {
        setServerError('An account with that email already exists.');
      } else if (error?.type === 'NETWORK_ERROR') {
        setServerError('Connection lost. Check your network and try again.');
      } else if (error?.type === 'VALIDATION_ERROR') {
        setServerError('Some fields are invalid. Please review and try again.');
      } else {
        setServerError(
          error?.message || 'Unable to create account. Please try again.',
        );
      }
    },
  });

  const validateForm = () => {
    const errors = {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      terms: '',
      ageConfirmed: '',
    };
    if (!formData.username.trim()) errors.username = 'Username is required.';
    else if (formData.username.length < 3)
      errors.username = 'Min 3 characters.';
    else if (formData.username.length > 20)
      errors.username = 'Max 20 characters.';
    else if (!usernamePattern.test(formData.username))
      errors.username = 'Letters, numbers, underscores only.';
    if (!formData.email.trim()) errors.email = 'Email is required.';
    else if (!emailPattern.test(formData.email))
      errors.email = 'Enter a valid email address.';
    if (!formData.password) errors.password = 'Password is required.';
    else if (formData.password.length < 8)
      errors.password = 'Min 8 characters required.';
    else if (!/[A-Z]/.test(formData.password))
      errors.password = 'Must include an uppercase letter.';
    else if (!/[0-9]/.test(formData.password))
      errors.password = 'Must include a number.';
    if (!formData.confirmPassword)
      errors.confirmPassword = 'Confirm password is required.';
    else if (formData.confirmPassword !== formData.password)
      errors.confirmPassword = 'Passwords do not match.';
    if (!formData.terms)
      errors.terms = 'You must agree to the terms to continue.';
    if (!formData.ageConfirmed)
      errors.ageConfirmed = 'You must be 13 or older to create an account.';
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
    mutation.mutate({
      username: formData.username,
      email: formData.email,
      password: formData.password,
      ageConfirmed: formData.ageConfirmed,
    });
  };

  const strength = STRENGTH_META[getPasswordScore(formData.password)];

  return (
    <AuthShell
      asideChildren={
        <>
          <div className="mb-10">
            <SentinelLockup markSize={22} fontSize={13} />
            <div className="mt-2 pl-[2px] font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-4)]">
              6:10 Assistant
            </div>
          </div>

          <div className="mb-8">
            <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-4)]">
              Clearance Request
            </div>
            <p className="m-0 font-sans text-[13px] leading-[1.6] text-[var(--fg-2)]">
              This is a restricted access system. Your account will be linked
              to the Sentinel operations team.
            </p>
          </div>

          <div className="mb-7 h-px bg-[var(--border-default)]" />

          <div className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-4)]">
            Capabilities Granted
          </div>
          <div className="mb-8 flex flex-col gap-[10px]">
            {CAPABILITIES.map((cap) => (
              <div key={cap} className="flex items-center gap-[10px]">
                <span
                  aria-hidden="true"
                  className="inline-block h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--accent-dim)]"
                />
                <span className="font-sans text-[12px] text-[var(--fg-2)]">
                  {cap}
                </span>
              </div>
            ))}
          </div>

          <div className="mb-6 h-px bg-[var(--border-default)]" />

          <div className="flex items-start gap-[10px]">
            <span
              aria-hidden="true"
              className="mt-[3px] inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--sev-minor)]"
            />
            <div className="font-mono text-[10px] leading-[1.6] text-[var(--fg-4)]">
              All access requests are reviewed and authorized by the site
              operations lead.
            </div>
          </div>

          <div className="mt-auto pt-8 font-mono text-[10px] tracking-[0.06em] text-[var(--fg-4)]">
            v0.1 · restricted system
          </div>
        </>
      }
      footerChildren={
        <div className="flex flex-col gap-[10px]">
          <AuthFooterLink href="/docs">Documentation</AuthFooterLink>
          <div className="font-mono text-[10px] tracking-[0.06em] text-[var(--fg-4)]">
            Already have access?{' '}
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
      <div className="mb-8">
        <div className="mb-[10px] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-4)]">
          New Project User
        </div>
        <h1 className="m-0 mb-2 font-sans text-[30px] font-medium leading-[1.05] tracking-[-0.02em] text-[var(--fg-1)]">
          Create account
        </h1>
        <p className="m-0 text-[13px] leading-[1.5] text-[var(--fg-3)]">
          Request access to the Sentinel platform.
        </p>
      </div>

      {serverError && <AuthAlert tone="error">{serverError}</AuthAlert>}

      {successMessage && (
        <AuthAlert tone="success">
          Account created — redirecting to verification…
        </AuthAlert>
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        <FormField
          label="Username"
          htmlFor="reg-username"
          error={fieldErrors.username}
          required
          hint="3–20 chars · letters, numbers, underscores"
        >
          <input
            id="reg-username"
            type="text"
            autoComplete="username"
            value={formData.username}
            onChange={(e) => handleFieldChange('username', e.target.value)}
            required
            placeholder="ops_lead"
            aria-invalid={Boolean(fieldErrors.username)}
            className={fieldClass(Boolean(fieldErrors.username))}
          />
        </FormField>

        <FormField
          label="Email Address"
          htmlFor="reg-email"
          error={fieldErrors.email}
          required
        >
          <input
            id="reg-email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={(e) => handleFieldChange('email', e.target.value)}
            required
            placeholder="operator@example.com"
            aria-invalid={Boolean(fieldErrors.email)}
            className={fieldClass(Boolean(fieldErrors.email))}
          />
        </FormField>

        <FormField
          label="Password"
          htmlFor="reg-password"
          error={fieldErrors.password}
          required
          hint="Min 8 characters · one uppercase · one number"
        >
          <PasswordInput
            id="reg-password"
            autoComplete="new-password"
            value={formData.password}
            onChange={(e) => handleFieldChange('password', e.target.value)}
            required
            placeholder="Create a password"
            error={Boolean(fieldErrors.password)}
            aria-invalid={Boolean(fieldErrors.password)}
          />
          {/* Strength meter */}
          {formData.password && !fieldErrors.password && (
            <div className="mt-[7px] flex items-center gap-[10px]">
              <div className="h-[2px] flex-1 bg-[var(--border-strong)]">
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: strength.width,
                    background: strength.color,
                  }}
                />
              </div>
              <span
                className="shrink-0 font-mono text-[10px] tracking-[0.08em]"
                style={{ color: strength.color }}
              >
                {strength.label}
              </span>
            </div>
          )}
        </FormField>

        <FormField
          label="Confirm Password"
          htmlFor="reg-confirm"
          error={fieldErrors.confirmPassword}
          required
        >
          <PasswordInput
            id="reg-confirm"
            autoComplete="new-password"
            value={formData.confirmPassword}
            onChange={(e) => handleFieldChange('confirmPassword', e.target.value)}
            required
            placeholder="Re-enter your password"
            error={Boolean(fieldErrors.confirmPassword)}
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
          />
        </FormField>

        {/* Terms checkbox */}
        <CheckboxField
          id="terms"
          checked={formData.terms}
          onChange={(v) => handleFieldChange('terms', v)}
          error={fieldErrors.terms}
          label={
            <>
              I agree to the{' '}
              <Link
                href="#terms"
                className="text-[var(--accent)] no-underline hover:underline"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="#privacy"
                className="text-[var(--accent)] no-underline hover:underline"
              >
                Privacy Policy
              </Link>
            </>
          }
        />

        {/* Age gate */}
        <CheckboxField
          id="age-confirm"
          checked={formData.ageConfirmed}
          onChange={(v) => handleFieldChange('ageConfirmed', v)}
          error={fieldErrors.ageConfirmed}
          label="I confirm I am 13 years of age or older"
        />

        <SubmitButton
          isLoading={mutation.isPending}
          loadingLabel="Creating account…"
          className="mt-1"
        >
          Create Account →
        </SubmitButton>
      </form>

      <OrDivider />

      <GoogleSignInButton ageConfirmed={formData.ageConfirmed} />
    </AuthShell>
  );
}

/* Local helper — checkbox row with proper a11y + error.
   Could be promoted to a shared component later if reused. */
function CheckboxField({ id, checked, onChange, error, label }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex items-start gap-[10px]">
        <div className="relative mt-[1px]">
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="absolute h-4 w-4 cursor-pointer opacity-0 z-[1]"
          />
          <div
            aria-hidden="true"
            className="flex h-4 w-4 shrink-0 items-center justify-center border"
            style={{
              background: checked
                ? 'var(--accent)'
                : 'var(--bg-surface-2)',
              borderColor: checked
                ? 'var(--accent)'
                : error
                ? 'var(--sev-serious-dim)'
                : 'var(--border-default)',
            }}
          >
            {checked && (
              <svg
                viewBox="0 0 12 12"
                width="9"
                height="9"
                fill="none"
                stroke="var(--bg-base)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 6l3 3 5-5" />
              </svg>
            )}
          </div>
        </div>
        <label
          htmlFor={id}
          className="cursor-pointer font-mono text-[10px] leading-[1.6] text-[var(--fg-3)]"
        >
          {label}
        </label>
      </div>
      {error && (
        <p
          role="alert"
          className="font-mono text-[10px] text-[var(--sev-serious)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
