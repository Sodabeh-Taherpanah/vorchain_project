import { hasLocale, type Messages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import * as rootParams from 'next/root-params';

import { routing } from './routing.ts';

/**
 * Per-request i18n config for Server Components. The locale comes from the `[locale]` root param
 * (`next/root-params`), which keeps every page statically renderable without the legacy
 * `setRequestLocale` call in each layout and page (ADR-0004).
 */
export default getRequestConfig(async ({ locale }) => {
  const resolved = locale ?? (await rootParams.locale());
  if (!hasLocale(routing.locales, resolved)) {
    notFound();
  }
  const messages = (await import(`../../messages/${resolved}.json`)) as {
    default: Messages;
  };
  return { locale: resolved, messages: messages.default };
});
