import { defineRouting } from 'next-intl/routing';

/**
 * Locale routing (ADR-0004): German first, English second, every URL carries its locale prefix.
 * Keys of `pathnames` are the internal routes (the folder names under `src/app/[locale]`);
 * values are the public, localized slugs.
 */
export const routing = defineRouting({
  locales: ['de', 'en'],
  defaultLocale: 'de',
  localePrefix: 'always',
  pathnames: {
    '/': '/',
    '/demo': '/demo',
    '/kontakt': { de: '/kontakt', en: '/contact' },
    '/impressum': { de: '/impressum', en: '/legal-notice' },
    '/datenschutz': { de: '/datenschutz', en: '/privacy' },
  },
});
