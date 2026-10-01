import { useTranslations } from 'next-intl';

import { Section } from './section.tsx';

/** Anchor of this section; the hero's secondary link jumps here. */
export const HOW_IT_WORKS_ID = 'how-it-works';

const STEPS = ['export', 'analyse', 'act'] as const;

/** "So funktioniert's": the three steps from ERP export to a ranked list of actions. */
export function HowItWorksSection() {
  const t = useTranslations('home.howItWorks');

  return (
    <Section id={HOW_IT_WORKS_ID} title={t('title')} className="bg-muted">
      <ol className="mt-8 grid gap-6 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step} className="rounded-xl border bg-card p-6 text-card-foreground">
            <span
              aria-hidden="true"
              className="inline-flex size-8 items-center justify-center rounded-full bg-primary font-mono text-sm font-medium text-primary-foreground tabular-nums"
            >
              {index + 1}
            </span>
            <h3 className="mt-4 text-lg font-semibold">{t(`steps.${step}.title`)}</h3>
            <p className="mt-2 text-muted-foreground">{t(`steps.${step}.text`)}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
