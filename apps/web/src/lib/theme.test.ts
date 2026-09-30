import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nextOverride, resetTheme, resolveTheme, subscribeToTheme, toggleTheme } from './theme.ts';

/** jsdom has no matchMedia; this stub lets tests flip the OS colour scheme. */
function stubSystemScheme(prefersDark: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: prefersDark,
    addEventListener: (_type: 'change', listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: 'change', listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  );
  return {
    change(next: boolean) {
      query.matches = next;
      for (const listener of listeners) listener();
    },
    listenerCount: () => listeners.size,
  };
}

const root = () => document.documentElement;

beforeEach(() => {
  resetTheme();
  root().className = '';
});

afterEach(() => {
  resetTheme();
  root().className = '';
});

describe('resolveTheme', () => {
  it('follows the system when nothing is chosen', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('prefers an explicit choice over the system', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('nextOverride', () => {
  it('overrides with the opposite theme when it differs from the system', () => {
    expect(nextOverride('light', false)).toBe('dark');
    expect(nextOverride('dark', true)).toBe('light');
  });

  it('clears the override when toggling back to what the system prefers', () => {
    expect(nextOverride('dark', false)).toBeNull();
    expect(nextOverride('light', true)).toBeNull();
  });
});

describe('toggleTheme', () => {
  it('switches a light system to dark and back to following the system', () => {
    stubSystemScheme(false);

    expect(toggleTheme()).toBe('dark');
    expect(root().classList.contains('dark')).toBe(true);

    expect(toggleTheme()).toBe('light');
    expect(root().className).toBe('');
  });

  it('switches a dark system to light', () => {
    stubSystemScheme(true);

    expect(toggleTheme()).toBe('light');
    expect(root().classList.contains('light')).toBe(true);
  });

  it('keeps unrelated classes on <html> (font variables)', () => {
    stubSystemScheme(false);
    root().classList.add('font-plex-sans');

    toggleTheme();
    toggleTheme();

    expect(root().className).toBe('font-plex-sans');
  });

  it('stores nothing in the browser: no cookie, no localStorage', () => {
    stubSystemScheme(false);

    toggleTheme();

    expect(document.cookie).toBe('');
    expect(localStorage.length).toBe(0);
  });
});

describe('subscribeToTheme', () => {
  it('notifies on toggles and system changes, and unsubscribes cleanly', () => {
    const system = stubSystemScheme(false);
    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);

    toggleTheme();
    system.change(true);

    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    toggleTheme();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(system.listenerCount()).toBe(0);
  });
});
