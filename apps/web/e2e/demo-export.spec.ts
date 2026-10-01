import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import golden from '../../../reference/python-prototype/golden/sample_data_de.json' with { type: 'json' };
import de from '../messages/de.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };

const BOM = '﻿';

async function analyseSample(page: Page, locale: 'de' | 'en' = 'de') {
  const messages = locale === 'de' ? de : en;
  await page.goto(`/${locale}/demo`);
  await page.getByRole('button', { name: messages.demo.dataSource.loadSample }).click();
  await expect(
    page.getByRole('region', { name: messages.demo.report.table.region }).getByRole('table'),
  ).toBeVisible();
}

/** Records end with CRLF; line breaks inside quoted cells are plain LF. */
async function downloadCsv(page: Page, buttonName: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: buttonName }).click();
  const file = await download;
  const content = await readFile(await file.path(), 'utf8');
  return { fileName: file.suggestedFilename(), records: content.split('\r\n').slice(0, -1) };
}

test('the supplier table lists the least reliable supplier first', async ({ page }) => {
  await analyseSample(page);

  const table = page.getByRole('table', { name: de.demo.report.suppliers.caption });
  const suppliers = Object.values(golden.suppliers);
  await expect(table.getByRole('row')).toHaveCount(suppliers.length + 1);
  // S04 has the lowest on-time rate (4 %) in the golden output.
  await expect(table.getByRole('row').nth(1)).toContainText('Asia Components Ltd');
  await expect(table.getByRole('row').nth(1)).toContainText('4 %');
});

test('the CSV export holds every exception and sends nothing over the network', async ({
  page,
}) => {
  await analyseSample(page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  const { fileName, records } = await downloadCsv(page, de.demo.report.export.csv);

  expect(fileName).toBe(`vorchain-engpaesse-${golden.asOf}.csv`);
  expect(records[0]).toBe(
    `${BOM}Schwere;Material;Bezeichnung;Kritisch ab;Tage bis kritisch;Niedrigster Bestand;` +
      'Verdeckt;Warum;Nächster Schritt',
  );
  expect(records).toHaveLength(golden.exceptions.length + 1);
  expect(records[1]?.startsWith(`Kritisch;${golden.exceptions[0]?.material_id ?? ''};`)).toBe(true);
  expect(requests.filter((url) => !url.startsWith('blob:'))).toEqual([]);
});

test('an English report exports with commas', async ({ page }) => {
  await analyseSample(page, 'en');

  const { records } = await downloadCsv(page, en.demo.report.export.csv);

  expect(records[0]?.startsWith(`${BOM}Severity,Material,Description,`)).toBe(true);
  expect(records).toHaveLength(golden.exceptions.length + 1);
});

test('"Bericht drucken" opens the print dialog', async ({ page }) => {
  await analyseSample(page);
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printed = 'true';
    };
  });

  await page.getByRole('button', { name: de.demo.report.export.print }).click();

  await expect(page.locator('body')).toHaveAttribute('data-printed', 'true');
});

test('the print view shows the full report without navigation or controls', async ({ page }) => {
  await analyseSample(page);

  await page.emulateMedia({ media: 'print' });

  await expect(page.getByText(de.demo.report.export.title)).toBeVisible();
  await expect(page.getByText('Stichtag 05.10.2026, Horizont 28 Tage.')).toBeVisible();
  await expect(page.getByTestId('tile-critical')).toBeVisible();
  await expect(page.getByRole('banner')).toBeHidden();
  await expect(page.getByRole('contentinfo')).toBeHidden();
  await expect(page.getByLabel(de.demo.settings.horizon)).toBeHidden();
  await expect(page.getByRole('button')).toHaveCount(golden.exceptions.length);
  const exceptions = page
    .getByRole('region', { name: de.demo.report.table.region })
    .getByRole('table');
  await expect(exceptions.getByRole('row')).toHaveCount(golden.exceptions.length + 1);
  await expect(page.getByRole('table', { name: de.demo.report.suppliers.caption })).toBeVisible();
  expect((await page.screenshot({ fullPage: true })).byteLength).toBeGreaterThan(0);
});
