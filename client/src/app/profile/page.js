'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getCurrentUser, changePassword } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import PageContainer from '@/components/layout/PageContainer';
import LoadingState from '@/components/shared/LoadingState';
import ErrorState from '@/components/shared/ErrorState';
import FormField from '@/components/shared/FormField';
import PasswordInput from '@/components/shared/PasswordInput';
import SubmitButton from '@/components/shared/SubmitButton';
import { AuthAlert } from '@/components/shared/AuthShell';
import { cn } from '@/lib/cn';

function getInitials(user) {
  if (!user) return '?';
  const name = user.username || user.email || '';
  if (user.username) return user.username.slice(0, 2).toUpperCase();
  const parts = name.split('@');
  return parts[0].slice(0, 2).toUpperCase();
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const STRENGTH_LEVELS = [
  { label: '—', color: 'var(--dim)' },
  { label: 'Weak', color: 'var(--sev-serious)' },
  { label: 'Fair', color: 'var(--sev-minor)' },
  { label: 'Good', color: 'var(--sev-minor)' },
  { label: 'Strong', color: 'var(--health-healthy)' },
  { label: 'Strong', color: 'var(--health-healthy)' },
];

function getStrengthScore(pw) {
  if (!pw) return 0;
  let s = 1; // Any non-empty password is at least "Weak"
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 5);
}

function StrengthMeter({ password }) {
  const score = getStrengthScore(password);
  const level = STRENGTH_LEVELS[score];
  return (
    <div>
      <div className="flex gap-1 mb-[5px]">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[2px] flex-1 transition-colors duration-200"
            style={{
              background: i < score ? level.color : 'var(--border-default)',
            }}
          />
        ))}
      </div>
      <div
        className="font-mono text-[10px] tracking-[0.08em]"
        style={{ color: level.color }}
      >
        {level.label}
      </div>
    </div>
  );
}

