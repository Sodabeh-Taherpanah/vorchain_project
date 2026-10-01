import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../lib/utils.ts';

const valueVariants = cva('font-mono text-title font-semibold tabular-nums', {
  variants: {
    tone: {
      default: 'text-foreground',
      signal: 'text-signal-strong',
      critical: 'text-critical',
      ok: 'text-ok',
    },
  },
  defaultVariants: { tone: 'default' },
});

/** Description list that holds `Stat`s; a responsive grid by default. */
export function StatGroup({ className, ...props }: ComponentProps<'dl'>) {
  return <dl className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-4', className)} {...props} />;
}

export interface StatProps extends VariantProps<typeof valueVariants> {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly hint?: ReactNode;
  readonly className?: string;
}

/** One key figure: label (`dt`) and value (`dd`) in tabular numbers. Use inside `StatGroup`. */
export function Stat({ label, value, hint, tone, className }: StatProps) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-xl border bg-card p-4', className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={valueVariants({ tone })}>{value}</dd>
      {hint !== undefined && <dd className="text-sm text-muted-foreground">{hint}</dd>}
    </div>
  );
}
