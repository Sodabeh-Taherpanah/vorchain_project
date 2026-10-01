import { render, screen, within } from '@testing-library/react';
import { supplierId, type SupplierStats } from '@vorchain/engine';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import { supplierNameLookup } from './explanation-text.tsx';
import { rankByOnTimeRate, SupplierTable } from './supplier-table.tsx';

const supplierName = supplierNameLookup({ S01: 'Metallbau Krüger GmbH', S02: 'Kunststoff AG' });

function stats(id: string, overrides: Partial<SupplierStats> = {}): SupplierStats {
  return {
    supplierId: supplierId(id),
    meanDelayDays: 2.25,
    p80DelayDays: 4,
    onTimeRate: 0.5,
    deliveries: 12,
    reliable: true,
    ...overrides,
  };
}

function renderIn(locale: 'de' | 'en', ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'de' ? de : en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const cells = (row: HTMLElement) =>
  Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent);

describe('rankByOnTimeRate', () => {
  it('sorts by on-time rate ascending and keeps the engine order for ties (stable)', () => {
    const ranked = rankByOnTimeRate([
      stats('A', { onTimeRate: 0.9 }),
      stats('B', { onTimeRate: 0.2 }),
      stats('C', { onTimeRate: 0.9 }),
      stats('D', { onTimeRate: 0.2 }),
    ]);
    expect(ranked.map((s) => s.supplierId)).toEqual(['B', 'D', 'A', 'C']);
  });
});

describe('SupplierTable', () => {
  it('is a captioned table with localized column headers, least reliable supplier first', () => {
    renderIn(
      'de',
      <SupplierTable
        stats={[
          stats('S01', { onTimeRate: 0.875 }),
          stats('S02', {
            onTimeRate: 0.25,
            meanDelayDays: 3.04,
            p80DelayDays: 5,
            deliveries: 2,
            reliable: false,
          }),
        ]}
        supplierName={supplierName}
      />,
    );

    const table = screen.getByRole('table', { name: /Termintreue der Lieferanten/ });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual([
      'Lieferant',
      'Termintreue',
      'Ø Verzug (Arbeitstage)',
      'P80-Verzug (Arbeitstage)',
      'Lieferungen',
      'Aussagekraft',
    ]);
    const [, first, second] = within(table).getAllByRole('row');
    if (first === undefined || second === undefined) throw new Error('missing rows');
    expect(cells(first)).toEqual(['Kunststoff AG', '25\u00a0%', '3,0', '5', '2', 'gering']);
    expect(cells(second)).toEqual([
      'Metallbau Krüger GmbH',
      '88\u00a0%',
      '2,3',
      '4',
      '12',
      'ausreichend',
    ]);
    expect(within(first).getByRole('rowheader').textContent).toBe('Kunststoff AG');
  });

  it('formats numbers for English and falls back to the supplier ID without a name', () => {
    renderIn(
      'en',
      <SupplierTable
        stats={[stats('S99', { onTimeRate: 1, meanDelayDays: -0.5, p80DelayDays: 0 })]}
        supplierName={supplierName}
      />,
    );

    const [, row] = screen.getAllByRole('row');
    if (row === undefined) throw new Error('missing row');
    expect(cells(row)).toEqual(['S99', '100%', '-0.5', '0', '12', 'sufficient']);
  });

  it('says so when there is no delivery history', () => {
    renderIn('en', <SupplierTable stats={[]} supplierName={supplierName} />);

    expect(screen.queryByRole('table')).toBeNull();
    screen.getByText(en.demo.report.suppliers.empty);
  });
});
