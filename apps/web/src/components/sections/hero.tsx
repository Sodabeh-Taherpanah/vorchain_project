import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@vorchain/ui/components/button';
import { Link } from '@/i18n/navigation.ts';

import { Container } from '@vorchain/ui/components/container';
import { HOW_IT_WORKS_ID } from './how-it-works-section.tsx';

const HEADING_ID = 'hero-heading';

/** Opening section: the problem in one line, the page's only `h1`, and the way into the demo. */
export function Hero() {
  const t = useTranslations('home');

  return (
    <section aria-labelledby={HEADING_ID} className="border-b py-16 sm:py-24">
      <Container>
        <p className="font-mono text-sm font-medium text-signal-strong">{t('hero.eyebrow')}</p>
        <h1
          id={HEADING_ID}
          className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl"
        >
          {t('title')}
        </h1>
        <p className="mt-4 max-w-prose text-lg text-muted-foreground">{t('tagline')}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/demo" className={buttonVariants({ size: 'lg', className: 'h-11 px-4' })}>
            {t('hero.cta')}
            <ArrowRight aria-hidden="true" />
          </Link>
          <a
            href={`#${HOW_IT_WORKS_ID}`}
            className={buttonVariants({ variant: 'outline', size: 'lg', className: 'h-11 px-4' })}
          >
            {t('hero.secondary')}
          </a>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{t('hero.note')}</p>
      </Container>
    </section>
  );
}
