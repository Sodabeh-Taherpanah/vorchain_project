import { render, screen, within } from '@testing-library/react';
import { materialId, type IsoDate, type ProjectionSeries } from '@vorchain/engine';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import { ProjectionChart } from './projection-chart.tsx';

const series: ProjectionSeries = {
  materialId: materialId('M0030'),
  safetyStock: 20,
  points: [
    ['2026-10-05', 0, 0, 40, 40],
    ['2026-10-06', 100, 0, 120, 20],
    ['2026-10-07', 0, 0, 60, -40],
    ['2026-10-08', 0, 100, 0, 0],
  ].map(([date, erpReceipts, realisticReceipts, erpStock, realisticStock]) => ({
    date: date as IsoDate,
    demand: 60,
    erpReceipts: Number(erpReceipts),
    realisticReceipts: Number(realisticReceipts),
    erpStock: Number(erpStock),
    realisticStock: Number(realisticStock),
  })),
};

/** jsdom does no layout; give the responsive chart a fixed box so Recharts draws the SVG. */
class FixedResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    const entry = { target, contentRect: { width: 600, height: 300 } } as ResizeObserverEntry;
    this.callback([entry], this);
  }
  unobserve() {
    return undefined;
  }
  disconnect() {
    return undefined;
  }
}

function renderChart(locale: 'de' | 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'de' ? de : en}>
      <ProjectionChart series={series} />
    </NextIntlClientProvider>,
  );
}

describe('ProjectionChart', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', FixedResizeObserver);
    // Reduced motion: Recharts' `isAnimationActive="auto"` then draws the final lines at once.
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }) satisfies MediaQueryList,
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ width: 600, height: 300 }),
    );
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ['de', 'Sicherheitsbestand (20)', 'Wareneingang laut ERP'],
    ['en', 'Safety stock (20)', 'Goods receipt per ERP'],
  ] as const)('has a localized legend for every mark in %s', (locale, safety, receipt) => {
    renderChart(locale);

    const legend = screen.getByRole('list', { name: locale === 'de' ? 'Legende' : 'Legend' });
    const items = within(legend)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items).toHaveLength(6);
    expect(items).toContain(safety);
    expect(items).toContain(receipt);
  });

  it('draws the ERP line dashed, the realistic line solid, with token colours', () => {
    const { container } = renderChart('de');

    const curves = container.querySelectorAll('.recharts-line-curve');
    expect(curves).toHaveLength(2);
    const curve = (name: string) => container.querySelector(`.recharts-line-curve[name="${name}"]`);
    const erp = curve(de.demo.report.drawer.legend.erp);
    const realistic = curve(de.demo.report.drawer.legend.realistic);
    expect(erp?.getAttribute('stroke')).toBe('var(--chart-1)');
    expect(erp?.getAttribute('stroke-dasharray')).toBe('6 4');
    expect(realistic?.getAttribute('stroke')).toBe('var(--chart-2)');
    expect(realistic?.hasAttribute('stroke-dasharray')).toBe(false);
  });

  it('marks receipts of both views and the safety-stock and zero lines', () => {
    const { container } = renderChart('de');

    expect(container.querySelectorAll('.recharts-reference-dot')).toHaveLength(2);
    expect(container.querySelectorAll('.recharts-reference-line')).toHaveLength(2);
    expect(container.querySelector('.recharts-area-area')?.getAttribute('fill')).toBe(
      'var(--chart-3)',
    );
  });
});
