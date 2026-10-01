import { useTranslations } from 'next-intl';

import { Section } from './section.tsx';

const POINTS = ['promised', 'late', 'hidden'] as const;

/**
 * "Das Problem": why the ERP view is too optimistic. The figure slot keeps the space for the
 * hidden-risk chart (P1-22) so it can land without shifting the layout.
 */
export function ProblemSection() {
  const t = useTranslations('home.problem');

  return (
    <Section id="problem" title={t('title')}>
      <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="max-w-prose text-lg">{t('lead')}</p>
          <ul className="mt-6 space-y-3">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3 text-muted-foreground">
                <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-signal" />
                {t(`points.${point}`)}
              </li>
            ))}
          </ul>
        </div>
        <ChartSlot />
      </div>
    </Section>
  );
}

/**
 * Reserved box for the hidden-risk chart. A fixed aspect ratio gives it its final height before
 * the chart exists, so P1-22 adds no layout shift (CLS budget < 0.05). Hidden from assistive tech
 * while empty; the chart brings its own text alternative.
 */
function ChartSlot() {
  return (
    <div
      data-testid="hidden-risk-chart-slot"
      aria-hidden="true"
      className="aspect-[16/10] w-full rounded-xl border bg-card"
    />
  );
}
