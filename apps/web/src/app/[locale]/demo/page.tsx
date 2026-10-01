import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from 'next-intl';

import de from '../../../../messages/de.json';
import en from '../../../../messages/en.json';
import type { ReportMessages } from '../../../components/demo/demo-analysis.tsx';
import { DemoDataSource } from '../../../components/demo/demo-data-source.tsx';
import { Container } from '@vorchain/ui/components/container';

// The results can be read in either language, independent of the page's (P1-17).
const reportMessages: ReportMessages = { de: de.demo.report, en: en.demo.report };

// Static shell with one client island. The worker (parsers, SheetJS, engine) and the sample data
// only load when the island first needs them.
export default function DemoPage() {
  const t = useTranslations('demo');
  const { demo } = useMessages();
  const locale = useLocale();
  return (
    <Container className="py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl print:hidden">
        {t('title')}
      </h1>
      <p className="mt-4 max-w-prose text-muted-foreground print:hidden">{t('lead')}</p>
      {/* Only the demo catalog is serialized for the island, not every page's messages. */}
      <NextIntlClientProvider locale={locale} messages={{ demo }}>
        <DemoDataSource reportMessages={reportMessages} />
      </NextIntlClientProvider>
    </Container>
  );
}
