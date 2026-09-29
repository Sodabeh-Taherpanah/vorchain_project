import { useTranslations } from 'next-intl';

import { PageStub } from '../../../components/page-stub.tsx';

// Public slugs: /de/impressum and /en/legal-notice. The legal text arrives in P1-24.
export default function ImpressumPage() {
  const t = useTranslations('legalNotice');
  return <PageStub title={t('title')} />;
}
