import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '../lib/utils.ts';
import { Container, type ContainerProps } from './container.tsx';

const sectionVariants = cva('scroll-mt-20', {
  variants: {
    tone: {
      default: '',
      muted: 'border-y bg-muted/50',
      inverted: 'bg-primary text-primary-foreground',
    },
    spacing: { default: 'py-16 sm:py-24', compact: 'py-10 sm:py-14' },
  },
  defaultVariants: { tone: 'default', spacing: 'default' },
});

export type SectionProps = ComponentProps<'section'> &
  VariantProps<typeof sectionVariants> & { readonly size?: ContainerProps['size'] };

/**
 * One full-width band of a page with the content in a `Container`. Name it with
 * `aria-labelledby` (pointing at its `SectionHeader` title) so it becomes a `region` landmark.
 */
export function Section({ className, tone, spacing, size, children, ...props }: SectionProps) {
  return (
    <section className={cn(sectionVariants({ tone, spacing }), className)} {...props}>
      <Container size={size}>{children}</Container>
    </section>
  );
}
