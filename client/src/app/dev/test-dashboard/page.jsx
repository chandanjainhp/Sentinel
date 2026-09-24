'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

const MONO = 'var(--font-mono)';

// Guard: never show in production builds
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  throw new Error('Test dashboard must not be accessible in production.');
}

/* ── helpers ──────────────────────────────────────────── */
function toISODate(d = new Date()) {
  return d.toISOString().split('T')[0];
}

function Label({ children }) {
  return (
    <span style={{
      fontFamily: MONO, fontSize: '10px', fontWeight: 600,
      letterSpacing: '0.14em', textTransform: 'uppercase',
      color: 'var(--fg-3)',
    }}>{children}</span>
  );
}

function Card({ title, children }) {
  return (
    <div style={{
      background: 'var(--bg-surface-1)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-sm, 4px)',
      overflow: 'hidden',
      marginBottom: '16px',
    }}>
      <div style={{
        padding: '8px 14px',
        borderBottom: '1px solid var(--border-hairline)',
        background: 'var(--bg-surface-2)',
      }}>
        <Label>{title}</Label>
      </div>
      <div style={{ padding: '16px' }}>{children}</div>
    </div>
  );
}

function Btn({ onClick, disabled, danger, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 16px',
        fontFamily: MONO, fontSize: '11px', fontWeight: 600,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        background: danger ? 'rgba(255,56,56,0.12)' : 'var(--accent)',
        color: danger ? 'var(--sev-serious)' : 'var(--bg-base)',
        border: danger ? '1px solid rgba(255,56,56,0.3)' : 'none',
        borderRadius: '2px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 120ms',
        marginRight: '8px',
      }}
    >{children}</button>
  );
}

