import { ExternalLink, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation.ts';
import { GITHUB_URL } from '@/lib/site.ts';

import { Container } from './container.tsx';

const FOOTER_LINK =
  'inline-flex min-h-9 items-center gap-1 rounded-md text-sm text-muted-foreground ' +
  'underline-offset-4 hover:text-foreground hover:underline';

/** Site footer: the privacy promise and the legally required links (Impressum, Datenschutz). */
export function SiteFooter() {
  const t = useTranslations('footer');

  return (
    <footer className="border-t bg-muted">
      <Container className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-ok" />
          {t('promise')}
        </p>
        <nav aria-label={t('label')}>
          <ul className="flex flex-wrap gap-x-6 gap-y-1">
            <li>
              <Link href="/impressum" className={FOOTER_LINK}>
                {t('legalNotice')}
              </Link>
            </li>
            <li>
              <Link href="/datenschutz" className={FOOTER_LINK}>
                {t('privacy')}
              </Link>
            </li>
            <li>
              <a href={GITHUB_URL} rel="noopener noreferrer" className={FOOTER_LINK}>
                {t('github')}
                <ExternalLink aria-hidden="true" className="size-3.5" />
                <span className="sr-only">{t('external')}</span>
              </a>
            </li>
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
