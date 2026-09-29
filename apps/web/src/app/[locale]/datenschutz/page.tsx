import { useTranslations } from 'next-intl';

import { PageStub } from '../../../components/page-stub.tsx';

// Public slugs: /de/datenschutz and /en/privacy. The privacy policy arrives in P1-24.
export default function DatenschutzPage() {
  const t = useTranslations('privacy');
  return <PageStub title={t('title')} />;
}
