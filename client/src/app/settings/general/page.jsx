'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Settings, Globe, AlertTriangle, Loader2, Save } from 'lucide-react';
import { getSite, updateSiteConfig } from '@/lib/api';


const MONO = 'var(--font-mono)';
const SANS = 'var(--font-sans)';

const LABEL_STYLE = {
  fontFamily: MONO,
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--fg-3)',
};

const SECTION_HEADER_STYLE = {
  padding: '12px 20px',
  borderBottom: '1px solid var(--border-hairline)',
  background: 'var(--bg-surface-2)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const SECTION_TITLE_STYLE = {
  fontFamily: MONO,
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--fg-2)',
};

const CARD_STYLE = {
  background: 'var(--bg-surface-1)',
  border: '1px solid var(--border-default)',
  borderRadius: '2px',
  overflow: 'hidden',
};

const INPUT_BASE_STYLE = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--bg-base)',
  border: '1px solid var(--border-default)',
  borderRadius: '2px',
  fontFamily: SANS,
  fontSize: '13px',
  color: 'var(--fg-1)',
  transition: 'border-color 120ms',
};

export default function GeneralSettingsPage() {
  const queryClient = useQueryClient();
  const canEdit = true;

  const { data: site, isLoading, isError } = useQuery({
    queryKey: ['site-me'],
    queryFn: getSite,
  });

  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [locationLabel, setLocationLabel] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookError, setWebhookError] = useState('');

  useEffect(() => {
    if (!site) return;
    setName(site.name ?? '');
    setTimezone(site.timezone ?? 'UTC');
    setLocationLabel(site.locationLabel ?? '');
    setWebhookUrl(site.webhookUrl ?? '');
  }, [site]);

  function validateWebhook(val) {
    if (val && !/^https?:\/\//i.test(val)) {
      return 'Webhook URL must start with http:// or https://';
    }
    return '';
  }

  const saveMutation = useMutation({
    mutationFn: (payload) => updateSiteConfig(payload),
    onSuccess: () => {
      toast.success('Site settings saved');
      queryClient.invalidateQueries({ queryKey: ['site-me'] });
    },
    onError: (err) => {
      toast.error(err?.message ?? 'Failed to save settings');
    },
  });

  function handleSave(e) {
    e.preventDefault();

    const vErr = validateWebhook(webhookUrl);
    if (vErr) {
      setWebhookError(vErr);
      return;
    }
    setWebhookError('');

    saveMutation.mutate({
      name: name.trim() || 'Site',
      timezone: timezone.trim() || 'UTC',
      locationLabel: locationLabel.trim() || null,
      webhookUrl: webhookUrl.trim() || null,
    });
  }

  if (isLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '96px 0', color: 'var(--fg-3)', fontFamily: SANS, fontSize: '13px',
      }}>
        <Loader2 size={16} className="animate-spin" style={{ marginRight: '8px' }} />
        Loading site settings…
      </div>
    );
  }

  if (isError || !site) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        border: '1px solid var(--border-default)',
        borderLeft: '2px solid var(--sev-serious)',
        background: 'var(--bg-surface-1)', borderRadius: '2px',
        padding: '12px 16px', color: 'var(--sev-serious)',
        fontFamily: SANS, fontSize: '13px',
      }}>
        <AlertTriangle size={14} style={{ flexShrink: 0 }} />
        Failed to load site settings. Please refresh the page.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: SANS }}>
      <div>
        <h1 style={{
          fontFamily: SANS, fontSize: '20px', fontWeight: 600,
          letterSpacing: '-0.01em', color: 'var(--fg-1)',
          display: 'flex', alignItems: 'center', gap: '10px', margin: 0,
        }}>
          <Settings size={16} style={{ color: 'var(--accent)' }} />
          Site configuration
        </h1>
        <p style={{
          fontFamily: SANS, fontSize: '12px', color: 'var(--fg-3)',
          margin: '6px 0 0 0',
        }}>
          Project site name, timezone, and outbound webhook for morning briefing delivery.
        </p>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <section style={CARD_STYLE}>
          <div style={SECTION_HEADER_STYLE}>
            <Globe size={13} style={{ color: 'var(--fg-3)' }} />
            <h2 style={SECTION_TITLE_STYLE}>Site</h2>
          </div>
          <div style={{ padding: '20px', display: 'grid', gap: '16px', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="siteName" style={{ ...LABEL_STYLE, display: 'block', marginBottom: '6px' }}>Name</label>
              <input id="siteName" style={INPUT_BASE_STYLE} value={name} disabled={!canEdit}
                onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="timezone" style={{ ...LABEL_STYLE, display: 'block', marginBottom: '6px' }}>Timezone</label>
              <input id="timezone" style={INPUT_BASE_STYLE} value={timezone} disabled={!canEdit}
                placeholder="UTC" onChange={(e) => setTimezone(e.target.value)} />
            </div>
            <div>
              <label htmlFor="locationLabel" style={{ ...LABEL_STYLE, display: 'block', marginBottom: '6px' }}>Site label</label>
              <input id="locationLabel" style={INPUT_BASE_STYLE} value={locationLabel} disabled={!canEdit}
                placeholder="LNG Expansion — Train 3" onChange={(e) => setLocationLabel(e.target.value)} />
            </div>
          </div>
        </section>

        <section style={CARD_STYLE}>
          <div style={SECTION_HEADER_STYLE}>
            <Globe size={13} style={{ color: 'var(--fg-3)' }} />
            <h2 style={SECTION_TITLE_STYLE}>Webhook</h2>
          </div>
          <div style={{ padding: '20px' }}>
            <label htmlFor="webhookUrl" style={{ ...LABEL_STYLE, display: 'block', marginBottom: '6px' }}>
              Webhook URL
            </label>
            <input
              id="webhookUrl"
              type="text"
              autoComplete="off"
              placeholder="https://your-server.com/webhooks/sentinel"
              value={webhookUrl}
              disabled={!canEdit}
              onChange={(e) => {
                setWebhookUrl(e.target.value);
                setWebhookError(validateWebhook(e.target.value));
              }}
              style={{
                ...INPUT_BASE_STYLE,
                borderColor: webhookError ? 'var(--sev-serious)' : 'var(--border-default)',
              }}
            />
            {webhookError && (
              <p style={{
                margin: '6px 0 0 0', fontFamily: SANS, fontSize: '11px',
                color: 'var(--sev-serious)', display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <AlertTriangle size={11} />
                {webhookError}
              </p>
            )}
          </div>
        </section>

        {canEdit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: 'var(--accent)', color: 'var(--bg-base)',
                border: 'none', borderRadius: '2px',
                padding: '10px 16px', fontFamily: MONO, fontSize: '11px',
                fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: saveMutation.isPending ? 'wait' : 'pointer',
              }}
            >
              {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save site
            </button>
          </div>
        )}

      </form>
    </div>
  );
}
