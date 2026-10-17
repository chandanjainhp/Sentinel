'use client';

/**
 * Example: wiring the mark into a login page.
 * Keep YOUR existing form fields, validation and API call — only the
 * `phase` -> `state` wiring below is the point.
 *
 * idle     -> steady amber dot (after the draw-on finishes)
 * auth     -> warning (amber pulse) while the request is in flight
 * success  -> healthy (green dot + ping), then redirect
 * error    -> critical (red) for ~1s, then back to idle
 */

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import SentinelMark, { type SentinelState } from './SentinelMark';

type Phase = 'idle' | 'auth' | 'success' | 'error';

const PHASE_TO_STATE: Record<Phase, SentinelState> = {
  idle: 'idle',
  auth: 'warning',
  success: 'healthy',
  error: 'critical',
};

// Replace with your real login call (should throw or return false on failure).
async function login(email: string, password: string): Promise<boolean> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.ok;
}

export default function LoginExample() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError('');
    setPhase('auth');

    try {
      const ok = await login(String(data.get('email')), String(data.get('password')));
      if (!ok) throw new Error('Wrong email or password.');
      setPhase('success');
      setTimeout(() => router.push('/dashboard'), 700); // long enough to see the ping
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in. Try again.');
      setPhase('error');
      setTimeout(() => setPhase('idle'), 1000);
    }
  }

  return (
    <main
      style={{
        minHeight: '100svh',
        display: 'grid',
        placeItems: 'center',
        background: '#07090D',
        color: '#E9EDF2',
        padding: 24,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{ width: '100%', maxWidth: 340, display: 'grid', gap: 14, justifyItems: 'stretch' }}
      >
        <div style={{ display: 'grid', placeItems: 'center', marginBottom: 12 }}>
          <SentinelMark boot size={88} state={PHASE_TO_STATE[phase]} />
        </div>

        <input name="email" type="email" placeholder="Email" required autoComplete="email" />
        <input name="password" type="password" placeholder="Password" required autoComplete="current-password" />
        <button type="submit" disabled={phase === 'auth' || phase === 'success'}>
          {phase === 'auth' ? 'Signing in' : 'Sign in'}
        </button>

        <p role="alert" style={{ minHeight: '1.5em', color: '#F0544F', fontSize: 13 }}>
          {error}
        </p>
      </form>
    </main>
  );
}
