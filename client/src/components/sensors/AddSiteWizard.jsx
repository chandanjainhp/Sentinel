'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle, Check, ChevronRight, Copy, Loader2, Plus, Radio, X,
} from 'lucide-react';
import { createOnboarding, getMachinesForSite, listSensors } from '@/lib/api';

const MONO = 'var(--font-mono)';
const SANS = 'var(--font-sans)';

const TYPES = ['temperature', 'vibration', 'pressure', 'current', 'rpm', 'flow'];
const UNITS = { temperature: '°C', vibration: 'mm/s', pressure: 'bar', current: 'A', rpm: 'rpm', flow: 'L/min' };
const SAMPLE = { temperature: 72.4, vibration: 0.42, pressure: 6.8, current: 12.5, rpm: 1480, flow: 38.2 };
const MAX_SENSORS = 20;

const COUNTRIES = {
  IN: { name: 'India', label: 'PIN code', re: /^\d{6}$/, hint: '6 digits, e.g. 573201', optional: false },
  US: { name: 'United States', label: 'ZIP code', re: /^\d{5}(-\d{4})?$/, hint: '5 digits or ZIP+4, e.g. 94105', optional: false },
  GB: { name: 'United Kingdom', label: 'Postcode', re: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/, hint: 'e.g. SW1A 1AA', optional: false },
  DE: { name: 'Germany', label: 'Postal code (PLZ)', re: /^\d{5}$/, hint: '5 digits, e.g. 10115', optional: false },
  AE: { name: 'United Arab Emirates', label: 'Postal code (optional)', re: null, hint: 'The UAE has no postal codes, leave empty.', optional: true },
};

const EMPTY_SITE = { name: '', country: 'IN', postalCode: '', city: '' };
let sensorSeq = 0;
const blankSensor = () => ({ key: ++sensorSeq, name: '', type: 'temperature' });
const norm = (v) => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();

const PRIMARY_BTN = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
  background: 'var(--accent)', color: 'var(--bg-base)', border: '1px solid var(--accent)',
  borderRadius: '2px', fontFamily: MONO, fontSize: '11px', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer',
};
const SECONDARY_BTN = {
  ...PRIMARY_BTN, background: 'transparent', color: 'var(--fg-2)', border: '1px solid var(--border-default)',
};
const FIELD = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'var(--bg-surface-2)',
  border: '1px solid var(--border-default)', borderRadius: '2px', color: 'var(--fg-1)',
  fontFamily: SANS, fontSize: '13px', outline: 'none',
};
const LABEL = {
  display: 'block', fontFamily: MONO, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.12em', color: 'var(--fg-3)', marginBottom: '6px',
};
const ERR = { fontFamily: SANS, fontSize: '11px', color: 'var(--sev-minor)', marginTop: '6px' };
const HINT = { fontFamily: SANS, fontSize: '11px', color: 'var(--fg-3)', marginTop: '6px' };
const PANEL = {
  padding: '12px 14px', background: 'var(--bg-surface-2)',
  border: '1px solid var(--border-hairline)', borderRadius: '2px',
};

