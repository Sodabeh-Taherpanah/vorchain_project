import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import './globals.css';

import { Container } from '@/components/layout/container.tsx';
import { buttonVariants } from '@/components/ui/button.tsx';
import { fontVariables } from '@/lib/fonts.ts';

/*
 * 404 for URLs that match no route at all and carry no locale, e.g. `/missing.png` (the proxy
 * skips paths with a file extension, so they never get a locale prefix). Next.js renders this file
 * instead of the root layout (`experimental.globalNotFound`), so it brings its own <html>, styles,
 * fonts and colour scheme (CSS only). Without a locale it answers in German first and English second.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'de', namespace: 'notFound' });
  return { title: t('title') };
}

export default async function GlobalNotFound() {
  const [de, en] = await Promise.all([
    getTranslations({ locale: 'de', namespace: 'notFound' }),
    getTranslations({ locale: 'en', namespace: 'notFound' }),
  ]);

  return (
    <html lang="de" className={fontVariables} suppressHydrationWarning>
      <body className="min-h-dvh">
        <main>
          <Container className="grid gap-12 py-16 sm:py-24">
            <section>
              <p className="font-mono text-sm font-medium text-signal-strong">{de('code')}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                {de('title')}
              </h1>
              <p className="mt-4 max-w-prose text-muted-foreground">{de('description')}</p>
              <Link href="/de" className={buttonVariants({ size: 'lg', className: 'mt-6' })}>
                {de('home')}
              </Link>
            </section>
            <section lang="en">
              <h2 className="text-xl font-semibold tracking-tight">{en('title')}</h2>
              <p className="mt-2 max-w-prose text-muted-foreground">{en('description')}</p>
              <Link
                href="/en"
                className={buttonVariants({ variant: 'outline', size: 'lg', className: 'mt-6' })}
              >
                {en('home')}
              </Link>
            </section>
          </Container>
        </main>
      </body>
    </html>
  );
}
