import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils.ts';

const headerVariants = cva('flex max-w-3xl flex-col gap-3', {
  variants: { align: { start: '', center: 'mx-auto items-center text-center' } },
  defaultVariants: { align: 'start' },
});

const titleVariants = cva('font-heading font-semibold text-balance', {
  variants: { size: { default: 'text-title', display: 'text-display' } },
  defaultVariants: { size: 'default' },
});

export interface SectionHeaderProps
  extends VariantProps<typeof headerVariants>, VariantProps<typeof titleVariants> {
  readonly title: ReactNode;
  /** Short kicker above the title, e.g. a step number or topic. */
  readonly eyebrow?: ReactNode;
  readonly description?: ReactNode;
  /** Heading level; one `h1` per page, sections use `h2`. */
  readonly as?: 'h1' | 'h2' | 'h3';
  /** Id of the heading, for the section's `aria-labelledby`. */
  readonly titleId?: string;
  readonly className?: string;
}

/** Eyebrow, heading and lead text that open a section. */
export function SectionHeader({
  title,
  eyebrow,
  description,
  as: Heading = 'h2',
  titleId,
  align,
  size,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn(headerVariants({ align }), className)}>
      {eyebrow !== undefined && (
        <p className="font-mono text-sm font-medium tracking-wide text-muted-foreground uppercase">
          {eyebrow}
        </p>
      )}
      <Heading id={titleId} className={titleVariants({ size })}>
        {title}
      </Heading>
      {description !== undefined && (
        <p className="max-w-prose text-lead text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
