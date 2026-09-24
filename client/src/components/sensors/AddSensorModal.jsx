'use client';

import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import * as Checkbox from '@radix-ui/react-checkbox';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle, Check, ChevronRight, Copy, Loader2, Plus, Radio, X,
} from 'lucide-react';
import {
  getApiKeyMeta, createUserApiKey, getSites, createSite,
  getMachinesForSite, createMachine, listSensors, createSensor,
} from '@/lib/api';

const MONO = 'var(--font-mono)';
const SANS = 'var(--font-sans)';

const SENSOR_TYPES = ['temperature', 'vibration', 'pressure', 'current', 'voltage', 'rpm', 'flow'];

const PRIMARY_BTN = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  background: 'var(--accent)',
  color: 'var(--bg-base)',
  border: '1px solid var(--accent)',
  borderRadius: '2px',
  fontFamily: MONO,
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  cursor: 'pointer',
};

const SECONDARY_BTN = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  background: 'transparent',
  color: 'var(--fg-2)',
  border: '1px solid var(--border-default)',
  borderRadius: '2px',
  fontFamily: MONO,
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  cursor: 'pointer',
};

const FIELD = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  background: 'var(--bg-surface-2)',
  border: '1px solid var(--border-default)',
  borderRadius: '2px',
  color: 'var(--fg-1)',
  fontFamily: SANS,
  fontSize: '13px',
  outline: 'none',
};

const LABEL = {
  display: 'block',
  fontFamily: MONO,
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--fg-3)',
  marginBottom: '6px',
};

function relative(iso) {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : 'never';
}

