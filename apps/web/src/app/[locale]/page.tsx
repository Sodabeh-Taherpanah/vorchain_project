import { useTranslations } from 'next-intl';

import { Container } from '@/components/layout/container.tsx';

// Placeholder landing page; the content sections follow in P1-21.
export default function HomePage() {
  const t = useTranslations('home');
  return (
    <Container className="py-12 sm:py-20">
      <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
        {t('title')}
      </h1>
      <p className="mt-4 max-w-prose text-lg text-muted-foreground">{t('tagline')}</p>
    </Container>
  );
}
