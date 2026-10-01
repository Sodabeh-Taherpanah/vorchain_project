import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import type * as CsvExport from './csv-export.ts';
import { downloadFile } from './csv-export.ts';
import { supplierNameLookup } from './explanation-text.tsx';
import { ReportActions } from './report-actions.tsx';
import { testReport } from './test-report.ts';

vi.mock('./csv-export.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof CsvExport>()),
  downloadFile: vi.fn(),
}));

const supplierName = supplierNameLookup({ S01: 'Metallbau Krüger GmbH' });

function renderIn(locale: 'de' | 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'de' ? de : en}>
      <ReportActions report={testReport()} supplierName={supplierName} />
    </NextIntlClientProvider>,
  );
}

function downloaded(): { content: string; fileName: string; type: string } {
  const [content, fileName, type] = vi.mocked(downloadFile).mock.calls.at(-1) ?? [];
  if (content === undefined || fileName === undefined || type === undefined) {
    throw new Error('nothing downloaded');
  }
  return { content, fileName, type };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ReportActions', () => {
  it('exports every exception as a German CSV named after the analysis date', async () => {
    renderIn('de');

    await userEvent.click(screen.getByRole('button', { name: 'CSV exportieren' }));

    const { content, fileName, type } = downloaded();
    expect(fileName).toBe('vorchain-engpaesse-2026-10-05.csv');
    expect(type).toBe('text/csv;charset=utf-8');
    const lines = content.split('\r\n');
    expect(lines[0]).toBe(
      '\uFEFFSchwere;Material;Bezeichnung;Kritisch ab;Tage bis kritisch;Niedrigster Bestand;' +
        'Verdeckt;Warum;Nächster Schritt',
    );
    expect(lines[1]).toBe(
      'Kritisch;M0011;Teil M0011;08.10.2026;3;-1380,5;Nein;' +
        'Keine offene Bestellung deckt den Bedarf.;Jetzt bei Metallbau Krüger GmbH bestellen.',
    );
    expect(lines).toHaveLength(testReport().exceptions.length + 2);
  });

  it('exports with commas, decimal points and English text for an English report', async () => {
    renderIn('en');

    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    const [header, first] = downloaded().content.split('\r\n');
    expect(header?.startsWith('\uFEFFSeverity,Material,Description,')).toBe(true);
    expect(first?.startsWith('Critical,M0011,Teil M0011,2026-10-08,3,-1380.5,No,')).toBe(true);
  });

  it('opens the browser print dialog for the report', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderIn('de');

    await userEvent.click(screen.getByRole('button', { name: 'Bericht drucken' }));

    expect(print).toHaveBeenCalledOnce();
  });

  it('groups both actions under an accessible name', () => {
    renderIn('en');

    expect(screen.getByRole('group', { name: 'Export report' })).toBeTruthy();
  });
});
