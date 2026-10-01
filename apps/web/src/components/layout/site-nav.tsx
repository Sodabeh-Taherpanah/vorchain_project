'use client';

import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation.ts';
import { cn } from '@vorchain/ui/lib/utils';

const ITEMS = [
  { href: '/demo', labelKey: 'demo' },
  { href: '/kontakt', labelKey: 'contact' },
] as const;

interface SiteNavProps {
  /** Accessible name of the navigation landmark (already translated). */
  readonly label: string;
  /** Stacks the links for the mobile menu. */
  readonly orientation?: 'row' | 'column';
  /** Called after a link was followed, so a surrounding menu can close itself. */
  readonly onNavigate?: () => void;
}

/** True for the route itself and anything below it (`/demo` is current on `/demo/...`). */
function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Main navigation links with a clear current-page state (`aria-current="page"`, shown as a filled
 * background). A client component only because the current route comes from `usePathname`.
 */
export function SiteNav({ label, orientation = 'row', onNavigate }: SiteNavProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav aria-label={label}>
      <ul className={cn('flex gap-1', orientation === 'column' ? 'flex-col' : 'items-center')}>
        {ITEMS.map(({ href, labelKey }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={isCurrent(pathname, href) ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(
                'inline-flex items-center rounded-lg px-3 text-sm font-medium text-muted-foreground',
                'transition-colors hover:bg-muted hover:text-foreground',
                'aria-[current=page]:bg-muted aria-[current=page]:text-foreground',
                orientation === 'column' ? 'h-11 w-full text-base' : 'h-9',
              )}
            >
              {t(labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
