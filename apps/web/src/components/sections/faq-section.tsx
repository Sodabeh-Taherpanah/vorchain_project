import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Section } from './section.tsx';

const QUESTIONS = ['data', 'integration', 'delay', 'upload', 'cost'] as const;

/**
 * FAQ as native `<details>` disclosures: keyboard-operable (Enter/Space on the summary) and
 * announced as expandable by screen readers without any client JavaScript.
 */
export function FaqSection() {
  const t = useTranslations('home.faq');

  return (
    <Section id="faq" title={t('title')} className="bg-muted">
      <div className="mt-8 max-w-3xl divide-y rounded-xl border bg-card text-card-foreground">
        {QUESTIONS.map((question) => (
          <details key={question} className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-3 font-medium [&::-webkit-details-marker]:hidden">
              {t(`items.${question}.question`)}
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              />
            </summary>
            <p className="px-5 pb-4 text-muted-foreground">{t(`items.${question}.answer`)}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
