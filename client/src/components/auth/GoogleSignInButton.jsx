'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { googleSignIn } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

/**
 * Google Identity Services (GIS) sign-in button.
 *
 * Loads the official GIS client (https://accounts.google.com/gsi/client) and
 * renders Google's own button via `google.accounts.id.renderButton`. The GIS
 * callback hands us a Google ID token (credential), which is sent to
 * POST /api/v1/auth/google. The backend verifies the token against
 * GOOGLE_CLIENT_ID and establishes the same httpOnly-cookie JWT session as
 * normal email/password login. No client secret ever reaches the client.
 *
 * Renders nothing when NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset (except a dev-only
 * hint), so unconfigured deployments keep a clean login page.
 *
 * Unattended browsers are covered by `auto_select`, and `cancel_on_tap_outside`
 * avoids surprise One Tap popups.
 */
const GIS_SRC = 'https://accounts.google.com/gsi/client';

export default function GoogleSignInButton({ onSuccess }) {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const btnRef = useRef(null);
  const pendingRef = useRef(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const enabled = Boolean(clientId);

  const finishSignIn = useCallback(
    (data) => {
      if (data?.user) {
        localStorage.setItem('ridgeway_user', JSON.stringify(data.user));
        setUser(data.user);
      }
      document.cookie = 'ridgeway_auth=1; path=/; max-age=86400; SameSite=Lax';
      router.replace('/overview');
      // Optional per-caller hook (e.g. register page success banner).
      onSuccess?.(data);
    },
    [router, setUser, onSuccess],
  );

  const handleCredential = useCallback(
    async (response) => {
      const credential = response?.credential;
      if (!credential || pendingRef.current) return; // duplicate-submit guard
      pendingRef.current = true;
      setSubmitting(true);
      setError('');
      try {
        const data = await googleSignIn(credential);
        finishSignIn(data);
      } catch (err) {
        // Network failures get a friendlier message from the shared API layer;
        // backend errors (409 conflict, 401 audience/unverified email) surface
        // their own user-safe messages — token internals are never exposed.
        setError(err?.message || 'Google sign-in failed. Please try again.');
        setSubmitting(false);
      } finally {
        pendingRef.current = false;
      }
    },
    [finishSignIn],
  );

  useEffect(() => {
    if (!scriptReady || !enabled || !btnRef.current) return;

    const google = window.google;
    if (!google?.accounts?.id) return;

    let cancelled = false;
    try {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => {
          if (!cancelled) handleCredential(resp);
        },
        auto_select: true,
        cancel_on_tap_outside: true,
      });
      google.accounts.id.renderButton(btnRef.current, {
        theme: 'outline',
        size: 'large',
        width: Math.min(380, btnRef.current?.parentElement?.clientWidth || 380),
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
      });
    } catch {
      setError('Google sign-in could not be initialized.');
    }

    return () => {
      cancelled = true;
    };
  }, [scriptReady, enabled, clientId, handleCredential]);

  if (!enabled) {
    if (process.env.NODE_ENV === 'production') return null;
    return (
      <div
        style={{
          marginTop: '8px',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--fg-4)',
          letterSpacing: '0.06em',
        }}
      >
        Google sign-in disabled — set NEXT_PUBLIC_GOOGLE_CLIENT_ID (see README → Google Login Setup).
      </div>
    );
  }

  return (
    <div style={{ marginTop: '4px', position: 'relative' }}>
      <Script
        src={GIS_SRC}
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() => setError('Could not load Google sign-in. Check your network.')}
      />

      <div
        ref={btnRef}
        aria-label="Continue with Google"
        style={{
          position: 'relative',
          minHeight: '46px',
          width: '100%',
          opacity: submitting ? 0.55 : 1,
          pointerEvents: submitting ? 'none' : 'auto',
          filter: 'invert(1) hue-rotate(180deg)',
          borderRadius: 0,
        }}
      />

      {submitting && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: '4px',
            left: 0,
            right: 0,
            height: '46px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-base)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--fg-2)',
            zIndex: 5,
          }}
        >
          <span className="auth-spinner" />
          <span style={{ marginLeft: '8px' }}>Verifying with Google…</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            marginTop: '12px',
            background: 'var(--sev-serious-bg)',
            border: '1px solid var(--sev-serious-dim)',
          }}
        >
          <span
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: 'var(--sev-serious)',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--sev-serious)',
            }}
          >
            {error}
          </span>
        </div>
      )}
    </div>
  );
}
