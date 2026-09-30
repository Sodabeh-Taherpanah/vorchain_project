import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// `next/font` is a build-time transform that only works inside the Next.js compiler. In tests each
// font is a stand-in that exposes the same CSS-variable class names.
vi.mock('next/font/google', () => {
  const font = (options: { variable: string }) => ({
    className: 'font',
    variable: options.variable.replace(/^--/, ''),
    style: { fontFamily: 'font' },
  });
  return { IBM_Plex_Sans: font, IBM_Plex_Mono: font };
});

// jsdom has no matchMedia. Default: a light OS scheme that never changes; tests that need another
// scheme replace it with `vi.stubGlobal('matchMedia', ...)`.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) satisfies MediaQueryList;

// Vitest runs without globals, so Testing Library cannot register its automatic cleanup.
afterEach(() => {
  cleanup();
});
