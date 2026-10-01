'use client';

import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Link } from '@/i18n/navigation.ts';
import { Button, buttonVariants } from '@vorchain/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@vorchain/ui/components/sheet';
import { SiteNav } from './site-nav.tsx';

/**
 * Navigation drawer for screens below `md`. The dialog behaviour (focus trap, Escape, focus
 * returns to the menu button) comes from the Radix-based `Sheet`; links close it after navigating.
 */
export function MobileMenu() {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon-lg" className="md:hidden">
          <Menu aria-hidden="true" />
          <span className="sr-only">{t('menu')}</span>
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={t('menuClose')} aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{t('menuTitle')}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4">
          <SiteNav label={t('label')} orientation="column" onNavigate={close} />
          <Link
            href="/demo"
            onClick={close}
            className={buttonVariants({ size: 'lg', className: 'h-11 text-base' })}
          >
            {t('cta')}
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
