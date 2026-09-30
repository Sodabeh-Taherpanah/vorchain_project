/**
 * Colour scheme handling. The CSS in `globals.css` follows `prefers-color-scheme` on its own, so the
 * first paint is always right without any script (no flash). This module only adds an explicit
 * override (`.light` / `.dark` on <html>) when the visitor toggles.
 *
 * The override lives in memory only: no cookie, no `localStorage`. It survives client-side
 * navigation (the root layout stays mounted) and resets to the system scheme on a full reload.
 * Remembering the choice across visits is an open owner decision (P1-13 PR).
 */

export type Theme = 'light' | 'dark';

const THEME_CLASSES: readonly Theme[] = ['light', 'dark'];
const DARK_QUERY = '(prefers-color-scheme: dark)';

let override: Theme | null = null;
const listeners = new Set<() => void>();

/** The theme on screen: an explicit choice wins, otherwise the system decides. */
export function resolveTheme(chosen: Theme | null, systemPrefersDark: boolean): Theme {
  return chosen ?? (systemPrefersDark ? 'dark' : 'light');
}

/**
 * The override after a toggle from `current`: the opposite theme, or `null` ("follow the system
 * again") when the opposite is what the system prefers anyway.
 */
export function nextOverride(current: Theme, systemPrefersDark: boolean): Theme | null {
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  return next === resolveTheme(null, systemPrefersDark) ? null : next;
}

export function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

function applyOverride(theme: Theme | null): void {
  const { classList } = document.documentElement;
  classList.remove(...THEME_CLASSES);
  if (theme !== null) {
    classList.add(theme);
  }
}

export function currentTheme(): Theme {
  return resolveTheme(override, systemPrefersDark());
}

/** Flips the visible theme for this page session and returns the new visible theme. */
export function toggleTheme(): Theme {
  override = nextOverride(currentTheme(), systemPrefersDark());
  applyOverride(override);
  for (const listener of listeners) listener();
  return currentTheme();
}

/** Drops any override so the page follows the system again (used by tests). */
export function resetTheme(): void {
  override = null;
  applyOverride(null);
}

/**
 * Calls `onChange` whenever the visible theme may have changed: a toggle or an OS scheme switch.
 * Returns the unsubscribe function (`useSyncExternalStore` contract).
 */
export function subscribeToTheme(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  listeners.add(onChange);
  return () => {
    media.removeEventListener('change', onChange);
    listeners.delete(onChange);
  };
}
