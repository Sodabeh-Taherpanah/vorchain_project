import type { ComponentProps } from 'react';

import { cn } from '../lib/utils.ts';

/** Raised surface that groups related content. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-xs',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="card-header" className={cn('flex flex-col gap-1.5', className)} {...props} />
  );
}

export function CardTitle({
  className,
  as: Heading = 'h3',
  ...props
}: ComponentProps<'h3'> & { readonly as?: 'h2' | 'h3' | 'h4' }) {
  return (
    <Heading
      data-slot="card-title"
      className={cn('font-heading text-heading font-semibold', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('text-sm', className)} {...props} />;
}
