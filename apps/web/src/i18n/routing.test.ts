import { describe, expect, it } from 'vitest';

import { routing } from './routing.ts';

describe('routing', () => {
  it('serves German by default and English second, always with a locale prefix', () => {
    expect(routing.locales).toEqual(['de', 'en']);
    expect(routing.defaultLocale).toBe('de');
    expect(routing.localePrefix).toBe('always');
  });

  it('sets no locale cookie, because the URL prefix already carries the locale', () => {
    expect(routing.localeCookie).toBe(false);
  });

  it.each([
    ['/', '/', '/'],
    ['/demo', '/demo', '/demo'],
    ['/kontakt', '/kontakt', '/contact'],
    ['/impressum', '/impressum', '/legal-notice'],
    ['/datenschutz', '/datenschutz', '/privacy'],
  ] as const)('maps %s to /de%s and /en%s', (internal, dePath, enPath) => {
    const localized = routing.pathnames[internal];
    const perLocale = typeof localized === 'string' ? { de: localized, en: localized } : localized;

    expect(perLocale).toEqual({ de: dePath, en: enPath });
  });
});
