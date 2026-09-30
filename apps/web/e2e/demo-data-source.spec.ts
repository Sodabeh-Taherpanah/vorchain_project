import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';

import de from '../messages/de.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };

const TABLES = [
  'materials',
  'open_purchase_orders',
  'demand',
  'supplier_history',
  'suppliers',
] as const;

const bestellungen = readFileSync(new URL('./fixtures/bestellungen.csv', import.meta.url));

interface SentRequest {
  readonly method: string;
  readonly url: string;
  readonly body: string | null;
}

/**
 * Records every request after page load, including the worker's own (its chunks, the lazy sample
 * chunk), for the privacy assertion of ADR-0003.
 */
async function openDemo(page: Page) {
  const scripts: string[] = [];
  const sent: SentRequest[] = [];
  let loaded = false;
  page.context().on('request', (request: Request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
    if (loaded)
      sent.push({ method: request.method(), url: request.url(), body: request.postData() });
  });
  await page.goto('/de/demo');
  await page.waitForLoadState('networkidle');
  loaded = true;
  return { scripts, sent, scriptsOnLoad: scripts.length };
}

/**
 * Privacy (ADR-0003): after page load only same-origin code is fetched; nothing is sent, not even
 * inside a URL (`values` are cells of the uploaded file).
 */
function expectNothingSent(
  page: Page,
  sent: readonly SentRequest[],
  values: readonly string[] = [],
) {
  const origin = new URL(page.url()).origin;
  for (const request of sent) {
    expect(request.method, request.url).toBe('GET');
    expect(request.body, request.url).toBeNull();
    expect(new URL(request.url).origin, request.url).toBe(origin);
    for (const value of values) expect(decodeURIComponent(request.url)).not.toContain(value);
  }
}

test('the sample loads in the Web Worker and all required tables are recognised', async ({
  page,
}) => {
  const worker = page.waitForEvent('worker');
  const { scripts, sent, scriptsOnLoad } = await openDemo(page);

  await page.getByRole('button', { name: de.demo.dataSource.loadSample }).click();

  await worker;
  await expect(page.getByRole('status')).toHaveText(de.demo.status.complete);
  for (const table of TABLES) {
    await expect(page.getByTestId(`table-${table}`)).toHaveAttribute('data-status', 'recognised');
  }
  await expect(page.getByTestId('table-demand')).toContainText('bedarf.csv');
  // The worker, parsers and sample data load only on demand, not with the page.
  expect(scripts.length).toBeGreaterThan(scriptsOnLoad);
  expectNothingSent(page, sent);
});

test('an uploaded file stays in the browser; missing tables are reported', async ({ page }) => {
  const { sent } = await openDemo(page);

  await page.getByTestId('file-input').setInputFiles({
    name: 'bestellungen.csv',
    mimeType: 'text/csv',
    buffer: bestellungen,
  });

  await expect(page.getByRole('status')).toContainText('3 Probleme gefunden');
  await expect(page.getByTestId('table-open_purchase_orders')).toHaveAttribute(
    'data-status',
    'recognised',
  );
  for (const table of ['materials', 'demand', 'supplier_history'] as const) {
    await expect(page.getByTestId(`table-${table}`)).toHaveAttribute('data-status', 'missing');
  }
  await expect(page.getByTestId('table-suppliers')).toHaveAttribute('data-status', 'absent');
  expectNothingSent(page, sent, ['PO00001', 'Liefertermin', '15.10.2026']);
});

test('a complete upload is analysed, re-analysed and translated without sending anything', async ({
  page,
}) => {
  const { sent } = await openDemo(page);
  const dir = new URL('../../../reference/python-prototype/sample_data_de/', import.meta.url);
  const files = ['artikel', 'bedarf', 'bestellungen', 'lieferanten', 'lieferhistorie'].map(
    (name) => ({
      name: `${name}.csv`,
      mimeType: 'text/csv',
      buffer: readFileSync(new URL(`${name}.csv`, dir)),
    }),
  );

  await page.getByTestId('file-input').setInputFiles(files);
  await page.getByLabel(de.demo.settings.asOf).fill('2026-10-05');
  const table = page.getByRole('table');
  // Supplier names from the uploaded suppliers file reach the explanations.
  await expect(table).toContainText('Metallbau Krüger GmbH');
  await page.getByLabel(de.demo.settings.horizon).fill('7');
  await expect(page.getByText('Stichtag 05.10.2026, Horizont 7 Tage.')).toBeVisible();
  await page.getByLabel(de.demo.settings.reportLanguage).selectOption('en');
  await expect(page.getByRole('heading', { name: en.demo.report.heading })).toBeVisible();

  expectNothingSent(page, sent, ['Metallbau Krüger GmbH', 'PO00001', 'M0011', '15.10.2026']);
});

test('a renamed required column gets a specific hint; removing the file clears it', async ({
  page,
}) => {
  await openDemo(page);
  const renamed = bestellungen.toString('utf8').replace('Liefertermin', 'Termin_neu');

  await page.getByTestId('file-input').setInputFiles({
    name: 'bestellungen.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(renamed, 'utf8'),
  });

  const orders = page.getByTestId('table-open_purchase_orders');
  await expect(orders).toHaveAttribute('data-status', 'invalid');
  await expect(orders).toContainText(
    'bestellungen.csv: Spalte Liefertermin nicht gefunden – gefundene Spalten: Bestellnummer, ' +
      'Artikelnummer, Lieferant, Bestellmenge und Termin_neu.',
  );

  await page.getByRole('button', { name: 'bestellungen.csv entfernen' }).click();
  await expect(orders).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('');
});

test('the map check with an error fits a 360 px screen without horizontal scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openDemo(page);
  const renamed = bestellungen.toString('utf8').replace('Liefertermin', 'Termin_neu');

  await page.getByTestId('file-input').setInputFiles({
    name: 'bestellungen_export_aus_dem_erp_system_2026.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(renamed, 'utf8'),
  });

  await expect(page.getByRole('status')).toContainText('Probleme gefunden');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(360);
});

for (const [locale, messages] of [
  ['de', de],
  ['en', en],
] as const) {
  test(`/${locale}/demo has no serious axe violations with the map check shown`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/demo`);
    await page.getByTestId('file-input').setInputFiles({
      name: 'bestellungen.csv',
      mimeType: 'text/csv',
      buffer: bestellungen,
    });
    await expect(page.getByTestId('table-demand')).toHaveAttribute('data-status', 'missing');
    await page.getByRole('button', { name: messages.demo.dataSource.templates }).click();
    await expect(page.getByRole('link', { name: /\.csv$/ })).toHaveCount(5);

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);
  });
}
