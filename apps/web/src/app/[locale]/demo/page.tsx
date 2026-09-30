import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from 'next-intl';

import { SampleAnalysisPreview } from '../../../components/demo/sample-analysis-preview.tsx';
import { PageStub } from '../../../components/page-stub.tsx';

// Static shell with one client island. The worker (parsers, SheetJS, engine) only loads when the
// island first uses it; the real demo UI replaces the placeholder in P1-16 to P1-19.
export default function DemoPage() {
  const t = useTranslations('demo');
  const { demo } = useMessages();
  const locale = useLocale();
  return (
    <PageStub title={t('title')}>
      {/* Only this page's island messages are serialized, not the demo catalog on every page. */}
      <NextIntlClientProvider locale={locale} messages={{ demo: { preview: demo.preview } }}>
        <SampleAnalysisPreview />
      </NextIntlClientProvider>
    </PageStub>
  );
}
