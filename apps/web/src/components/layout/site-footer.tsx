import { ExternalLink, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId } from 'react';

import { Link } from '@/i18n/navigation.ts';
import { GITHUB_URL } from '@/lib/site.ts';

import { Container } from '@vorchain/ui/components/container';
import { Logo } from '@vorchain/ui/components/logo';

const FOOTER_LINK =
  'inline-flex min-h-9 items-center gap-1 rounded-md text-sm text-muted-foreground ' +
  'underline-offset-4 hover:text-foreground hover:underline';

/**
 * A titled link list. The title is a paragraph, not a heading: footer columns would otherwise add
 * h2s to every page's outline, and the list is named through `aria-labelledby` anyway.
 */
function FooterColumn({ heading, children }: { heading: string; children: ReactNode }) {
  const id = useId();
  return (
    <div>
      <p
        id={id}
        className="font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {heading}
      </p>
      <ul aria-labelledby={id} className="mt-3 flex flex-col">
        {children}
      </ul>
    </div>
  );
}

/**
 * Site footer: brand with the privacy promise, then link columns for product, legal pages
 * (Impressum, Datenschutz: required in Germany) and the public source code.
 */
export function SiteFooter() {
  const t = useTranslations();

  return (
    <footer className="border-t bg-muted print:hidden">
      <Container className="grid gap-10 py-10 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:py-14">
        <div className="flex flex-col gap-4">
          <Link href="/" aria-label={t('site.home')} className="inline-flex w-fit rounded-lg">
            <Logo name={t('site.name')} />
          </Link>
          <p className="max-w-xs text-sm text-muted-foreground">{t('footer.tagline')}</p>
          <p className="inline-flex items-start gap-2 text-sm font-medium">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ok" />
            {t('footer.promise')}
          </p>
        </div>
        <nav aria-label={t('footer.label')} className="grid gap-8 sm:grid-cols-3">
          <FooterColumn heading={t('footer.productHeading')}>
            <li>
              <Link href="/demo" className={FOOTER_LINK}>
                {t('nav.demo')}
              </Link>
            </li>
            <li>
              <Link href="/kontakt" className={FOOTER_LINK}>
                {t('nav.contact')}
              </Link>
            </li>
          </FooterColumn>
          <FooterColumn heading={t('footer.legalHeading')}>
            <li>
              <Link href="/impressum" className={FOOTER_LINK}>
                {t('footer.legalNotice')}
              </Link>
            </li>
            <li>
              <Link href="/datenschutz" className={FOOTER_LINK}>
                {t('footer.privacy')}
              </Link>
            </li>
          </FooterColumn>
          <FooterColumn heading={t('footer.projectHeading')}>
            <li>
              <a href={GITHUB_URL} rel="noopener noreferrer" className={FOOTER_LINK}>
                {t('footer.github')}
                <ExternalLink aria-hidden="true" className="size-3.5" />
                <span className="sr-only">{t('footer.external')}</span>
              </a>
            </li>
          </FooterColumn>
        </nav>
      </Container>
    </footer>
  );
}
