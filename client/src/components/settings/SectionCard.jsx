'use client';

const CARD_STYLE = {
  background: 'var(--bg-surface-1)',
  border: '1px solid var(--border-default)',
  borderRadius: '2px',
  overflow: 'hidden',
};

const LABEL_STYLE = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--fg-3)',
};

/**
 * The single card shell used by every settings section: header strip with an
 * optional icon, then a padded body. Keeps section chrome identical instead
 * of each section hand-rolling its own header markup.
 */
export default function SectionCard({ title, icon: Icon, actions, children }) {
  return (
    <section style={CARD_STYLE}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 20px',
        borderBottom: '1px solid var(--border-hairline)',
        background: 'var(--bg-surface-2)',
      }}>
        {Icon && <Icon size={12} style={{ color: 'var(--fg-3)', flexShrink: 0 }} aria-hidden="true" />}
        <h2 style={{ ...LABEL_STYLE, fontSize: '11px', margin: 0 }}>{title}</h2>
        {actions && <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>{actions}</div>}
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </section>
  );
}
