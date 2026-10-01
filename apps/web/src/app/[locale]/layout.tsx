import type { Metadata, Viewport } from 'next';
import { hasLocale, type Messages, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import '../globals.css';

import { MAIN_CONTENT_ID, SkipLink } from '@/components/layout/skip-link.tsx';
import { SiteFooter } from '@/components/layout/site-footer.tsx';
import { SiteHeader } from '@/components/layout/site-header.tsx';
import { routing } from '@/i18n/routing.ts';
import { fontVariables } from '@/lib/fonts.ts';

// Only the configured locales exist; any other `[locale]` value is a 404 at the edge of the tree.
export const dynamicParams = false;

/** Prerenders every page once per locale (static generation, ADR-0004). */
export function generateStaticParams(): { locale: string }[] {
  return routing.locales.map((locale) => ({ locale }));
}

// Site-wide defaults; per-page metadata, canonical URLs and hreflang tags follow in P1-23.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return { title: t('title'), description: t('description') };
}

/** Browser UI colour follows the page background in both schemes (tokens in globals.css). */
export const viewport: Viewport = {
  colorScheme: 'light dark',
};

/**
 * Message namespaces used by Client Components. Only these are serialized into the page, so the
 * HTML does not carry the whole catalog.
 */
const CLIENT_NAMESPACES = [
  'nav',
  'localeSwitcher',
  'theme',
  'error',
] as const satisfies (keyof Messages)[];

function pickClientMessages(
  messages: Messages,
): Pick<Messages, (typeof CLIENT_NAMESPACES)[number]> {
  return Object.fromEntries(
    CLIENT_NAMESPACES.map((namespace) => [namespace, messages[namespace]]),
  ) as Pick<Messages, (typeof CLIENT_NAMESPACES)[number]>;
}

interface LocaleLayoutProps {
  readonly children: ReactNode;
  readonly params: Promise<{ locale: string }>;
}

/** Root layout: the `[locale]` segment owns `<html>`, so `lang` always matches the URL. */
export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const messages = await getMessages();

  // Browser extensions (Grammarly, password managers, dark-mode tools) add attributes to <html> and
  // <body> before hydration. suppressHydrationWarning only covers these two elements' own
  // attributes, so real mismatches in the page content still surface. The theme toggle also changes
  // the class on <html> at runtime on purpose.
  return (
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <body suppressHydrationWarning className="flex flex-col">
        <NextIntlClientProvider locale={locale} messages={pickClientMessages(messages)}>
          <SkipLink />
          <SiteHeader />
          <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
