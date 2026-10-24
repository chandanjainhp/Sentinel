import Spinner from '@/components/ui/Spinner';

const variantClasses = {
  primary:
    'bg-primary-600 text-white border border-primary-600 hover:bg-primary-700 focus-visible:ring-primary-500',
  secondary:
    'bg-surface-2 text-text-primary border border-border hover:bg-surface-3 focus-visible:ring-primary-500',
  outline:
    'bg-transparent text-primary-600 border border-primary-600 hover:bg-primary-50 focus-visible:ring-primary-500',
  ghost:
    'bg-transparent text-text-secondary border border-transparent hover:bg-surface-2 focus-visible:ring-primary-500',
  danger:
    'bg-danger text-white border border-danger hover:bg-danger/90 focus-visible:ring-danger',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loadingText,
  disabled = false,
  onClick,
  type = 'button',
  className = '',
  ...rest
}) {
  const resolvedVariant = variantClasses[variant] || variantClasses.primary;
  const resolvedSize = sizeClasses[size] || sizeClasses.md;
  const isDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={[
        'inline-flex items-center justify-center rounded-md font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        resolvedVariant,
        resolvedSize,
        className,
      ]
        .join(' ')
        .trim()}
      {...rest}
    >
      {isLoading ? (
        <span className="inline-flex items-center gap-2">
          <Spinner size="sm" color="currentColor" />
          {loadingText ? <span>{loadingText}</span> : null}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
