import { Section as SectionBand } from '@vorchain/ui/components/section';
import { SectionHeader } from '@vorchain/ui/components/section-header';
import type { ReactNode } from 'react';

interface SectionProps {
  /** Anchor target and the base of the heading id that labels the region landmark. */
  readonly id: string;
  /** Already translated section heading, rendered as an `h2`. */
  readonly title: string;
  readonly children: ReactNode;
  /** Extra classes for the full-width band. */
  readonly className?: string;
}

/** One landing-page section: a labelled `region` landmark with an `h2` inside the page column. */
export function Section({ id, title, children, className }: SectionProps) {
  const headingId = `${id}-heading`;
  return (
    <SectionBand id={id} aria-labelledby={headingId} className={className}>
      <SectionHeader titleId={headingId} title={title} />
      {children}
    </SectionBand>
  );
}
