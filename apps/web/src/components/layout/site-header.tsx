import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation.ts';

import { Container } from './container.tsx';
import { LocaleSwitcher } from './locale-switcher.tsx';
import { ThemeToggle } from './theme-toggle.tsx';

const NAV_LINK =
  'inline-flex h-9 items-center rounded-md px-2 text-sm font-medium text-muted-foreground ' +
  'transition-colors hover:bg-accent hover:text-accent-foreground';

/**
 * Site header: wordmark, main navigation, locale switcher and theme toggle. Below `sm` the
 * navigation moves to a second row, so everything fits a 360 px screen without a menu button.
 */
export function SiteHeader() {
  const t = useTranslations();

  return (
    <header className="border-b bg-background print:hidden">
      <Container className="flex flex-wrap items-center gap-x-6 gap-y-1 py-2">
        <Link
          href="/"
          aria-label={t('site.home')}
          className="inline-flex h-9 items-center gap-2 rounded-md text-lg font-semibold tracking-tight"
        >
          <span aria-hidden="true" className="size-3 rounded-xs bg-signal" />
          {t('site.name')}
        </Link>
        <nav aria-label={t('nav.label')} className="order-last w-full sm:order-none sm:w-auto">
          <ul className="-ml-2 flex items-center gap-1 sm:ml-0">
            <li>
              <Link href="/demo" className={NAV_LINK}>
                {t('nav.demo')}
              </Link>
            </li>
            <li>
              <Link href="/kontakt" className={NAV_LINK}>
                {t('nav.contact')}
              </Link>
            </li>
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </Container>
    </header>
  );
}
