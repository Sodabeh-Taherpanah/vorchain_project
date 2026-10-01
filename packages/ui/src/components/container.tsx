import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '../lib/utils.ts';

const containerVariants = cva('mx-auto w-full px-4 sm:px-6', {
  variants: {
    size: { default: 'max-w-6xl', narrow: 'max-w-3xl', wide: 'max-w-7xl' },
  },
  defaultVariants: { size: 'default' },
});

export type ContainerProps = ComponentProps<'div'> & VariantProps<typeof containerVariants>;

/**
 * Centred page column with the site's side gutters (16 px on phones, 24 px from `sm`). `narrow`
 * suits running text (legal pages, forms), `wide` dense tables.
 */
export function Container({ className, size, ...props }: ContainerProps) {
  return <div className={cn(containerVariants({ size }), className)} {...props} />;
}
