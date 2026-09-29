import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { routing } from '../../i18n/routing.ts';

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

  // Browser extensions (Grammarly, password managers, dark-mode tools) add attributes to <html> and
  // <body> before hydration. suppressHydrationWarning only covers these two elements' own
  // attributes, so real mismatches in the page content still surface.
  return (
    <html lang={locale} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
