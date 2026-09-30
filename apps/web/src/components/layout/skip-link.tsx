import { useTranslations } from 'next-intl';

/** Id of the `<main>` element in the root layout; the skip link jumps there. */
export const MAIN_CONTENT_ID = 'main-content';

/** First focusable element on every page: lets keyboard users jump past the header (WCAG 2.4.1). */
export function SkipLink() {
  const t = useTranslations('layout');

  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
    >
      {t('skipLink')}
    </a>
  );
}
