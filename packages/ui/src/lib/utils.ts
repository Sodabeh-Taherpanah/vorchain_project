import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** Fluid type steps from theme.css; without this, `text-title` would count as a text colour. */
const FLUID_TEXT_STEPS = ['display', 'title', 'heading', 'lead'];

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: FLUID_TEXT_STEPS }] } },
});

/**
 * Joins class names and resolves Tailwind conflicts, last one wins (`cn('px-2', 'px-4')` is
 * `px-4`). Lets callers override a primitive's defaults through `className` (ADR-0013).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
