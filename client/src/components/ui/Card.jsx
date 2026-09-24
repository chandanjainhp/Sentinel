const paddingClasses = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

const shadowClasses = {
  none: 'shadow-none',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
};

export default function Card({
  children,
  className = '',
  padding = 'md',
  shadow = 'none',
  border = true,
  ...props
}) {
  const resolvedPadding = paddingClasses[padding] || paddingClasses.md;
  const resolvedShadow = shadowClasses[shadow] || shadowClasses.none;

  return (
    <section
      className={[
        'rounded-lg bg-surface-2 transition-colors duration-150',
        border ? 'border border-border' : 'border border-transparent',
        resolvedPadding,
        resolvedShadow,
        className,
      ]
        .join(' ')
        .trim()}
      {...props}
    >
      {children}
    </section>
  );
}
