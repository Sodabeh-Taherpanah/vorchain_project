'use client';

import { useLocale, useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation.ts';
import { routing } from '@/i18n/routing.ts';
import { cn } from '@vorchain/ui/lib/utils';

/**
 * Links to the current page in every locale (`/de/kontakt` <-> `/en/contact`). Plain links rather
 * than a menu: they work without JavaScript, crawlers follow them and the keyboard needs nothing
 * special. Each name is written in its own language, as users look for their own language.
 */
export function LocaleSwitcher() {
  const t = useTranslations('localeSwitcher');
  const current = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')}>
      <ul className="flex items-center gap-1 text-sm">
        {routing.locales.map((locale) => (
          <li key={locale}>
            <Link
              href={pathname}
              locale={locale}
              hrefLang={locale}
              lang={locale}
              aria-current={locale === current ? 'true' : undefined}
              className={cn(
                'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 font-medium',
                'text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                'aria-[current=true]:text-foreground aria-[current=true]:underline',
                'aria-[current=true]:decoration-foreground aria-[current=true]:decoration-2',
                'aria-[current=true]:underline-offset-4',
              )}
            >
              <span aria-hidden="true">{locale.toUpperCase()}</span>
              <span className="sr-only">{t(locale)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
