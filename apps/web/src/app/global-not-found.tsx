import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import './globals.css';

import { Container } from '@vorchain/ui/components/container';
import { buttonVariants } from '@vorchain/ui/components/button';
import { Logo } from '@vorchain/ui/components/logo';
import { StatusIllustration } from '@/components/layout/status-illustration.tsx';
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
          <Container className="grid gap-12 py-10 sm:py-16">
            <Link href="/de" className="inline-flex w-fit rounded-lg">
              <Logo name="Vorchain" />
            </Link>
            <StatusIllustration kind="not-found" className="max-w-48" />
            <section>
              <p className="font-mono text-sm font-medium text-muted-foreground">{de('code')}</p>
              <h1 className="mt-3 font-heading text-title font-semibold text-balance">
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
