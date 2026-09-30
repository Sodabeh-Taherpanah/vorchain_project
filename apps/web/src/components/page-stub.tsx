import { useTranslations } from 'next-intl';

import { Container } from './layout/container.tsx';

interface PageStubProps {
  /** Already translated page title, rendered as the page's only `h1`. */
  readonly title: string;
}

/**
 * Placeholder body for routes whose content arrives in a later task. The root layout provides the
 * `<main>` landmark around it.
 */
export function PageStub({ title }: PageStubProps) {
  const t = useTranslations('stub');
  return (
    <Container className="py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
      <p className="mt-4 max-w-prose text-muted-foreground">{t('comingSoon')}</p>
    </Container>
  );
}