function SectionHeader({ label, index }) {
  return (
    <div className="mb-3 flex items-baseline gap-4 border-b border-[var(--border-hairline)] pb-3">
      {index && (
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
          {index}
        </span>
      )}
      <h2 className="m-0 font-sans text-[15px] font-semibold uppercase tracking-[0.12em] text-[var(--fg-1)]">
        {label}
      </h2>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { logout } = useAuth();

  // Seed from localStorage immediately to avoid flash
  const [localUser, setLocalUser] = useState(null);
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ridgeway_user');
      if (stored) setLocalUser(JSON.parse(stored));
    } catch {
      /* noop */
    }
  }, []);

  const {
    data: fetchedUser,
    isLoading: userLoading,
    isError: userError,
    refetch,
  } = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
    retry: false,
    onError: () => router.push('/login'),
  });

  // Merge: remote data wins if available
  const user = fetchedUser || localUser;
  const showLoadingSkeleton = userLoading && !localUser;
  const showError = userError && !localUser;

  // ── Password change form ──────────────────────────────
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [pwSuccess, setPwSuccess] = useState(false);

  const pwMutation = useMutation({
    mutationFn: () =>
      changePassword({
        currentPassword: pwForm.current,
        newPassword: pwForm.next,
      }),
    onSuccess: () => {
      setPwSuccess(true);
      setPwForm({ current: '', next: '', confirm: '' });
      setTimeout(() => setPwSuccess(false), 4000);
    },
    onError: (err) => {
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('incorrect') || msg.includes('invalid')) {
        setPwErrors({
          current: 'Current password is incorrect.',
          server: '',
        });
      } else if (msg.includes('same') || msg.includes('must be different')) {
        setPwErrors({
          next: 'New password must be different from your current password.',
          server: '',
        });
      } else if (err?.type === 'NETWORK_ERROR') {
        setPwErrors({
          server: 'Connection lost. Check your network and try again.',
        });
      } else {
        setPwErrors({ server: err?.message || 'Password change failed.' });
      }
    },
  });

  function validatePw() {
    const errs = {};
    if (!pwForm.current) errs.current = 'Current password is required.';
    if (!pwForm.next) errs.next = 'New password is required.';
    else if (pwForm.next.length < 8)
      errs.next = 'Min 8 characters required.';
    else if (!/[A-Z]/.test(pwForm.next))
      errs.next = 'Must include an uppercase letter.';
    else if (!/[0-9]/.test(pwForm.next))
      errs.next = 'Must include a number.';
    if (!pwForm.confirm)
      errs.confirm = 'Please confirm your new password.';
    else if (pwForm.confirm !== pwForm.next)
      errs.confirm = 'Passwords do not match.';
    setPwErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handlePwChange(field, val) {
    setPwForm((p) => ({ ...p, [field]: val }));
    setPwErrors((p) => ({ ...p, [field]: '', server: '' }));
    if (pwSuccess) setPwSuccess(false);
  }

  function handlePwSubmit(e) {
    e.preventDefault();
    if (!validatePw()) return;
    pwMutation.mutate();
  }

  function handleSignOut() {
    // Use the shared useAuth hook so the toast + redirect happens consistently.
    logout();
  }

  const initials = getInitials(user);
  const displayName = user?.username || user?.email?.split('@')[0] || '—';
  const email = user?.email || '—';
  const joinedAt = formatDate(user?.createdAt);

  return (
    <PageContainer>
      {/* ── Page header ── */}
      <header className="mb-10">
        <div className="mb-[10px] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-4)]">
          Account
        </div>
        <h1 className="m-0 mb-2 font-sans text-[28px] font-medium leading-[1.05] tracking-[-0.02em] text-[var(--fg-1)]">
          Your Profile
        </h1>
        <p className="m-0 text-[13px] leading-[1.5] text-[var(--fg-3)]">
          Manage your operator credentials and security settings.
        </p>
      </header>

      {/* ── Identity card (replaces the old 300px left aside) ── */}
      {showLoadingSkeleton ? (
        <div className="mb-10">
          <LoadingState variant="skeleton" rows={2} label="Loading profile…" />
        </div>
      ) : showError ? (
        <div className="mb-10">
          <ErrorState
            title="Could not load your profile"
            error={new Error('Failed to fetch user data.')}
            onRetry={() => refetch()}
          />
        </div>
      ) : (
        <section className="mb-10">
          <div className="flex items-center gap-5 border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-6 sm:flex-row flex-col sm:text-left text-center">
            {/* Avatar */}
            <div
              aria-hidden="true"
              className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--accent-deep)] font-mono text-[22px] font-bold tracking-[-0.02em] text-[var(--accent)] select-none"
            >
              {initials}
            </div>
            {/* Identity */}
            <div className="min-w-0 flex-1">
              <div className="mb-1 font-sans text-[18px] font-medium tracking-[-0.01em] text-[var(--fg-1)]">
                {displayName}
              </div>
              <div className="font-mono text-[12px] text-[var(--fg-3)] break-all">
                {email}
              </div>
              {user?.createdAt && (
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--fg-4)]">
                  Member since {joinedAt}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Section: Account Information ── */}
      <section className="mb-10">
        <SectionHeader label="Account Information" index="01" />
        <div className="border border-[var(--border-default)] bg-[var(--bg-surface-1)]">
          {[
            { label: 'Username', value: user?.username || '—' },
            { label: 'Email Address', value: email },
            { label: 'Account Created', value: joinedAt },
          ].map((row, i, arr) => (
            <div
              key={row.label}
              className={cn(
                'grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2 sm:gap-4 sm:items-center',
                'px-5 py-[14px]',
                i < arr.length - 1 && 'border-b border-[var(--border-hairline)]',
              )}
            >
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--fg-4)]">
                {row.label}
              </span>
              <span className="font-mono text-[12px] text-[var(--fg-2)] break-all">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section: Change Password ── */}
      <section className="mb-10">
        <SectionHeader label="Change Password" index="02" />

        {pwErrors.server && (
          <AuthAlert tone="error">{pwErrors.server}</AuthAlert>
        )}

        {pwSuccess && (
          <AuthAlert tone="success">Password updated successfully.</AuthAlert>
        )}

        <form
          onSubmit={handlePwSubmit}
          noValidate
          className="flex flex-col gap-[18px]"
        >
          <FormField
            label="Current Password"
            htmlFor="pw-current"
            error={pwErrors.current}
            required
          >
            <PasswordInput
              id="pw-current"
              autoComplete="current-password"
              value={pwForm.current}
              onChange={(e) => handlePwChange('current', e.target.value)}
              required
              placeholder="Enter your current password"
              error={Boolean(pwErrors.current)}
              aria-invalid={Boolean(pwErrors.current)}
              aria-describedby={
                pwErrors.current ? 'pw-current-error' : undefined
              }
            />
          </FormField>

          <FormField
            label="New Password"
            htmlFor="pw-next"
            error={pwErrors.next}
            required
            hint="Min 8 characters · one uppercase · one number"
          >
            <PasswordInput
              id="pw-next"
              autoComplete="new-password"
              value={pwForm.next}
              onChange={(e) => handlePwChange('next', e.target.value)}
              required
              placeholder="Create a new password"
              error={Boolean(pwErrors.next)}
              aria-invalid={Boolean(pwErrors.next)}
              aria-describedby={
                pwErrors.next ? 'pw-next-error' : undefined
              }
            />
            {pwForm.next && !pwErrors.next && (
              <div className="mt-[7px]">
                <StrengthMeter password={pwForm.next} />
              </div>
            )}
          </FormField>

          <FormField
            label="Confirm New Password"
            htmlFor="pw-confirm"
            error={pwErrors.confirm}
            required
          >
            <PasswordInput
              id="pw-confirm"
              autoComplete="new-password"
              value={pwForm.confirm}
              onChange={(e) => handlePwChange('confirm', e.target.value)}
              required
              placeholder="Re-enter your new password"
              error={Boolean(pwErrors.confirm)}
              aria-invalid={Boolean(pwErrors.confirm)}
              aria-describedby={
                pwErrors.confirm ? 'pw-confirm-error' : undefined
              }
            />
          </FormField>

          <div>
            <SubmitButton
              isLoading={pwMutation.isPending}
              loadingLabel="Updating…"
              className="w-auto px-7"
            >
              Update Password →
            </SubmitButton>
          </div>
        </form>
      </section>

      {/* ── Section: Session ── */}
      <section>
        <SectionHeader label="Session" index="03" />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border border-[var(--border-default)] bg-[var(--bg-surface-1)] px-5 py-4">
          <div>
            <div className="mb-[3px] font-mono text-[11px] font-semibold text-[var(--fg-2)]">
              Active session
            </div>
            <div className="font-mono text-[10px] text-[var(--fg-4)]">
              Authenticated via JWT · expires in 24h
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className={cn(
              'inline-flex h-9 items-center justify-center gap-2 px-4',
              'font-mono text-[10px] font-semibold uppercase tracking-[0.12em]',
              'border border-[var(--sev-serious-dim)] bg-transparent text-[var(--sev-serious)]',
              'hover:bg-[var(--sev-serious-bg)] hover:opacity-85',
              'focus-visible:outline-none',
              'transition-colors',
            )}
          >
            Sign Out
          </button>
        </div>
      </section>
    </PageContainer>
  );
}
