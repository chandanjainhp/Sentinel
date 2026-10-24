export const THEME_COLORS = {
  primary50: 'primary-50',
  primary100: 'primary-100',
  primary200: 'primary-200',
  primary300: 'primary-300',
  primary400: 'primary-400',
  primary500: 'primary-500',
  primary600: 'primary-600',
  primary700: 'primary-700',
  primary800: 'primary-800',
  primary900: 'primary-900',
  surface: 'surface',
  surface2: 'surface-2',
  surface3: 'surface-3',
  border: 'border',
  textPrimary: 'text-primary',
  textSecondary: 'text-secondary',
  textMuted: 'text-muted',
  success: 'success',
  successLight: 'success-light',
  successText: 'success-text',
  warning: 'warning',
  warningLight: 'warning-light',
  warningText: 'warning-text',
  danger: 'danger',
  dangerLight: 'danger-light',
  dangerText: 'danger-text',
  info: 'info',
  infoLight: 'info-light',
  infoText: 'info-text',
};

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function getStoredTheme() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('theme-preference');
}

export function initTheme() {
  if (typeof window === 'undefined') return;

  const stored = getStoredTheme();
  if (stored === 'light' || stored === 'dark') {
    applyTheme(stored);
    return;
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}
