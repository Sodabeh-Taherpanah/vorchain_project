'use client';

import { useTranslations } from 'next-intl';

import { StatusPage } from '@/components/layout/status-page.tsx';
import { Button, buttonVariants } from '@vorchain/ui/components/button';
import { Link } from '@/i18n/navigation.ts';

interface ErrorPageProps {
  readonly error: Error & { digest?: string };
  /** Re-fetches and re-renders the failed segment (Next.js 16.3 `retry`). */
  readonly retry: () => void;
}

/**
 * Localized error boundary for every page below the root layout. It shows only the error digest
 * (a hash that matches the server log), never the message, which could contain internal details.
 * Nothing is reported anywhere: Phase 1 has no error tracking (privacy by design).
 */
export default function ErrorPage({ error, retry }: ErrorPageProps) {
  const t = useTranslations('error');

  return (
    <StatusPage
      code={t('code')}
      title={t('title')}
      description={t('description')}
      footnote={error.digest === undefined ? undefined : t('reference', { digest: error.digest })}
    >
      <Button type="button" size="lg" onClick={retry}>
        {t('retry')}
      </Button>
      <Link href="/" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
        {t('home')}
      </Link>
    </StatusPage>
  );
}
