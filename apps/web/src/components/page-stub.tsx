import { useTranslations } from 'next-intl';

interface PageStubProps {
  /** Already translated page title, rendered as the page's only `h1`. */
  readonly title: string;
}

/** Placeholder body for routes whose content arrives in a later task. */
export function PageStub({ title }: PageStubProps) {
  const t = useTranslations('stub');
  return (
    <main>
      <h1>{title}</h1>
      <p>{t('comingSoon')}</p>
    </main>
  );
}
