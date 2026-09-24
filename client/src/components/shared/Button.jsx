import Link from 'next/link';

const baseClasses =
  'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50';

const variantClasses = {
  primary: 'bg-primary text-white hover:bg-primary-hover border border-primary',
  outline: 'bg-transparent text-text-primary border border-border hover:bg-surface-2 dark:hover:bg-surface-3',
  ghost: 'bg-transparent text-text-primary border border-transparent hover:bg-surface-2 dark:hover:bg-surface-3',
};

export default function Button({
  href,
  variant = 'primary',
  className = '',
  children,
  ...props
}) {
  const resolvedVariant = variantClasses[variant] || variantClasses.primary;
  const classes = `${baseClasses} ${resolvedVariant} ${className}`.trim();

  if (href) {
    return (
      <Link href={href} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
