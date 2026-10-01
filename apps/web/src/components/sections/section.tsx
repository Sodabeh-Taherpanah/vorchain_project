import type { ReactNode } from 'react';

import { cn } from '@/lib/utils.ts';

import { Container } from '../layout/container.tsx';

interface SectionProps {
  /** Anchor target and the base of the heading id that labels the region landmark. */
  readonly id: string;
  /** Already translated section heading, rendered as an `h2`. */
  readonly title: string;
  readonly children: ReactNode;
  /** Extra classes for the full-width band, e.g. a muted background. */
  readonly className?: string;
}

/** One landing-page section: a labelled `region` landmark with an `h2` inside the page column. */
export function Section({ id, title, children, className }: SectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn('scroll-mt-20 py-16 sm:py-20', className)}
    >
      <Container>
        <h2
          id={headingId}
          className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
        >
          {title}
        </h2>
        {children}
      </Container>
    </section>
  );
}
