export default function Input({
  label,
  name,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  hint,
  required = false,
  disabled = false,
  leftIcon,
  rightIcon,
  className = '',
  ...rest
}) {
  const inputId = rest.id || name;

  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-primary-600">
          {label}
          {required ? <span className="ml-1 text-danger">*</span> : null}
        </label>
      ) : null}

      <div className="relative">
        {leftIcon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
            {leftIcon}
          </span>
        ) : null}

        <input
          id={inputId}
          name={name}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          className={[
            'w-full rounded-md border bg-surface text-text-primary placeholder:text-text-muted',
            'h-11 md:h-10 px-3 text-sm transition-all duration-150',
            'focus:outline-none focus:ring-2',
            leftIcon ? 'pl-10' : '',
            rightIcon ? 'pr-10' : '',
            error
              ? 'border-danger focus:border-danger focus:ring-danger/20'
              : 'border-border focus:border-primary-500 focus:ring-primary-500/20',
            disabled ? 'opacity-60 cursor-not-allowed' : '',
            className,
          ]
            .join(' ')
            .trim()}
          {...rest}
        />

        {rightIcon ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary">{rightIcon}</span>
        ) : null}
      </div>

      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-sm text-danger" role="alert">
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path d="M12 3.5 2.7 20h18.6L12 3.5Zm0 5.5a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1Zm0 9a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" fill="currentColor" />
          </svg>
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
