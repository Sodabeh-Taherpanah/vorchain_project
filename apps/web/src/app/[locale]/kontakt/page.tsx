import { useTranslations } from 'next-intl';

import { PageStub } from '../../../components/page-stub.tsx';

// Public slugs: /de/kontakt and /en/contact. The contact form arrives in P1-25.
export default function KontaktPage() {
  const t = useTranslations('contact');
  return <PageStub title={t('title')} />;
}