function Pre({ value }) {
  return (
    <pre style={{
      fontFamily: MONO, fontSize: '11px', color: 'var(--fg-2)',
      background: 'var(--bg-base)', padding: '12px',
      borderRadius: '2px', overflow: 'auto',
      maxHeight: '260px', margin: '10px 0 0 0',
      border: '1px solid var(--border-hairline)',
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>{value ? JSON.stringify(value, null, 2) : '—'}</pre>
  );
}

/* ── main component ───────────────────────────────────── */
export default function TestDashboard() {
  const [step, setStep] = useState(null); // seeded | triggered | polling | done
  const [events, setEvents] = useState(null);
  const [investigation, setInvestigation] = useState(null);
  const [statusPoll, setStatusPoll] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [cleanupResult, setCleanupResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(null);
  const [count, setCount] = useState(8);
  const [nightDate, setNightDate] = useState(toISODate());
  const pollRef = useRef(null);

  const clearPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => () => clearPoll(), []);

  const call = async (fn, loadingKey) => {
    setError(null);
    setLoading(loadingKey);
    try {
      const result = await fn();
      return result;
    } catch (e) {
      setError(e?.message || String(e));
      return null;
    } finally {
      setLoading(null);
    }
  };

  async function seedEvents() {
    const data = await call(
      () => api.post('/test/seed-events', { count, nightDate }),
      'seed'
    );
    if (data) { setEvents(data); setStep('seeded'); }
  }

  async function triggerInvestigation() {
    const data = await call(
      () => api.post('/test/trigger-investigation', { nightDate }),
      'trigger'
    );
    if (data) {
      setInvestigation(data);
      setStep('triggered');
      startPolling(data.jobId);
    }
  }

  function startPolling(jobId) {
    if (!jobId) return;
    setStep('polling');
    clearPoll();
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.get(`/test/investigation-status/${jobId}`);
        setStatusPoll(data);
        if (data?.status === 'complete' || data?.status === 'failed') {
          clearPoll();
          setStep('done');
        }
      } catch (e) {
        clearPoll();
      }
    }, 4000);
  }

  async function fetchBriefing() {
    const data = await call(() => api.get('/test/briefing'), 'briefing');
    if (data) setBriefing(data);
  }

  async function cleanup() {
    if (!window.confirm(`Delete ALL test data for ${nightDate}? This cannot be undone.`)) return;
    const data = await call(
      () => api.post('/test/cleanup', { nightDate }),
      'cleanup'
    );
    if (data) {
      setCleanupResult(data);
      setEvents(null); setInvestigation(null); setStatusPoll(null); setBriefing(null);
      setStep(null);
    }
  }

  const jobId = investigation?.jobId;
  const isPolling = step === 'polling';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      color: 'var(--fg-1)',
      padding: '32px',
      fontFamily: 'var(--font-sans)',
    }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '4px 10px', marginBottom: '12px',
          background: 'rgba(255,56,56,0.08)',
          border: '1px solid rgba(255,56,56,0.25)',
          borderRadius: '2px',
        }}>
          <span style={{
            fontFamily: MONO, fontSize: '10px', fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--sev-serious)',
          }}>⚠ Dev only — Test dashboard</span>
        </div>
        <h1 style={{
          fontFamily: MONO, fontSize: '20px', fontWeight: 700,
          color: 'var(--fg-1)', margin: '0 0 6px',
          letterSpacing: '-0.01em',
        }}>Sentinel — Agentic Loop Test Suite</h1>
        <p style={{ fontSize: '13px', color: 'var(--fg-3)', margin: 0 }}>
          Generate events → trigger investigation → watch Argus → view briefing
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: '16px',
          background: 'var(--sev-serious-bg)',
          border: '1px solid rgba(255,56,56,0.25)',
          borderRadius: '2px',
          fontFamily: MONO, fontSize: '12px', color: 'var(--sev-serious)',
        }}>
          ✗ {error}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
        gap: '16px',
        alignItems: 'start',
      }}>

        {/* STEP 1 */}
        <Card title="Step 1 — Generate events">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div>
              <Label>Night date</Label>
              <br />
              <input
                type="date"
                value={nightDate}
                onChange={(e) => setNightDate(e.target.value)}
                style={{
                  marginTop: '4px',
                  fontFamily: MONO, fontSize: '12px',
                  background: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--fg-1)',
                  padding: '5px 8px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              />
            </div>
            <div>
              <Label>Count</Label>
              <br />
              <input
                type="number"
                min={1} max={50}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                style={{
                  marginTop: '4px', width: '60px',
                  fontFamily: MONO, fontSize: '12px',
                  background: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--fg-1)',
                  padding: '5px 8px',
                  outline: 'none',
                }}
              />
            </div>
          </div>
          <Btn onClick={seedEvents} disabled={loading === 'seed'}>
            {loading === 'seed' ? 'Generating…' : 'Generate events →'}
          </Btn>
          {events && <Pre value={{ message: events.message, count: events.count, events: events.events?.slice(0, 3) }} />}
        </Card>

        {/* STEP 2 */}
        <Card title="Step 2 — Trigger investigation">
          <p style={{ fontSize: '12px', color: 'var(--fg-3)', margin: '0 0 12px' }}>
            Dispatches a BullMQ job. Argus runs the ReAct loop over your events.
          </p>
          <Btn
            onClick={triggerInvestigation}
            disabled={!events || loading === 'trigger'}
          >
            {loading === 'trigger' ? 'Starting…' : 'Start investigation →'}
          </Btn>
          {investigation && <Pre value={{ jobIds: investigation.jobIds, status: investigation.status, streamUrl: investigation.streamUrl }} />}
        </Card>

        {/* STEP 3 */}
        <Card title="Step 3 — Monitor progress">
          <p style={{ fontSize: '12px', color: 'var(--fg-3)', margin: '0 0 12px' }}>
            {isPolling
              ? `Polling every 4s — job: ${jobId ?? '—'}`
              : 'Auto-polls once investigation starts.'}
          </p>
          {isPolling && (
            <Btn onClick={clearPoll} danger>Stop polling</Btn>
          )}
          {jobId && !isPolling && (
            <Btn onClick={() => startPolling(jobId)}>Resume polling</Btn>
          )}
          {statusPoll && (
            <Pre value={statusPoll} />
          )}
          {jobId && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--fg-4)' }}>
              SSE stream:{' '}
              <Link
                href={`/api/v1/investigations/${jobId}/stream`}
                target="_blank"
                style={{ color: 'var(--accent)', textDecoration: 'none' }}
              >
                /investigations/{jobId}/stream ↗
              </Link>
            </div>
          )}
        </Card>

        {/* STEP 4 */}
        <Card title="Step 4 — View briefing">
          <p style={{ fontSize: '12px', color: 'var(--fg-3)', margin: '0 0 12px' }}>
            Fetch briefing generated by Argus after investigation completes.
          </p>
          <Btn onClick={fetchBriefing} disabled={loading === 'briefing'}>
            {loading === 'briefing' ? 'Loading…' : 'Fetch briefing →'}
          </Btn>
          {' '}
          {briefing?.briefing?.status === 'draft' && (
            <Link href="/briefing" style={{
              fontFamily: MONO, fontSize: '11px', color: 'var(--accent)', textDecoration: 'none',
            }}>
              Review on /briefing ↗
            </Link>
          )}
          {briefing && <Pre value={{ id: briefing.briefing?._id, status: briefing.briefing?.status, nightDate: briefing.briefing?.nightDate }} />}
        </Card>

        {/* CLEANUP */}
        <Card title="Cleanup">
          <p style={{ fontSize: '12px', color: 'var(--fg-3)', margin: '0 0 12px' }}>
            Delete all events, incidents, investigations, and briefings for the selected night.
            Requires confirmation.
          </p>
          <Btn onClick={cleanup} disabled={loading === 'cleanup'} danger>
            {loading === 'cleanup' ? 'Deleting…' : `Cleanup ${nightDate} →`}
          </Btn>
          {cleanupResult && <Pre value={cleanupResult.deleted} />}
        </Card>

        {/* Manual curl instructions */}
        <Card title="Manual curl (copy & run)">
          <p style={{ fontSize: '12px', color: 'var(--fg-3)', margin: '0 0 10px' }}>
            Get your JWT from DevTools → Application → Cookies → ridgeway_token
          </p>
          <pre style={{
            fontFamily: MONO, fontSize: '11px', color: 'var(--fg-2)',
            background: 'var(--bg-base)', padding: '12px',
            borderRadius: '2px', margin: 0,
            border: '1px solid var(--border-hairline)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{`TOKEN=<your_jwt_here>

# 1. Seed events
curl -X POST http://localhost:8000/api/v1/test/seed-events \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"count": ${count}, "nightDate": "${nightDate}"}'

# 2. Trigger investigation
curl -X POST http://localhost:8000/api/v1/test/trigger-investigation \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"nightDate": "${nightDate}"}'

# 3. Poll status (replace JOB_ID)
curl http://localhost:8000/api/v1/test/investigation-status/JOB_ID \\
  -H "Authorization: Bearer $TOKEN"

# 4. Get briefing
curl http://localhost:8000/api/v1/test/briefing \\
  -H "Authorization: Bearer $TOKEN"

# 5. Cleanup
curl -X POST http://localhost:8000/api/v1/test/cleanup \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"nightDate": "${nightDate}"}'`}</pre>
        </Card>

      </div>
    </div>
  );
}
