import type { ReactNode } from 'react';

import { Container } from '@vorchain/ui/components/container';
import { StatusIllustration, type StatusIllustrationKind } from './status-illustration.tsx';

interface StatusPageProps {
  /** Short, already translated label above the heading, e.g. "Fehler 404". */
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly illustration: StatusIllustrationKind;
  /** Links or buttons that lead the visitor on. */
  readonly children: ReactNode;
  /** Optional small print below the actions (e.g. an error ID for support). */
  readonly footnote?: ReactNode;
}

/** Shared, branded body of the 404 and error pages. Renders the page's only `h1`. */
export function StatusPage({
  code,
  title,
  description,
  illustration,
  children,
  footnote,
}: StatusPageProps) {
  return (
    <Container className="grid items-center gap-10 py-16 sm:py-24 md:grid-cols-2 md:gap-16">
      <div>
        <p className="font-mono text-sm font-medium text-muted-foreground">{code}</p>
        <h1 className="mt-3 font-heading text-title font-semibold text-balance">{title}</h1>
        <p className="mt-4 max-w-prose text-lead text-muted-foreground">{description}</p>
        <div className="mt-8 flex flex-wrap gap-3">{children}</div>
        {footnote === undefined ? null : (
          <p className="mt-8 font-mono text-xs text-muted-foreground">{footnote}</p>
        )}
      </div>
      <StatusIllustration
        kind={illustration}
        className="order-first max-w-48 sm:max-w-xs md:order-last md:ml-auto"
      />
    </Container>
  );
}
