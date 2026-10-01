import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils.ts';

const calloutVariants = cva('flex gap-4 rounded-xl border border-l-4 bg-card p-5', {
  variants: {
    tone: {
      neutral: 'border-border',
      ok: 'border-ok',
      signal: 'border-signal',
      critical: 'border-critical',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

const iconVariants = cva('mt-0.5 shrink-0 [&>svg]:size-6', {
  variants: {
    tone: {
      neutral: 'text-muted-foreground',
      ok: 'text-ok',
      signal: 'text-signal-strong',
      critical: 'text-critical',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface CalloutProps extends VariantProps<typeof calloutVariants> {
  readonly title?: ReactNode;
  /** Decorative icon (hidden from assistive technology). */
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Highlighted note next to the main content, e.g. the privacy promise (`role="note"`). */
export function Callout({ title, icon, tone, children, className }: CalloutProps) {
  return (
    <div role="note" className={cn(calloutVariants({ tone }), className)}>
      {icon !== undefined && (
        <span aria-hidden="true" className={iconVariants({ tone })}>
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-2">
        {title !== undefined && <p className="font-semibold">{title}</p>}
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
