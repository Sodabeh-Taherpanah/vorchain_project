import { useTranslations } from 'next-intl';

import { buttonVariants } from '@vorchain/ui/components/button';
import { Link } from '@/i18n/navigation.ts';

import { Section } from './section.tsx';

/** Closing call to action: leads to the contact page (`/de/kontakt`, `/en/contact`). */
export function ContactCtaSection() {
  const t = useTranslations('home.cta');

  return (
    <Section id="contact" title={t('title')}>
      <p className="mt-4 max-w-prose text-lg text-muted-foreground">{t('text')}</p>
      <Link href="/kontakt" className={buttonVariants({ size: 'lg', className: 'mt-8 h-11 px-4' })}>
        {t('button')}
      </Link>
    </Section>
  );
}
