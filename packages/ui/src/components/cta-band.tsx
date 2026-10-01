import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils.ts';
import { Container } from './container.tsx';

const ctaBandVariants = cva('scroll-mt-20 py-16 sm:py-20', {
  variants: {
    tone: {
      primary: 'bg-primary text-primary-foreground',
      muted: 'border-y bg-muted/50',
    },
  },
  defaultVariants: { tone: 'primary' },
});

export interface CtaBandProps extends VariantProps<typeof ctaBandVariants> {
  /** Anchor target; also the base of the heading id that names the region. */
  readonly id: string;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Buttons or links; on `primary`, use `secondary` buttons so they stand out. */
  readonly actions?: ReactNode;
  readonly className?: string;
}

/** Full-width closing call to action: heading, one sentence and the actions. */
export function CtaBand({ id, title, description, actions, tone, className }: CtaBandProps) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(ctaBandVariants({ tone }), className)}
    >
      <Container className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-2xl flex-col gap-3">
          <h2 id={headingId} className="font-heading text-title font-semibold text-balance">
            {title}
          </h2>
          {description !== undefined && <p className="text-lead opacity-90">{description}</p>}
        </div>
        {actions !== undefined && <div className="flex flex-wrap gap-3">{actions}</div>}
      </Container>
    </section>
  );
}
