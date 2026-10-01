import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { cn } from '../lib/utils.ts';
import { Card, CardTitle } from './card.tsx';

const featureCardVariants = cva('@container h-full', {
  variants: { tone: { default: '', signal: 'border-signal' } },
  defaultVariants: { tone: 'default' },
});

export interface FeatureCardProps extends VariantProps<typeof featureCardVariants> {
  readonly title: ReactNode;
  /** Decorative icon (hidden from assistive technology), e.g. a lucide icon. */
  readonly icon?: ReactNode;
  readonly headingLevel?: 'h3' | 'h4';
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * Icon, title and short text for a benefit or a step. Icon and text sit side by side once the
 * card itself is wide enough (container query), whatever grid it is placed in.
 */
export function FeatureCard({
  title,
  icon,
  headingLevel = 'h3',
  tone,
  children,
  className,
}: FeatureCardProps) {
  return (
    <Card className={cn(featureCardVariants({ tone }), className)}>
      <div className="flex flex-col gap-4 @sm:flex-row">
        {icon !== undefined && (
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&>svg]:size-5"
          >
            {icon}
          </span>
        )}
        <div className="flex flex-col gap-2">
          <CardTitle as={headingLevel}>{title}</CardTitle>
          {children !== undefined && <div className="text-muted-foreground">{children}</div>}
        </div>
      </div>
    </Card>
  );
}
