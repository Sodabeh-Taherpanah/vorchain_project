import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils.ts';

/** Centred page column with the site's side gutters (16 px on phones, 24 px from `sm`). */
export function Container({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6', className)} {...props} />;
}
