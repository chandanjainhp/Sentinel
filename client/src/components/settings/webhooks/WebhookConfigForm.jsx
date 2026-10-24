'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Switch from '@radix-ui/react-switch';
import { toast } from 'sonner';
import { Check, FlaskConical, Loader2, Webhook, X } from 'lucide-react';
import SectionCard from '@/components/settings/SectionCard';
import { getOrgWebhooks, updateWebhookConfig, testWebhook } from '@/lib/api';
import { BTN_PRIMARY, BTN_SECONDARY, LABEL, MONO, SANS, SPIN } from './webhookStyles';

function stripHttps(url = '') {
  return url.replace(/^https?:\/\//, '');
}

/**
 * The one editable webhook endpoint form in the app. General settings only
 * links here, so URL/active state has a single owner.
 */
export default function WebhookConfigForm() {
  const queryClient = useQueryClient();
  const [urlSuffix, setUrlSuffix] = useState('');
  const [webhookActive, setWebhookActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, status, body }
  const testClearTimerRef = useRef(null);

  const { data: webhookConfig, isLoading } = useQuery({
    queryKey: ['org-webhooks'],
    queryFn: getOrgWebhooks,
  });

  useEffect(() => {
    if (!webhookConfig) return;
    setUrlSuffix(stripHttps(webhookConfig.webhookUrl ?? ''));
    setWebhookActive(!!webhookConfig.webhookActive);
  }, [webhookConfig]);

  useEffect(() => () => clearTimeout(testClearTimerRef.current), []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateWebhookConfig({ webhookUrl: 'https://' + urlSuffix, webhookActive });
      queryClient.invalidateQueries({ queryKey: ['org-webhooks'] });
      queryClient.invalidateQueries({ queryKey: ['site-me'] });
      toast.success('Webhook saved');
    } catch (err) {
      toast.error(err?.message || 'Failed to save webhook config');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    clearTimeout(testClearTimerRef.current);
    try {
      const result = await testWebhook();
      const status = result?.status ?? result?.httpStatus ?? 200;
      const body = result?.body ?? result?.response ?? JSON.stringify(result);
      const ok = typeof status === 'number' ? status >= 200 && status < 300 : true;
      setTestResult({ ok, status, body: typeof body === 'string' ? body : JSON.stringify(body) });
    } catch (err) {
      const status = err?.statusCode ?? err?.response?.status ?? 'error';
      setTestResult({ ok: false, status, body: err?.message ?? 'Test webhook failed' });
    } finally {
      setTesting(false);
      testClearTimerRef.current = setTimeout(() => setTestResult(null), 30000);
    }
  };

  return (
    <SectionCard title="Endpoint Configuration" icon={Webhook}>
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: SANS, fontSize: '13px', color: 'var(--fg-3)' }}>
          <Loader2 size={14} style={{ animation: SPIN }} />
          Loading configuration…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label htmlFor="webhook-url" style={{ ...LABEL, display: 'block', marginBottom: '8px' }}>
              Webhook URL
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              border: '1px solid var(--border-default)',
              borderRadius: '2px',
              overflow: 'hidden',
              background: 'var(--bg-base)',
            }}>
              <span style={{
                padding: '8px 12px',
                background: 'var(--bg-surface-2)',
                borderRight: '1px solid var(--border-hairline)',
                fontFamily: MONO,
                fontSize: '12px',
                color: 'var(--fg-3)',
                userSelect: 'none',
                whiteSpace: 'nowrap',
              }}>
                https://
              </span>
              <input
                id="webhook-url"
                type="text"
                placeholder="your-domain.com/api/webhooks/sentinel"
                value={urlSuffix}
                onChange={(e) => setUrlSuffix(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '8px 12px',
                  fontFamily: SANS,
                  fontSize: '13px',
                  color: 'var(--fg-1)',
                  background: 'var(--bg-base)',
                  border: 'none',
                  outline: 'none',
                }}
              />
            </div>
            <p style={{ fontFamily: SANS, fontSize: '11px', color: 'var(--fg-4)', marginTop: '6px' }}>
              Must be a publicly accessible HTTPS endpoint.
            </p>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            padding: '12px 0',
            borderTop: '1px solid var(--border-hairline)',
          }}>
            <div>
              <div style={{ fontFamily: SANS, fontSize: '13px', fontWeight: 500, color: 'var(--fg-2)' }}>Active</div>
              <div style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--fg-3)', marginTop: '2px' }}>
                Enable or disable webhook delivery without deleting your configuration.
              </div>
            </div>
            <Switch.Root
              checked={webhookActive}
              onCheckedChange={setWebhookActive}
              aria-label="Webhook delivery active"
              style={{
                position: 'relative',
                display: 'inline-flex',
                height: '22px',
                width: '40px',
                alignItems: 'center',
                borderRadius: '11px',
                background: webhookActive ? 'var(--accent)' : 'var(--bg-surface-3)',
                border: '1px solid var(--border-default)',
                transition: 'background 120ms',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Switch.Thumb style={{
                display: 'inline-block',
                height: '16px',
                width: '16px',
                borderRadius: '50%',
                background: 'var(--bg-base)',
                transform: webhookActive ? 'translateX(20px)' : 'translateX(2px)',
                transition: 'transform 120ms',
              }} />
            </Switch.Root>
          </div>

          <div className="wh-actions" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ ...BTN_PRIMARY, opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving && <Loader2 size={13} style={{ animation: SPIN }} />}
              Save Configuration
            </button>

            <button
              onClick={handleTest}
              disabled={testing}
              style={{ ...BTN_SECONDARY, opacity: testing ? 0.5 : 1, cursor: testing ? 'not-allowed' : 'pointer' }}
            >
              {testing ? <Loader2 size={13} style={{ animation: SPIN }} /> : <FlaskConical size={13} />}
              {testing ? 'Testing…' : 'Test Webhook'}
            </button>

            {testResult && !testing && (
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '2px',
                fontFamily: MONO,
                fontSize: '11px',
                maxWidth: '380px',
                background: 'var(--bg-surface-2)',
                border: `1px solid ${testResult.ok ? 'var(--sev-harmless)' : 'var(--sev-serious)'}`,
                color: testResult.ok ? 'var(--sev-harmless)' : 'var(--sev-serious)',
              }}>
                {testResult.ok
                  ? <Check size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                  : <X size={14} style={{ flexShrink: 0, marginTop: '2px' }} />}
                <span style={{ wordBreak: 'break-all' }}>
                  {testResult.status} — {testResult.body}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
