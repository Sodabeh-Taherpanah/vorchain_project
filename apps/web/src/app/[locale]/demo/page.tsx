import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from 'next-intl';

import { DemoDataSource } from '../../../components/demo/demo-data-source.tsx';
import { Container } from '../../../components/layout/container.tsx';

// Static shell with one client island. The worker (parsers, SheetJS, engine) and the sample data
// only load when the island first needs them; settings and results follow in P1-17 to P1-19.
export default function DemoPage() {
  const t = useTranslations('demo');
  const { demo } = useMessages();
  const locale = useLocale();
  return (
    <Container className="py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {t('title')}
      </h1>
      <p className="mt-4 max-w-prose text-muted-foreground">{t('lead')}</p>
      {/* Only the demo catalog is serialized for the island, not every page's messages. */}
      <NextIntlClientProvider locale={locale} messages={{ demo }}>
        <DemoDataSource />
      </NextIntlClientProvider>
    </Container>
  );
}
