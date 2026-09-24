const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

export default function Spinner({ size = 'md', color = 'currentColor', className = '' }) {
  const resolvedSize = sizeClasses[size] || sizeClasses.md;

  return (
    <svg
      viewBox="0 0 24 24"
      className={`animate-spin ${resolvedSize} ${className}`.trim()}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke={color} strokeOpacity="0.25" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}
