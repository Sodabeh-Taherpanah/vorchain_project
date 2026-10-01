import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation.ts';

import { buttonVariants } from '@vorchain/ui/components/button';
import { Container } from '@vorchain/ui/components/container';
import { Logo } from '@vorchain/ui/components/logo';
import { LocaleSwitcher } from './locale-switcher.tsx';
import { MobileMenu } from './mobile-menu.tsx';
import { SiteNav } from './site-nav.tsx';
import { ThemeToggle } from './theme-toggle.tsx';

/**
 * Sticky site header: logo, main navigation (from `md`; below it the menu button opens a drawer),
 * locale switcher, theme toggle and the primary "start the demo" button. At 360 px only logo,
 * locale, theme and menu button are visible, which fits without wrapping.
 */
export function SiteHeader() {
  const t = useTranslations();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur print:static print:hidden">
      <Container className="flex h-14 items-center gap-x-4 sm:gap-x-6">
        <Link
          href="/"
          aria-label={t('site.home')}
          className="inline-flex h-9 items-center rounded-lg"
        >
          <Logo name={t('site.name')} size="sm" />
        </Link>
        <div className="hidden md:block">
          <SiteNav label={t('nav.label')} />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
          <Link
            href="/demo"
            className={buttonVariants({
              size: 'lg',
              className: 'ml-2 hidden h-9 px-4 md:inline-flex',
            })}
          >
            {t('nav.cta')}
          </Link>
          <MobileMenu />
        </div>
      </Container>
    </header>
  );
}
