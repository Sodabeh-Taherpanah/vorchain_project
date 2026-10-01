import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import golden from '../../../reference/python-prototype/golden/sample_data_de.json' with { type: 'json' };
import de from '../messages/de.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };

const [first] = golden.exceptions;
const toGermanDate = (iso: string) => iso.split('-').reverse().join('.');

async function analyseSample(page: Page, locale: 'de' | 'en' = 'de') {
  const messages = locale === 'de' ? de : en;
  await page.goto(`/${locale}/demo`);
  await page.getByRole('button', { name: messages.demo.dataSource.loadSample }).click();
  // The exception table; the supplier table follows it.
  const table = page
    .getByRole('region', { name: messages.demo.report.table.region })
    .getByRole('table');
  await expect(table).toBeVisible();
  return table;
}

const total = async (page: Page) =>
  Number(await page.locator('table[data-total]').getAttribute('data-total'));

test('the sample shows the golden ranking: first row, hidden risks and counts', async ({
  page,
}) => {
  const table = await analyseSample(page);
  if (first === undefined) throw new Error('golden file has no exceptions');

  const firstRow = table.getByRole('row').nth(1);
  await expect(firstRow.getByRole('rowheader')).toContainText(first.material_id);
  await expect(firstRow).toContainText(de.demo.report.severity.CRITICAL);
  await expect(firstRow).toContainText(toGermanDate(first.critical_date));
  await expect(page.getByTestId('hidden-badge').first()).toBeVisible();

  const critical = golden.exceptions.filter((e) => e.severity === 'CRITICAL').length;
  const hidden = golden.exceptions.filter((e) => e.hidden_risk === 'yes').length;
  await expect(page.getByTestId('tile-critical')).toContainText(String(critical));
  await expect(page.getByTestId('tile-hidden')).toContainText(String(hidden));
  expect(await total(page)).toBe(golden.exceptions.length);
});

test('a 7-day horizon re-runs the analysis and finds fewer risks', async ({ page }) => {
  await analyseSample(page);

  const horizon = page.getByLabel(de.demo.settings.horizon);
  await horizon.fill('7');

  await expect(page.getByText('Stichtag 05.10.2026, Horizont 7 Tage.')).toBeVisible();
  expect(await total(page)).toBeLessThan(golden.exceptions.length);
});

test('"Alle anzeigen" expands the table to every exception', async ({ page }) => {
  const table = await analyseSample(page);
  // Rows kept in the page for printing stay out of the accessibility tree until expanded.
  await expect(table.getByRole('row')).toHaveCount(10 + 1);

  await page.getByRole('button', { name: /^Alle anzeigen/ }).click();

  await expect(table.getByRole('row')).toHaveCount(golden.exceptions.length + 1);
});

test('the report language can differ from the page language', async ({ page }) => {
  await analyseSample(page);

  await page.getByLabel(de.demo.settings.reportLanguage).selectOption('en');

  await expect(page.getByRole('heading', { name: en.demo.report.heading })).toBeVisible();
  if (first === undefined) throw new Error('golden file has no exceptions');
  await expect(page.getByRole('row').nth(1)).toContainText(first.critical_date);
});

test('the results fit a 360 px screen; only the table scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await analyseSample(page);

  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(360);
});

for (const locale of ['de', 'en'] as const) {
  test(`/${locale}/demo results have no serious axe violations`, async ({ page }) => {
    await analyseSample(page, locale);

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);
  });
}
