'use client';

import type { IsoDate } from '@vorchain/engine';
import { useTranslations, type Locale } from 'next-intl';
import { useId, useState } from 'react';

import { routing } from '@/i18n/routing.ts';

import {
  MAX_HORIZON_DAYS,
  MIN_HORIZON_DAYS,
  parseAsOf,
  parseHorizon,
  type AnalysisSettings,
} from './analysis-settings-model.ts';

/** What the form shows: the settings with the default as-of date already applied. */
export interface EffectiveSettings extends Omit<AnalysisSettings, 'asOf'> {
  readonly asOf: IsoDate;
}

/**
 * The text the user is typing, which may be invalid for a moment; it follows the value again
 * whenever the value changes from outside (e.g. a new sample with its own date).
 */
function useDraft(value: string) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  return [draft, setDraft] as const;
}

const fieldClass =
  'mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-critical';

/**
 * Step 3 of the demo (spec §4.1): as-of date, horizon and report language. Only valid values are
 * passed on, so every change the parent sees can go straight to the worker.
 */
export function AnalysisSettingsForm({
  settings,
  onChange,
}: {
  readonly settings: EffectiveSettings;
  readonly onChange: (change: Partial<AnalysisSettings>) => void;
}) {
  const t = useTranslations('demo.settings');
  const id = useId();
  const [asOf, setAsOf] = useDraft(settings.asOf);
  const [horizon, setHorizon] = useDraft(String(settings.horizonDays));
  const asOfValid = parseAsOf(asOf) !== null;
  const horizonValid = parseHorizon(horizon) !== null;
  const limits = { min: MIN_HORIZON_DAYS, max: MAX_HORIZON_DAYS };

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-4">
      <h2 id={`${id}-heading`} className="text-xl font-semibold">
        {t('heading')}
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={`${id}-asof`} className="font-medium">
            {t('asOf')}
          </label>
          <input
            id={`${id}-asof`}
            type="date"
            required
            value={asOf}
            aria-invalid={!asOfValid}
            aria-describedby={`${id}-asof-hint`}
            className={fieldClass}
            onChange={(event) => {
              setAsOf(event.target.value);
              const parsed = parseAsOf(event.target.value);
              if (parsed !== null) onChange({ asOf: parsed });
            }}
          />
          <p id={`${id}-asof-hint`} className="mt-1 text-sm text-muted-foreground">
            {asOfValid ? t('asOfHint') : t('asOfInvalid')}
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-horizon`} className="font-medium">
            {t('horizon')}
          </label>
          <input
            id={`${id}-horizon`}
            type="number"
            inputMode="numeric"
            required
            min={MIN_HORIZON_DAYS}
            max={MAX_HORIZON_DAYS}
            step={1}
            value={horizon}
            aria-invalid={!horizonValid}
            aria-describedby={`${id}-horizon-hint`}
            className={fieldClass}
            onChange={(event) => {
              setHorizon(event.target.value);
              const parsed = parseHorizon(event.target.value);
              if (parsed !== null) onChange({ horizonDays: parsed });
            }}
          />
          <p id={`${id}-horizon-hint`} className="mt-1 text-sm text-muted-foreground">
            {horizonValid ? t('horizonHint', limits) : t('horizonInvalid', limits)}
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-language`} className="font-medium">
            {t('reportLanguage')}
          </label>
          <select
            id={`${id}-language`}
            value={settings.reportLocale}
            className={fieldClass}
            onChange={(event) => {
              const locale = routing.locales.find((l) => l === event.target.value);
              if (locale !== undefined) onChange({ reportLocale: locale });
            }}
          >
            {routing.locales.map((locale: Locale) => (
              <option key={locale} value={locale} lang={locale}>
                {t(`languages.${locale}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