/* Reveal-once key modal — same pattern as the settings/api-key page. */
function RevealSecretModal({ open, secret, onClose }) {
  const [copied, setCopied] = useState(false);
  const [acked, setAcked] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(secret).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function close() {
    if (!acked) return;
    setAcked(false);
    setCopied(false);
    onClose();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60 }} />
        <Dialog.Content style={{
          position: 'fixed', zIndex: 70, top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)', width: '100%', maxWidth: '520px',
          background: 'var(--bg-surface-1)', border: '1px solid var(--border-strong)',
          borderRadius: '2px', outline: 'none',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', borderBottom: '1px solid var(--border-default)',
          }}>
            <Dialog.Title style={{
              margin: 0, fontFamily: MONO, fontSize: '11px', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-1)',
            }}>
              Your new API key
            </Dialog.Title>
            <button type="button" onClick={close} disabled={!acked} style={{
              background: 'none', border: 'none', color: 'var(--fg-3)',
              cursor: acked ? 'pointer' : 'not-allowed', opacity: acked ? 1 : 0.3,
              padding: 0, display: 'flex',
            }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              padding: '12px 14px', background: 'var(--bg-surface-2)',
              border: '1px solid var(--sev-minor)', borderRadius: '2px',
            }}>
              <AlertTriangle size={16} style={{ color: 'var(--sev-minor)', flexShrink: 0 }} />
              <p style={{ margin: 0, fontFamily: SANS, fontSize: '12px', color: 'var(--sev-minor)' }}>
                This secret will never be shown again. Copy it now — you will paste it into the
                curl example in the Connect step.
              </p>
            </div>

            <div style={{
              borderRadius: '2px', border: '1px solid var(--border-default)',
              background: 'var(--bg-surface-2)', padding: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <code style={{
                  flex: 1, fontFamily: MONO, fontSize: '12px',
                  color: 'var(--fg-1)', wordBreak: 'break-all',
                }}>
                  {secret}
                </code>
                <button type="button" onClick={handleCopy} style={{ ...SECONDARY_BTN, flexShrink: 0, padding: '5px 10px', fontSize: '10px' }}>
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <Checkbox.Root
                checked={acked}
                onCheckedChange={setAcked}
                style={{
                  width: '14px', height: '14px', border: '1px solid var(--border-strong)',
                  borderRadius: '2px', background: 'var(--bg-surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Checkbox.Indicator>
                  <Check size={10} style={{ color: 'var(--accent)' }} />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--fg-2)' }}>
                I have copied the secret and will configure my gateways
              </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={close}
                disabled={!acked}
                style={{
                  ...PRIMARY_BTN,
                  opacity: acked ? 1 : 0.4,
                  cursor: acked ? 'pointer' : 'not-allowed',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CopyBlock({ label, text }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div style={{
      borderRadius: '2px', border: '1px solid var(--border-default)',
      background: 'var(--bg-surface-2)', padding: '12px',
    }}>
      <div style={{
        fontFamily: MONO, fontSize: '10px', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.12em',
        color: 'var(--fg-3)', marginBottom: '6px',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <pre style={{
          flex: 1, margin: 0, fontFamily: MONO, fontSize: '11px', lineHeight: '16px',
          color: 'var(--fg-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {text}
        </pre>
        <button type="button" onClick={handleCopy} style={{ ...SECONDARY_BTN, flexShrink: 0, padding: '5px 10px', fontSize: '10px' }}>
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function StepDots({ step, total }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{
          width: i + 1 === step ? '18px' : '6px',
          height: '6px',
          borderRadius: '3px',
          background: i + 1 === step ? 'var(--accent)' : 'var(--border-strong)',
          transition: 'width 150ms ease',
        }} />
      ))}
      <span style={{
        marginLeft: '6px', fontFamily: MONO, fontSize: '10px',
        letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-3)',
      }}>
        {step} / {total}
      </span>
    </div>
  );
}

const CREATE_OPTION = '__create__';

/* Draft persistence: the wizard survives modal close/reopen and page reloads.
   Cleared once a sensor is successfully created. */
const DRAFT_KEY = 'sentinel-add-sensor-draft';

function loadDraft() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export default function AddSensorModal({ open, onOpenChange, summary }) {
  const queryClient = useQueryClient();
  const draft = useMemo(loadDraft, []);
  // A saved step 3 means the sensor was already created — resume at step 1
  // rather than re-running the create step.
  const [step, setStep] = useState(draft?.step === 2 ? 2 : 1);
  const [siteId, setSiteId] = useState(draft?.siteId || '');
  const [newSiteName, setNewSiteName] = useState('');
  const [machineId, setMachineId] = useState(draft?.machineId || '');
  const [newMachineName, setNewMachineName] = useState('');
  const [newMachineType, setNewMachineType] = useState('');
  const [name, setName] = useState(draft?.name || '');
  const [type, setType] = useState(draft?.type || 'vibration');
  const [intervalSec, setIntervalSec] = useState(draft?.intervalSec || '60');
  const [created, setCreated] = useState(null);
  const [revealSecret, setRevealSecret] = useState('');
  const [showSiteForm, setShowSiteForm] = useState(false);
  const [showMachineForm, setShowMachineForm] = useState(false);

  // Persist wizard progress so closing/reopening never loses work.
  useEffect(() => {
    if (created) return;
    try {
      window.sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ step, siteId, machineId, name, type, intervalSec })
      );
    } catch {
      /* ignore */
    }
  }, [step, siteId, machineId, name, type, intervalSec, created]);

  const { data: sites, isLoading: sitesLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: getSites,
    enabled: open && step === 1,
  });

  const { data: machines, isLoading: machinesLoading } = useQuery({
    queryKey: ['machines', siteId],
    queryFn: () => getMachinesForSite(siteId),
    enabled: open && step === 1 && Boolean(siteId),
  });

  const { data: keyMeta } = useQuery({
    queryKey: ['api-key'],
    queryFn: getApiKeyMeta,
    enabled: open && step === 3,
  });

  const { data: sensors } = useQuery({
    queryKey: ['sensors'],
    queryFn: listSensors,
    enabled: open && step === 3,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  function reset() {
    if (created) clearDraft();
    setStep(1);
    setSiteId('');
    setNewSiteName('');
    setMachineId('');
    setNewMachineName('');
    setNewMachineType('');
    setName('');
    setType('vibration');
    setIntervalSec('60');
    setCreated(null);
    setRevealSecret('');
    setShowSiteForm(false);
    setShowMachineForm(false);
  }

  function handleOpenChange(nextOpen) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  const createSiteMutation = useMutation({
    mutationFn: createSite,
    onSuccess: (createdSite) => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setSiteId(createdSite._id);
      setNewSiteName('');
      setShowSiteForm(false);
      toast.success('Site created');
    },
    onError: (err) => toast.error(err?.message ?? 'Failed to create site'),
  });

  function handleCreateSite() {
    const trimmed = newSiteName.trim();
    if (!trimmed) {
      toast.error('Enter a site name first');
      return;
    }
    createSiteMutation.mutate({ name: trimmed });
  }

  const createMachineMutation = useMutation({
    mutationFn: ({ siteId: sid, data }) => createMachine(sid, data),
    onSuccess: (createdMachine) => {
      queryClient.invalidateQueries({ queryKey: ['machines', siteId] });
      setMachineId(createdMachine._id);
      setNewMachineName('');
      setNewMachineType('');
      setShowMachineForm(false);
      toast.success('Machine created');
      // Inline machine creation is a means to an end — continue straight
      // to the sensor details step.
      setStep(2);
    },
    onError: (err) => toast.error(err?.message ?? 'Failed to create machine'),
  });

  function handleCreateMachine() {
    const trimmedName = newMachineName.trim();
    const trimmedType = newMachineType.trim();
    if (!siteId) {
      toast.error('Choose or create a site first');
      return;
    }
    if (!trimmedName) {
      toast.error('Enter a machine name first');
      return;
    }
    createMachineMutation.mutate({
      siteId,
      data: { name: trimmedName, machineType: trimmedType || 'general', assetId: trimmedName },
    });
  }

  const createKeyMutation = useMutation({
    mutationFn: createUserApiKey,
    onSuccess: (result) => {
      const secret = result?.secret;
      if (!secret) {
        toast.error('Key created but secret was not returned');
        return;
      }
      setRevealSecret(secret);
      queryClient.invalidateQueries({ queryKey: ['api-key'] });
    },
    onError: (err) => toast.error(err?.message ?? 'Failed to create API key'),
  });

  const intervalNum = Number(intervalSec);
  const intervalValid = Number.isInteger(intervalNum) && intervalNum >= 1 && intervalNum <= 86400;
  const canCreate = name.trim().length >= 2 && intervalValid;

  function handleCreateSensor() {
    const payload = { name: name.trim(), type };
    if (intervalValid) payload.expectedIntervalSec = intervalNum;
    createSensorMutation.mutate(payload);
  }

  const createSensorMutation = useMutation({
    mutationFn: (payload) => createSensor(machineId, payload),
    onSuccess: (createdSensor) => {
      clearDraft(); // sensor exists — never resume into a duplicate create
      queryClient.invalidateQueries({ queryKey: ['sensors'] });
      queryClient.invalidateQueries({ queryKey: ['sensor-summary'] });
      setCreated(createdSensor);
      setStep(3);
    },
    onError: (err) => toast.error(err?.message ?? 'Failed to create sensor'),
  });

  const site = (sites || []).find((s) => s._id === siteId);
  const machine = (machines || []).find((m) => m._id === machineId);
  const sensorIdForEvents = created?.sensorId || created?._id;

  const liveSensor = created
    ? (sensors || []).find((s) => s._id === created._id)
    : null;
  const connected = Boolean(liveSensor && liveSensor.status !== 'WAITING');

  // Same-origin by default so the copied curl works with the client's API
  // proxy out of the box (API_UPSTREAM_URL environments included).
  const apiOrigin = typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:8000';
  const curlExample = [
    `curl -X POST ${apiOrigin}/api/v1/events \\`,
    '  -H "Authorization: Bearer <YOUR_API_KEY>" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '${JSON.stringify({
      siteId: site?.siteId || '<SITE_ID>',
      machineId: machine?.machineId || '<MACHINE_ID>',
      sensorId: sensorIdForEvents || '<SENSOR_ID>',
      type: 'sensor_reading',
      timestamp: new Date().toISOString(),
      values: { vibration: 0.42 },
    })}'`,
  ].join('\n');

  const jsonPayload = `${JSON.stringify({
    siteId: site?.siteId || '<SITE_ID>',
    machineId: machine?.machineId || '<MACHINE_ID>',
    sensorId: sensorIdForEvents || '<SENSOR_ID>',
    type: 'sensor_reading',
    timestamp: '<ISO timestamp>',
    values: { [type]: 42 },
  }, null, 2)}`;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
          <Dialog.Content style={{
            position: 'fixed', zIndex: 50, top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)', width: '100%', maxWidth: '560px',
            maxHeight: '85vh', overflowY: 'auto',
            background: 'var(--bg-surface-1)', border: '1px solid var(--border-strong)',
            borderRadius: '2px', outline: 'none',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', borderBottom: '1px solid var(--border-default)',
            }}>
              <Dialog.Title style={{
                margin: 0, fontFamily: MONO, fontSize: '11px', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-1)',
              }}>
                Add sensor
              </Dialog.Title>
              <StepDots step={step} total={3} />
              <button type="button" onClick={() => handleOpenChange(false)} style={{
                background: 'none', border: 'none', color: 'var(--fg-3)',
                cursor: 'pointer', padding: 0, display: 'flex',
              }}>
                <X size={16} />
              </button>
              <Dialog.Description style={{ display: 'none' }} />
            </div>

            <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {step === 1 && (
                <>
                  <div>
                    <label style={LABEL}>Site</label>
                    <select
                      style={FIELD}
                      value={siteId || (showSiteForm ? CREATE_OPTION : '')}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === CREATE_OPTION) {
                          setSiteId('');
                          setMachineId('');
                          setShowSiteForm(true);
                        } else {
                          setSiteId(v);
                          setMachineId('');
                          setShowSiteForm(false);
                        }
                      }}
                    >
                      <option value="">Choose a site…</option>
                      {(sites || []).map((s) => (
                        <option key={s._id} value={s._id}>{s.name}</option>
                      ))}
                      <option value={CREATE_OPTION}>+ New site…</option>
                    </select>
                    {showSiteForm && (
                      <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                        <input
                          style={FIELD}
                          placeholder="New site name (e.g. Main plant)"
                          value={newSiteName}
                          autoFocus
                          onChange={(e) => setNewSiteName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateSite(); } }}
                        />
                        <button
                          type="button"
                          style={{ ...PRIMARY_BTN, flexShrink: 0 }}
                          disabled={createSiteMutation.isPending}
                          onClick={handleCreateSite}
                        >
                          {createSiteMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                          Create
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={LABEL}>Machine</label>
                    <select
                      style={FIELD}
                      value={machineId || (showMachineForm ? CREATE_OPTION : '')}
                      disabled={!siteId}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === CREATE_OPTION) {
                          setMachineId('');
                          setShowMachineForm(true);
                        } else {
                          setMachineId(v);
                          setShowMachineForm(false);
                        }
                      }}
                    >
                      <option value="">{siteId ? 'Choose a machine…' : 'Choose a site first'}</option>
                      {(machines || []).map((m) => (
                        <option key={m._id} value={m._id}>{m.name}</option>
                      ))}
                      <option value={CREATE_OPTION}>+ New machine…</option>
                    </select>
                    {showMachineForm && siteId && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input
                          style={FIELD}
                          placeholder="Machine name (e.g. Hydraulic pump 2)"
                          value={newMachineName}
                          autoFocus
                          onChange={(e) => setNewMachineName(e.target.value)}
                        />
                        <input
                          style={FIELD}
                          placeholder="Machine type — pump, press, motor (optional)"
                          value={newMachineType}
                          onChange={(e) => setNewMachineType(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateMachine(); } }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            style={PRIMARY_BTN}
                            disabled={createMachineMutation.isPending}
                            onClick={handleCreateMachine}
                          >
                            {createMachineMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                            Create
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      style={PRIMARY_BTN}
                      disabled={!siteId || !machineId}
                      onClick={() => setStep(2)}
                    >
                      Next
                      <ChevronRight size={11} />
                    </button>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <label style={LABEL}>Sensor name</label>
                    <input
                      style={FIELD}
                      placeholder="e.g. Spindle vibration"
                      value={name}
                      autoFocus
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={LABEL}>Type</label>
                    <select style={FIELD} value={type} onChange={(e) => setType(e.target.value)}>
                      {SENSOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={LABEL}>Expected interval (seconds)</label>
                    <input
                      style={FIELD}
                      type="number"
                      min={1}
                      max={86400}
                      value={intervalSec}
                      onChange={(e) => setIntervalSec(e.target.value)}
                    />
                    {!intervalValid && (
                      <div style={{ fontFamily: SANS, fontSize: '11px', color: 'var(--sev-minor)', marginTop: '6px' }}>
                        Must be a whole number of seconds, 1–86400
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" style={SECONDARY_BTN} onClick={() => setStep(1)}>Back</button>
                    <button
                      type="button"
                      style={{ ...PRIMARY_BTN, opacity: canCreate ? 1 : 0.4, cursor: canCreate ? 'pointer' : 'not-allowed' }}
                      disabled={!canCreate || createSensorMutation.isPending}
                      onClick={handleCreateSensor}
                    >
                      {createSensorMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                      Create sensor
                    </button>
                  </div>
                </>
              )}

              {step === 3 && created && (
                <>
                  {/* IDs */}
                  <div style={{
                    padding: '12px 14px', background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-hairline)', borderRadius: '2px',
                  }}>
                    <div style={{ ...LABEL, marginBottom: '8px' }}>Setup summary</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', fontFamily: SANS, fontSize: '12px', color: 'var(--fg-2)' }}>
                      <span>Site: <strong style={{ color: 'var(--fg-1)' }}>{site?.name || '—'}</strong></span>
                      <span>Machine: <strong style={{ color: 'var(--fg-1)' }}>{machine?.name || '—'}</strong></span>
                      <span>Sensor: <strong style={{ color: 'var(--fg-1)' }}>{created.name}</strong></span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '8px' }}>
                      <code style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--fg-2)' }}>siteId: {site?.siteId || site?._id || '—'}</code>
                      <code style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--fg-2)' }}>machineId: {machine?.machineId || machine?._id || '—'}</code>
                      <code style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--fg-2)' }}>sensorId: {sensorIdForEvents}</code>
                    </div>
                  </div>

                  {/* API key state */}
                  <div>
                    <div style={LABEL}>API key</div>
                    {keyMeta ? (
                      <div style={{
                        padding: '12px 14px', background: 'var(--bg-surface-2)',
                        border: '1px solid var(--border-hairline)', borderRadius: '2px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                      }}>
                        <div>
                          <code style={{ fontFamily: MONO, fontSize: '12px', color: 'var(--fg-1)' }}>{keyMeta.keyPrefix}…</code>
                          <div style={{ fontFamily: SANS, fontSize: '11px', color: 'var(--fg-3)', marginTop: '2px' }}>
                            created {relative(keyMeta.createdAt)} · last used {keyMeta.lastUsedAt ? relative(keyMeta.lastUsedAt) : 'never'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => { if (window.confirm('Generate a new key? The current key stops working immediately.')) createKeyMutation.mutate(); }}
                          disabled={createKeyMutation.isPending}
                          style={{ ...SECONDARY_BTN, flexShrink: 0, padding: '5px 10px', fontSize: '10px' }}
                        >
                          {createKeyMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                          Regenerate
                        </button>
                      </div>
                    ) : (
                      <div style={{
                        padding: '12px 14px', background: 'var(--bg-surface-2)',
                        border: '1px solid var(--border-hairline)', borderRadius: '2px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                      }}>
                        <span style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--fg-3)' }}>
                          No API key yet.
                        </span>
                        <button
                          type="button"
                          onClick={() => createKeyMutation.mutate()}
                          disabled={createKeyMutation.isPending}
                          style={{ ...PRIMARY_BTN, flexShrink: 0, padding: '5px 10px', fontSize: '10px' }}
                        >
                          {createKeyMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                          Generate key
                        </button>
                      </div>
                    )}
                  </div>

                  <CopyBlock label="Send your first reading (curl)" text={curlExample} />
                  <CopyBlock label="JSON payload" text={jsonPayload} />

                  {/* Live connect indicator */}
                  <div style={{
                    padding: '12px 14px', borderRadius: '2px',
                    background: 'var(--bg-surface-2)',
                    border: `1px solid ${connected ? 'var(--sev-harmless)' : 'var(--border-default)'}`,
                    display: 'flex', alignItems: 'center', gap: '10px',
                  }}>
                    {connected ? (
                      <>
                        <Radio size={14} style={{ color: 'var(--sev-harmless)' }} />
                        <span style={{
                          fontFamily: MONO, fontSize: '11px', fontWeight: 600,
                          textTransform: 'uppercase', letterSpacing: '0.1em',
                          color: 'var(--sev-harmless)',
                        }}>
                          Connected
                        </span>
                        <span style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--fg-2)' }}>
                          First reading received {relative(liveSensor.lastReadingAt)}
                        </span>
                      </>
                    ) : (
                      <>
                        <Loader2 size={14} className="animate-spin" style={{ color: 'var(--fg-4)' }} />
                        <span style={{
                          fontFamily: MONO, fontSize: '11px',
                          textTransform: 'uppercase', letterSpacing: '0.1em',
                          color: 'var(--fg-4)',
                        }}>
                          Waiting for first reading…
                        </span>
                      </>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" style={SECONDARY_BTN} onClick={() => setStep(2)}>Back</button>
                    <button type="button" style={PRIMARY_BTN} onClick={() => handleOpenChange(false)}>
                      Done
                    </button>
                  </div>
                </>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <RevealSecretModal
        open={Boolean(revealSecret)}
        secret={revealSecret}
        onClose={() => setRevealSecret('')}
      />
    </>
  );
}
