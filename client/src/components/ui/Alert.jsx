const tones = {
  success: 'border-success bg-success-light text-success-text',
  warning: 'border-warning bg-warning-light text-warning-text',
  danger: 'border-danger bg-danger-light text-danger-text',
  info: 'border-info bg-info-light text-info-text',
};

function AlertIcon({ type }) {
  if (type === 'success') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm-1 14-4-4 1.4-1.4 2.6 2.6 5.6-5.6L18 9Z" fill="currentColor" />
      </svg>
    );
  }
  if (type === 'warning') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path d="M12 3 2.7 20h18.6L12 3Zm0 12a1 1 0 0 1-1-1V10a1 1 0 1 1 2 0v4a1 1 0 0 1-1 1Zm0 3a1.25 1.25 0 1 1 1.25-1.25A1.25 1.25 0 0 1 12 18Z" fill="currentColor" />
      </svg>
    );
  }
  if (type === 'info') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 5.5A1.25 1.25 0 1 1 10.75 8.75 1.25 1.25 0 0 1 12 7.5Zm1.5 9h-3v-1.5h1V11h-1v-1.5h2.5v5h.5Z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M12 3.5 2.7 20h18.6L12 3.5Zm0 5.5a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Zm0 9a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" fill="currentColor" />
    </svg>
  );
}

export default function Alert({
  type = 'danger',
  message,
  title,
  onDismiss,
  className = '',
}) {
  const tone = tones[type] || tones.danger;

  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${tone} ${className}`.trim()} role="alert">
      <div className="flex items-start gap-2">
        <span className="mt-0.5"><AlertIcon type={type} /></span>
        <div className="flex-1">
          {title ? <p className="font-semibold">{title}</p> : null}
          {message ? <p>{message}</p> : null}
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded p-1 hover:bg-black/5"
            aria-label="Dismiss alert"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
