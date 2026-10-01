import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import golden from '../../../reference/python-prototype/golden/sample_data_de.json' with { type: 'json' };
import de from '../messages/de.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };

const M0030 = golden.exceptions.find((e) => e.material_id === 'M0030');
const toGermanDate = (iso: string) => iso.split('-').reverse().join('.');
const drawer = de.demo.report.drawer;

/**
 * Every JavaScript file the page has fetched so far, with its body. `settled()` waits for every
 * body read so far, so a negative check cannot pass just because a body was not read yet.
 */
function collectScripts(page: Page) {
  const scripts = new Map<string, string>();
  const reads: Promise<unknown>[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() !== 'script') return;
    reads.push(
      response.text().then(
        (body) => scripts.set(response.url(), body),
        () => undefined,
      ),
    );
  });
  return { scripts, settled: () => Promise.all(reads) };
}

/** Recharts' own class name: present in its chunk, absent from every other. */
const hasRecharts = (scripts: Map<string, string>) =>
  Array.from(scripts.values()).some((body) => body.includes('recharts-wrapper'));

/** Fails on a serious or critical axe violation inside the open drawer. */
async function expectNoSeriousAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious, label).toEqual([]);
}

async function showSampleResults(page: Page, locale: 'de' | 'en' = 'de') {
  const messages = locale === 'de' ? de : en;
  await page.goto(`/${locale}/demo`);
  await page.getByRole('button', { name: messages.demo.dataSource.loadSample }).click();
  await expect(
    page.getByRole('region', { name: messages.demo.report.table.region }).getByRole('table'),
  ).toBeVisible();
}

test('the drawer for M0030 summarises both views with the golden dates', async ({ page }) => {
  if (M0030 === undefined) throw new Error('golden file has no M0030');
  await showSampleResults(page);

  await page.getByRole('button', { name: 'Details zu M0030' }).click();

  const dialog = page.getByRole('dialog', { name: 'Bestandsverlauf M0030' });
  const summary = dialog.getByTestId('projection-summary');
  await expect(summary).toContainText(toGermanDate(M0030.critical_date));
  await expect(summary).toContainText(toGermanDate(M0030.erp_view_date));
  const chart = dialog.getByRole('img', { name: /Realistische Sicht: Fehlteil am/ });
  await expect(chart).toHaveAttribute('aria-label', (await summary.textContent()) ?? '');
  await expect(chart.locator('.recharts-line-curve')).toHaveCount(2);
  // Localized axis: German `day.month.` ticks, the first one on the analysis date.
  await expect(
    chart.getByText(toGermanDate(golden.asOf).slice(0, 6), { exact: true }),
  ).toBeVisible();
});

test('keyboard only: open from the row, switch to the table, Escape returns to the row', async ({
  page,
}) => {
  await showSampleResults(page);
  const details = page.getByRole('button', { name: 'Details zu M0030' });
  await details.focus();

  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Bestandsverlauf M0030' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('projection-summary')).toBeVisible();

  const toggle = dialog.getByRole('button', { name: drawer.showTable });
  await toggle.focus();
  await page.keyboard.press('Enter');
  const table = dialog.getByRole('table', { name: /Projizierter Bestand von M0030/ });
  await expect(table.getByRole('row')).toHaveCount(golden.horizon + 1);

  // Focus stays trapped inside the drawer.
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(details).toBeFocused();
});

test('Recharts is fetched only when the drawer opens, never with the initial /demo page', async ({
  page,
}) => {
  const { scripts, settled } = collectScripts(page);
  await showSampleResults(page);
  await page.waitForLoadState('networkidle');
  await settled();
  expect(scripts.size).toBeGreaterThan(0);
  expect(hasRecharts(scripts)).toBe(false);

  await page.getByRole('button', { name: 'Details zu M0030' }).click();
  await expect(page.getByRole('dialog').locator('.recharts-line-curve')).toHaveCount(2);

  await expect.poll(() => hasRecharts(scripts)).toBe(true);
});

test('the drawer shows English text and ISO dates in an English report', async ({ page }) => {
  if (M0030 === undefined) throw new Error('golden file has no M0030');
  await showSampleResults(page, 'en');

  await page.getByRole('button', { name: 'Details for M0030' }).click();

  await expect(page.getByRole('dialog').getByTestId('projection-summary')).toHaveText(
    `Realistic view: stock-out on ${M0030.critical_date}, ERP view: stock-out on ${M0030.erp_view_date}.`,
  );
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the open drawer has no serious axe violations (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await showSampleResults(page);
    await page.getByRole('button', { name: 'Details zu M0030' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.recharts-line-curve')).toHaveCount(2);

    for (const view of ['chart', 'table'] as const) {
      if (view === 'table') await dialog.getByRole('button', { name: drawer.showTable }).click();
      await expectNoSeriousAxeViolations(page, view);
    }
  });
}

test('the drawer fits a 360 px screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await showSampleResults(page);
  await page.getByRole('button', { name: 'Details zu M0030' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.recharts-line-curve')).toHaveCount(2);

  const box = await dialog.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(360);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(360);

  await expectNoSeriousAxeViolations(page, 'chart at 360 px');
  await dialog.getByRole('button', { name: drawer.showTable }).click();
  await expectNoSeriousAxeViolations(page, 'table at 360 px');
});

/**
 * Privacy (ADR-0003): opening the drawer only fetches same-origin code (the chart chunk); the
 * projection comes from the worker, so no request carries a body or a value of the data.
 */
test('opening the drawer sends nothing about the data', async ({ page }) => {
  if (M0030 === undefined) throw new Error('golden file has no M0030');
  await showSampleResults(page);
  await page.waitForLoadState('networkidle');
  const sent: { method: string; url: string; body: string | null }[] = [];
  page.context().on('request', (request) => {
    sent.push({ method: request.method(), url: request.url(), body: request.postData() });
  });

  await page.getByRole('button', { name: 'Details zu M0030' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.recharts-line-curve')).toHaveCount(2);
  await dialog.getByRole('button', { name: drawer.showTable }).click();
  await page.waitForLoadState('networkidle');

  // The chart chunk at least, so the loop below cannot pass on an empty list.
  expect(sent.length).toBeGreaterThan(0);
  const origin = new URL(page.url()).origin;
  const values = ['M0030', M0030.critical_date, M0030.erp_view_date];
  for (const request of sent) {
    expect(request.method, request.url).toBe('GET');
    expect(request.body, request.url).toBeNull();
    expect(new URL(request.url).origin, request.url).toBe(origin);
    for (const value of values) expect(decodeURIComponent(request.url)).not.toContain(value);
  }
});
