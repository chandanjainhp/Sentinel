/** Shared webhook-settings primitives. */

export const MONO = 'var(--font-mono)';
export const SANS = 'var(--font-sans)';

export const LABEL = {
  fontFamily: MONO,
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--fg-3)',
};

export const BTN_PRIMARY = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  fontFamily: SANS,
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--bg-base)',
  background: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: '2px',
  cursor: 'pointer',
};

export const BTN_SECONDARY = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  fontFamily: SANS,
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--fg-2)',
  background: 'var(--bg-surface-2)',
  border: '1px solid var(--border-default)',
  borderRadius: '2px',
  cursor: 'pointer',
};

export const SPIN = 'spin 1s linear infinite';

export const PRE_STYLE = {
  fontFamily: MONO,
  fontSize: '11px',
  background: 'var(--bg-base)',
  color: 'var(--fg-2)',
  border: '1px solid var(--border-hairline)',
  borderRadius: '2px',
  padding: '12px',
  overflowX: 'auto',
  margin: 0,
};

export function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {});
}
