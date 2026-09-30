'use client';

import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button.tsx';

import { useAnalysis } from '../../hooks/use-analysis.ts';

/** The spec's default projection window (spec §4). */
const DEFAULT_HORIZON_DAYS = 28;

const COUNTS = ['critical', 'warning', 'hidden'] as const;

/**
 * Temporary placeholder (P1-15): runs the bundled sample through the worker and shows the summary
 * counts. The real data source and results UI replace it in P1-16/17.
 */
export function SampleAnalysisPreview() {
  const t = useTranslations('demo.preview');
  const locale = useLocale();
  const { state, loadSample, analyse } = useAnalysis();
  const busy = state.status === 'loading' || state.status === 'analysing';

  async function runSample() {
    const load = await loadSample(locale);
    if (load !== null && load.asOf !== null) {
      await analyse({ asOf: load.asOf, horizonDays: DEFAULT_HORIZON_DAYS });
    }
  }

  return (
    <div className="mt-8 space-y-4">
      <Button type="button" disabled={busy} onClick={() => void runSample()}>
        {t('loadSample')}
      </Button>
      <p role="status" className="text-muted-foreground">
        {state.status === 'loading' && t('loading')}
        {state.status === 'analysing' && t('analysing')}
        {state.status === 'mapped' && !state.load.ready && t('loadFailed')}
        {/* The counts below are not in the live region, so announce the outcome here. */}
        {state.status === 'ready' && t('done', state.report.summary)}
      </p>
      {state.status === 'error' && <p role="alert">{t(`errors.${state.error}`)}</p>}
      {state.status === 'ready' && (
        <>
          <h2 className="text-xl font-semibold">{t('summary')}</h2>
          <dl className="grid max-w-xl gap-4 sm:grid-cols-3">
            {COUNTS.map((key) => (
              <div key={key} className="rounded-lg border border-border p-3">
                <dt className="text-sm text-muted-foreground">{t(key)}</dt>
                <dd className="text-2xl font-semibold tabular-nums" data-testid={`count-${key}`}>
                  {state.report.summary[key]}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
