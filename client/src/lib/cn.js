/**
 * `cn` — Tailwind-aware className merge.
 *
 * Combines clsx (conditional class objects/arrays) with tailwind-merge
 * (dedupes conflicting Tailwind utilities, last-wins).
 *
 * Usage:
 *   cn('px-2 py-1', isActive && 'bg-accent', 'px-4')  // -> 'py-1 bg-accent px-4'
 */
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default cn;
