import type de from '../../messages/de.json';
import type { routing } from './routing.ts';

// Type-safe locales and message keys for next-intl: `t('home.titel')` fails to compile.
// German is the source catalog; the parity test keeps English in sync.
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof de;
  }
}
