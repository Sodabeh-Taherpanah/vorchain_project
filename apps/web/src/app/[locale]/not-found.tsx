import { useTranslations } from 'next-intl';

import { StatusPage } from '@/components/layout/status-page.tsx';
import { buttonVariants } from '@vorchain/ui/components/button';
import { Link } from '@/i18n/navigation.ts';

/**
 * Localized 404 inside the site layout. Rendered for unknown paths under a locale (via the
 * `[...rest]` catch-all) and for any `notFound()` call in a page. Next.js adds `noindex`.
 */
export default function NotFound() {
  const t = useTranslations('notFound');

  return (
    <StatusPage
      code={t('code')}
      title={t('title')}
      description={t('description')}
      illustration="not-found"
    >
      <Link href="/" className={buttonVariants({ size: 'lg' })}>
        {t('home')}
      </Link>
      <Link href="/demo" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
        {t('demo')}
      </Link>
    </StatusPage>
  );
}
