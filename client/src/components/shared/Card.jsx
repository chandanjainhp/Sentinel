export default function Card({ className = '', children }) {
  return (
    <article className={`rounded-xl border border-border bg-surface p-6 shadow-card ${className}`.trim()}>
      {children}
    </article>
  );
}
