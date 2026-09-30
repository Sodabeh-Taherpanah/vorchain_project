import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IsoDate, Report } from '@vorchain/engine';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import de from '../../../messages/de.json';
import type { AnalysisService, LoadSummary } from '../../workers/analysis-service.ts';
import { SampleAnalysisPreview } from './sample-analysis-preview.tsx';

const asOf = '2026-10-05' as IsoDate;
const load: LoadSummary = { tables: [], errors: [], warnings: [], ready: true, asOf };
const summary = { critical: 7, warning: 3, hidden: 2, overduePurchaseOrders: 0 };
const service = {
  loadFiles: vi.fn(),
  loadSample: vi.fn(() => Promise.resolve(load)),
  analyse: vi.fn(() => Promise.resolve({ asOf, horizonDays: 28, summary } as unknown as Report)),
  getProjection: vi.fn(),
} satisfies AnalysisService;

vi.mock('../../workers/connect-analysis-worker.ts', () => ({
  connectAnalysisWorker: () => ({ service, terminate: vi.fn() }),
}));

describe('SampleAnalysisPreview', () => {
  it('loads the sample of the current locale and shows the summary counts', async () => {
    render(
      <NextIntlClientProvider locale="de" messages={de}>
        <SampleAnalysisPreview />
      </NextIntlClientProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: de.demo.preview.loadSample }));

    expect(await screen.findByRole('heading', { name: de.demo.preview.summary })).toBeDefined();
    expect(service.loadSample).toHaveBeenCalledWith('de');
    expect(service.analyse).toHaveBeenCalledWith({ asOf, horizonDays: 28 });
    expect(screen.getByTestId('count-critical').textContent).toBe('7');
    expect(screen.getByTestId('count-warning').textContent).toBe('3');
    expect(screen.getByTestId('count-hidden').textContent).toBe('2');
  });
});
