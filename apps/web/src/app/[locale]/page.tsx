import { useTranslations } from 'next-intl';

// Placeholder landing page. Design tokens (P1-13) and content sections (P1-21) follow.
export default function HomePage() {
  const t = useTranslations('home');
  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{t('tagline')}</p>
    </main>
  );
}
