import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '../lib/utils.ts';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap print:border-current [&>svg]:size-3 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-secondary-foreground',
        /** Amber: only for "hidden risk" (docs/design/README.md). */
        signal: 'bg-signal text-signal-foreground',
        critical: 'bg-critical text-critical-foreground',
        warning: 'bg-warning text-warning-foreground',
        ok: 'bg-ok text-ok-foreground',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

/** Short status label. Colour never carries the meaning alone: the text says it too. */
export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
