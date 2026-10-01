import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names and resolves Tailwind conflicts, last one wins (`cn('px-2', 'px-4')` is
 * `px-4`). Lets callers override a primitive's defaults through `className` (ADR-0013).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
