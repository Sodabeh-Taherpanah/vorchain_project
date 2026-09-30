import type { ReactNode } from 'react';

import { Container } from './container.tsx';

interface StatusPageProps {
  /** Short, already translated label above the heading, e.g. "Fehler 404". */
  readonly code: string;
  readonly title: string;
  readonly description: string;
  /** Links or buttons that lead the visitor on. */
  readonly children: ReactNode;
  /** Optional small print below the actions (e.g. an error ID for support). */
  readonly footnote?: ReactNode;
}

/** Shared, branded body of the 404 and error pages. Renders the page's only `h1`. */
export function StatusPage({ code, title, description, children, footnote }: StatusPageProps) {
  return (
    <Container className="py-16 sm:py-24">
      <p className="font-mono text-sm font-medium text-signal-strong">{code}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h1>
      <p className="mt-4 max-w-prose text-muted-foreground">{description}</p>
      <div className="mt-8 flex flex-wrap gap-3">{children}</div>
      {footnote === undefined ? null : (
        <p className="mt-8 font-mono text-xs text-muted-foreground">{footnote}</p>
      )}
    </Container>
  );
}
