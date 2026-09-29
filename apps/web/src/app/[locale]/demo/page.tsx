import { useTranslations } from 'next-intl';

import { PageStub } from '../../../components/page-stub.tsx';

// Static shell; the demo island and its Web Worker arrive in P1-15 to P1-19.
export default function DemoPage() {
  const t = useTranslations('demo');
  return <PageStub title={t('title')} />;
}
