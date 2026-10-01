import { ExternalLink, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PRIVACY_TEST_URL } from '@/lib/site.ts';

import { Section } from './section.tsx';

/** The privacy promise, with a link to the automated test that enforces it. */
export function PrivacySection() {
  const t = useTranslations('home.privacy');

  return (
    <Section id="privacy" title={t('title')}>
      <div className="mt-6 flex max-w-3xl gap-4">
        <ShieldCheck aria-hidden="true" className="mt-1 size-6 shrink-0 text-ok" />
        <div className="space-y-3">
          <p className="text-lg">{t('text')}</p>
          <p className="text-muted-foreground">{t('proof')}</p>
          <a
            href={PRIVACY_TEST_URL}
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-1 rounded-md font-medium underline underline-offset-4 hover:text-muted-foreground"
          >
            {t('proofLink')}
            <ExternalLink aria-hidden="true" className="size-4" />
            <span className="sr-only">{t('external')}</span>
          </a>
        </div>
      </div>
    </Section>
  );
}