function relative(iso) {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : 'never';
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  function copy(text) {
    try { navigator.clipboard?.writeText(text).catch(() => {}); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return [copied, copy];
}

function CopyButton({ text }) {
  const [copied, copy] = useCopy();
  return (
    <button type="button" onClick={() => copy(text)} style={{ ...SECONDARY_BTN, flexShrink: 0, padding: '5px 10px', fontSize: '10px' }}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function CopyBlock({ label, text }) {
  return (
    <div style={{ ...PANEL, border: '1px solid var(--border-default)' }}>
      <div style={{ ...LABEL, marginBottom: '6px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <pre style={{
          flex: 1, margin: 0, fontFamily: MONO, fontSize: '11px', lineHeight: '16px',
          color: 'var(--fg-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {text}
        </pre>
        <CopyButton text={text} />
      </div>
    </div>
  );
}

function StepDots({ step, total }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{
          width: i + 1 === step ? '18px' : '6px', height: '6px', borderRadius: '3px',
          background: i + 1 <= step ? 'var(--accent)' : 'var(--border-strong)', transition: 'width 150ms ease',
        }} />
      ))}
      <span style={{ marginLeft: '6px', fontFamily: MONO, fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>
        {step} / {total}
      </span>
    </div>
  );
}

function Field({ label, error, hint, children }) {
  return (
    <div>
      <label style={{ display: 'block' }}>
        <span style={LABEL}>{label}</span>
        {children}
      </label>
      {error ? <div role="alert" style={ERR}>{error}</div> : hint ? <div style={HINT}>{hint}</div> : null}
    </div>
  );
}

export default function AddSiteWizard({ open, onOpenChange, sites = [] }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState('new');
  const [site, setSite] = useState(EMPTY_SITE);
  const [existingSiteId, setExistingSiteId] = useState('');
  const [machine, setMachine] = useState('');
  const [reuse, setReuse] = useState(false);
  const [sensors, setSensors] = useState(() => [blankSensor()]);
  const [tried, setTried] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [acked, setAcked] = useState(false);
  const [curlIdx, setCurlIdx] = useState(0);
  // One idempotency key per distinct payload: a retry or double click re-sends the
  // same key (so nothing is created twice), an edited payload gets a fresh key.
  const idem = useRef(null);

  const isNew = mode === 'new';
  const C = COUNTRIES[site.country];
  const existingSite = !isNew ? sites.find((s) => s.siteId === existingSiteId) : null;

  const { data: machinesData } = useQuery({
    queryKey: ['machines', existingSite?._id],
    queryFn: () => getMachinesForSite(existingSite._id),
    enabled: open && !result && Boolean(existingSite?._id),
  });
  const existingMachines = !isNew ? (machinesData || []) : [];

  const { data: liveSensors } = useQuery({
    queryKey: ['sensors'],
    queryFn: listSensors,
    enabled: open && Boolean(result),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  /* ---------- validation ---------- */
  const siteName = site.name.trim();
  const dupSite = isNew && siteName.length >= 2
    ? sites.find((s) => norm(s.name) === norm(siteName) && norm(s.city) === norm(site.city))
    : null;
  const postal = site.postalCode.trim();
  const siteErr = {};
  if (isNew) {
    if (siteName.length < 2) siteErr.name = 'Enter a site name (at least 2 characters).';
    if (!C.optional && !postal) siteErr.postal = `Enter a ${C.label.toLowerCase()}.`;
    else if (postal && C.re && !C.re.test(postal)) siteErr.postal = `Not a valid ${C.label.toLowerCase()}. Expected: ${C.hint}`;
    if (!site.city.trim()) siteErr.city = 'Enter a city.';
  } else if (!existingSiteId) {
    siteErr.existing = 'Choose a site.';
  }
  const step1Ok = Object.keys(siteErr).length === 0 && !dupSite;

  const machineName = machine.trim();
  const dupMachine = !isNew && machineName ? existingMachines.find((m) => norm(m.name) === norm(machineName)) : null;
  const reuseMachine = reuse && dupMachine ? dupMachine : null;
  const showDup = Boolean(dupMachine) && !reuseMachine;
  const machineErr = machineName.length < 2 ? 'Machine name must be at least 2 characters.' : '';
  const step2Ok = !machineErr && !showDup;

  const names = sensors.map((s) => norm(s.name));
  const sensorErrs = sensors.map((s, i) => {
    if (names[i].length < 2) return 'Name this sensor (at least 2 characters).';
    if (names.some((n, j) => j !== i && n === names[i])) return 'Another sensor on this machine already has this name.';
    return '';
  });
  const step3Ok = sensors.length > 0 && sensorErrs.every((e) => !e);

  /* ---------- actions ---------- */
  function reset() {
    setStep(1); setMode('new'); setSite(EMPTY_SITE); setExistingSiteId('');
    setMachine(''); setReuse(false); setSensors([blankSensor()]);
    setTried(false); setSubmitting(false); setError('');
    setResult(null); setAcked(false); setCurlIdx(0);
    idem.current = null;
  }

  const mustAck = Boolean(result?.secret) && !acked;

  function handleOpenChange(nextOpen) {
    if (!nextOpen) {
      if (mustAck || submitting) return; // never lose a key that is shown only once
      reset();
    }
    onOpenChange(nextOpen);
  }

  function goNext() {
    setError('');
    if (step === 1) {
      if (!step1Ok) { setTried(true); return; }
      setTried(false); setStep(2);
    } else if (step === 2) {
      if (!step2Ok) { setTried(true); return; }
      setTried(false); setStep(3);
    }
  }

  function goBack() {
    setError(''); setTried(false);
    setStep((v) => Math.max(1, v - 1));
  }

  async function submit() {
    if (submitting) return;
    if (!step3Ok) { setTried(true); return; }
    setError('');
    setSubmitting(true);
    const payload = {
      ...(isNew
        ? {
            site: {
              name: siteName, country: site.country, postalCode: postal || null, city: site.city.trim(),
              cityVerified: false, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            },
          }
        : { existingSiteId }),
      machine: reuseMachine ? { name: machineName, existingMachineId: reuseMachine.machineId } : { name: machineName },
      sensors: sensors.map(({ name, type }) => ({ name: name.trim(), type })),
    };
    const fingerprint = JSON.stringify(payload);
    if (!idem.current || idem.current.fingerprint !== fingerprint) {
      idem.current = { fingerprint, key: crypto.randomUUID() };
    }
    try {
      const data = await createOnboarding(payload, idem.current.key);
      setResult(data);
      ['sites', 'machines', 'sensors', 'sensor-summary', 'api-keys'].forEach((k) => {
        queryClient.invalidateQueries({ queryKey: [k] });
      });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not complete setup. Nothing was created twice, you can try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function updateSensor(key, field, value) {
    setSensors((items) => items.map((s) => (s.key === key ? { ...s, [field]: value } : s)));
  }

  /* ---------- derived display ---------- */
  const summarySite = isNew ? siteName : existingSite?.name;
  const summarySensors = sensors.filter((s) => s.name.trim()).map((s) => s.name.trim()).join(', ');

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000';
  const resultSensors = result?.sensors || [];
  const activeSensor = resultSensors[Math.min(curlIdx, Math.max(0, resultSensors.length - 1))];
  const curlExample = result && activeSensor
    ? [
        `curl -X POST ${origin}/api/v1/events \\`,
        '  -H "Authorization: Bearer <YOUR_API_KEY>" \\',
        '  -H "Content-Type: application/json" \\',
        `  -d '${JSON.stringify({
          siteId: result.siteId,
          machineId: result.machineId,
          sensorId: activeSensor.sensorId,
          type: 'sensor_reading',
          timestamp: new Date().toISOString(),
          values: { [activeSensor.type]: SAMPLE[activeSensor.type] ?? 1 },
        })}'`,
      ].join('\n')
    : '';

  const show = (msg) => (tried ? msg : '');

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
        <Dialog.Content style={{
          position: 'fixed', zIndex: 50, top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--bg-surface-1)', border: '1px solid var(--border-strong)',
          borderRadius: '2px', outline: 'none',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            padding: '14px 18px', borderBottom: '1px solid var(--border-default)',
          }}>
            <Dialog.Title style={{
              margin: 0, fontFamily: MONO, fontSize: '11px', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-1)',
            }}>
              {result ? 'Ready to connect' : 'Add site'}
            </Dialog.Title>
            {!result && <StepDots step={step} total={3} />}
            <button
              type="button"
              aria-label="Close"
              onClick={() => handleOpenChange(false)}
              disabled={mustAck || submitting}
              style={{
                background: 'none', border: 'none', color: 'var(--fg-3)', padding: 0, display: 'flex',
                cursor: mustAck || submitting ? 'not-allowed' : 'pointer', opacity: mustAck || submitting ? 0.3 : 1,
              }}
            >
              <X size={16} />
            </button>
            <Dialog.Description style={{ display: 'none' }}>Create a site, machine and sensors, then connect them with an API key.</Dialog.Description>
          </div>

          <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {!result && (
              <div aria-label="Live summary" style={{ ...PANEL, fontFamily: SANS, fontSize: '12px', color: 'var(--fg-2)', overflowWrap: 'anywhere' }}>
                <strong style={{ color: 'var(--fg-1)' }}>{summarySite || 'Site'}</strong>
                {' → '}
                <strong style={{ color: 'var(--fg-1)' }}>{machineName || 'Machine'}</strong>
                {' → '}
                <strong style={{ color: 'var(--fg-1)' }}>{summarySensors || 'Sensors'}</strong>
              </div>
            )}

            {/* ---------- Step 1: site ---------- */}
            {!result && step === 1 && (
              <>
                <div role="group" aria-label="Site type" style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" aria-pressed={isNew} style={isNew ? PRIMARY_BTN : SECONDARY_BTN}
                    onClick={() => { setMode('new'); setTried(false); setMachine(''); setReuse(false); }}>
                    New site
                  </button>
                  <button type="button" aria-pressed={!isNew} style={!isNew ? PRIMARY_BTN : SECONDARY_BTN}
                    onClick={() => { setMode('existing'); setTried(false); setMachine(''); setReuse(false); }}>
                    Existing site
                  </button>
                </div>

                {isNew ? (
                  <>
                    <Field
                      label="Site name"
                      error={dupSite ? `A site named “${dupSite.name}” already exists in ${dupSite.city}. Use “Existing site” to add machines to it.` : show(siteErr.name)}
                      hint="2 to 100 characters. The same name can be used again in another city."
                    >
                      <input style={FIELD} value={site.name} maxLength={100} autoFocus placeholder="e.g. Hassan Plant 1"
                        onChange={(e) => setSite({ ...site, name: e.target.value })} />
                    </Field>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                      <Field label="Country">
                        <select style={FIELD} value={site.country}
                          onChange={(e) => setSite({ ...site, country: e.target.value, postalCode: '' })}>
                          {Object.entries(COUNTRIES).map(([code, c]) => <option key={code} value={code}>{c.name}</option>)}
                        </select>
                      </Field>
                      <Field label={C.label} error={show(siteErr.postal)} hint={C.hint}>
                        <input style={FIELD} value={site.postalCode} maxLength={12}
                          onChange={(e) => setSite({ ...site, postalCode: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="City" error={show(siteErr.city)} hint="Not in a list, or code not found? Just type it.">
                      <input style={FIELD} value={site.city} maxLength={80} placeholder="e.g. Hassan"
                        onChange={(e) => setSite({ ...site, city: e.target.value })} />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Site" error={show(siteErr.existing)}>
                      <select style={FIELD} value={existingSiteId}
                        onChange={(e) => { setExistingSiteId(e.target.value); setMachine(''); setReuse(false); }}>
                        <option value="">Choose a site…</option>
                        {sites.map((s) => <option key={s.siteId} value={s.siteId}>{s.name}</option>)}
                      </select>
                    </Field>
                    <div style={{ ...PANEL, fontFamily: SANS, fontSize: '12px', color: 'var(--fg-2)' }}>
                      This site already has an API key. You won’t get a new one.
                    </div>
                  </>
                )}
              </>
            )}

            {/* ---------- Step 2: machine ---------- */}
            {!result && step === 2 && (
              <>
                <Field label="Machine name" error={show(machineErr)} hint="Use the complete name people use on the floor.">
                  <input style={FIELD} value={machine} maxLength={100} autoFocus placeholder="e.g. Air Compressor – Line 2"
                    onChange={(e) => { setMachine(e.target.value); setReuse(false); }} />
                </Field>

                {showDup && (
                  <div role="alert" style={{ ...PANEL, border: '1px solid var(--sev-minor)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <AlertTriangle size={16} style={{ color: 'var(--sev-minor)', flexShrink: 0 }} />
                      <p style={{ margin: 0, fontFamily: SANS, fontSize: '12px', color: 'var(--sev-minor)' }}>
                        “{dupMachine.name}” already exists at this site. Add your sensors to it, or type a different name.
                      </p>
                    </div>
                    <div>
                      <button type="button" style={PRIMARY_BTN} onClick={() => setReuse(true)}>Add sensors to this machine</button>
                    </div>
                  </div>
                )}

                {reuseMachine && (
                  <div style={{ ...PANEL, fontFamily: SANS, fontSize: '12px', color: 'var(--fg-2)' }}>
                    Adding sensors to the existing machine <strong style={{ color: 'var(--fg-1)' }}>{reuseMachine.name}</strong>. No new machine is created.
                  </div>
                )}

                {existingMachines.length > 0 && (
                  <div>
                    <div style={LABEL}>Machines already at this site</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {existingMachines.map((m) => (
                        <button key={m._id} type="button" style={SECONDARY_BTN}
                          onClick={() => { setMachine(m.name); setReuse(true); setTried(false); }}>
                          {m.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ---------- Step 3: sensors ---------- */}
            {!result && step === 3 && (
              <>
                {sensors.map((s, i) => (
                  <div key={s.key} role="group" aria-label={`Sensor ${i + 1}`} style={{ ...PANEL, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ ...LABEL, marginBottom: 0 }}>Sensor {i + 1}</span>
                      {sensors.length > 1 && (
                        <button type="button" aria-label={`Remove sensor ${i + 1}`} style={{ ...SECONDARY_BTN, padding: '5px 10px', fontSize: '10px' }}
                          onClick={() => setSensors((items) => items.filter((x) => x.key !== s.key))}>
                          Remove
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                      <Field label="Sensor name" error={(tried || names[i]) ? sensorErrs[i] : ''}>
                        <input style={FIELD} value={s.name} maxLength={80} placeholder="e.g. Motor bearing temp"
                          onChange={(e) => updateSensor(s.key, 'name', e.target.value)} />
                      </Field>
                      <Field label="Type" hint={`Unit ${UNITS[s.type]} · sent as "${s.type}"`}>
                        <select style={FIELD} value={s.type} onChange={(e) => updateSensor(s.key, 'type', e.target.value)}>
                          {TYPES.map((t) => <option key={t} value={t}>{t} ({UNITS[t]})</option>)}
                        </select>
                      </Field>
                    </div>
                  </div>
                ))}
                <div>
                  <button type="button" style={SECONDARY_BTN} disabled={sensors.length >= MAX_SENSORS}
                    onClick={() => setSensors((items) => [...items, blankSensor()])}>
                    <Plus size={11} />
                    Add another sensor
                  </button>
                </div>
              </>
            )}

            {!result && error && (
              <div role="alert" style={{ ...PANEL, border: '1px solid var(--sev-minor)', fontFamily: SANS, fontSize: '12px', color: 'var(--sev-minor)' }}>
                {error}
              </div>
            )}

            {!result && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                {step > 1 ? <button type="button" style={SECONDARY_BTN} onClick={goBack} disabled={submitting}>Back</button> : <span />}
                {step < 3 ? (
                  <button type="button" style={PRIMARY_BTN} onClick={goNext}>
                    Next
                    <ChevronRight size={11} />
                  </button>
                ) : (
                  <button type="button" style={{ ...PRIMARY_BTN, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
                    disabled={submitting} onClick={submit}>
                    {submitting ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                    {isNew ? 'Create site and get API key' : 'Add machine and sensors'}
                  </button>
                )}
              </div>
            )}

            {/* ---------- Result: key + connect ---------- */}
            {result && (
              <>
                {result.secret ? (
                  <div style={{ ...PANEL, border: '1px solid var(--sev-minor)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <AlertTriangle size={16} style={{ color: 'var(--sev-minor)', flexShrink: 0 }} />
                      <p style={{ margin: 0, fontFamily: SANS, fontSize: '12px', color: 'var(--sev-minor)' }}>
                        This key is shown only once. Copy it now and store it on your server or gateway. One key works for every machine and sensor at this site.
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <code style={{ flex: 1, fontFamily: MONO, fontSize: '12px', color: 'var(--fg-1)', wordBreak: 'break-all' }}>{result.secret}</code>
                      <CopyButton text={result.secret} />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} />
                      <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-2)' }}>I copied this key and stored it somewhere safe</span>
                    </label>
                  </div>
                ) : (
                  <div style={PANEL}>
                    <div style={LABEL}>API key</div>
                    <code style={{ fontFamily: MONO, fontSize: '12px', color: 'var(--fg-1)' }}>{result.keyPrefix}…</code>
                    <div style={HINT}>This site already has a key. Use the one you already have, nothing new to copy.</div>
                  </div>
                )}

                {resultSensors.length > 1 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {resultSensors.map((s, i) => (
                      <button key={s.sensorId} type="button" aria-pressed={i === curlIdx}
                        style={i === curlIdx ? PRIMARY_BTN : SECONDARY_BTN} onClick={() => setCurlIdx(i)}>
                        {s.name} · {s.type}
                      </button>
                    ))}
                  </div>
                )}
                <CopyBlock label="Send a test reading (replace <YOUR_API_KEY>)" text={curlExample} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {resultSensors.map((s) => {
                    const live = (liveSensors || []).find((x) => x.sensorId === s.sensorId || x._id === s._id);
                    const connected = Boolean(live && live.status !== 'WAITING');
                    return (
                      <div key={s.sensorId} style={{
                        ...PANEL, display: 'flex', alignItems: 'center', gap: '10px',
                        border: `1px solid ${connected ? 'var(--sev-harmless)' : 'var(--border-default)'}`,
                      }}>
                        {connected
                          ? <Radio size={14} style={{ color: 'var(--sev-harmless)' }} />
                          : <Loader2 size={14} className="animate-spin" style={{ color: 'var(--fg-4)' }} />}
                        <span style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--fg-1)' }}>{s.name}</span>
                        <span style={{
                          fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em',
                          color: connected ? 'var(--sev-harmless)' : 'var(--fg-4)',
                        }}>
                          {connected ? `Connected · ${relative(live.lastReadingAt)}` : 'Waiting for first reading…'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                  {mustAck && <span style={HINT}>Copy your key and tick the box to finish.</span>}
                  <button type="button" disabled={mustAck}
                    style={{ ...PRIMARY_BTN, opacity: mustAck ? 0.4 : 1, cursor: mustAck ? 'not-allowed' : 'pointer' }}
                    onClick={() => handleOpenChange(false)}>
                    Finish
                  </button>
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
