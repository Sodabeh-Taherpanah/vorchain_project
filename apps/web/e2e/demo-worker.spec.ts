import { readFileSync } from 'node:fs';

import { expect, test, type Request } from '@playwright/test';

import de from '../messages/de.json' with { type: 'json' };

interface GoldenException {
  readonly severity: 'CRITICAL' | 'WARNING';
  readonly hidden_risk: 'yes' | 'no';
}

const golden = JSON.parse(
  readFileSync(
    new URL('../../../reference/python-prototype/golden/sample_data_de.json', import.meta.url),
    'utf8',
  ),
) as { exceptions: GoldenException[] };

const expected = {
  critical: golden.exceptions.filter((e) => e.severity === 'CRITICAL').length,
  warning: golden.exceptions.filter((e) => e.severity === 'WARNING').length,
  hidden: golden.exceptions.filter((e) => e.hidden_risk === 'yes').length,
};

test('the sample runs in the Web Worker and matches the golden summary', async ({ page }) => {
  const scripts: string[] = [];
  const afterClick: { method: string; url: string; body: string | null }[] = [];
  let clicked = false;
  const onRequest = (request: Request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
    if (clicked) {
      afterClick.push({ method: request.method(), url: request.url(), body: request.postData() });
    }
  };
  // The context also reports the worker's own requests (its chunks, the lazy sample chunk).
  page.context().on('request', onRequest);
  const worker = page.waitForEvent('worker');

  await page.goto('/de/demo');
  await page.waitForLoadState('networkidle');
  const beforeClick = scripts.length;
  clicked = true;

  await page.getByRole('button', { name: de.demo.preview.loadSample }).click();

  await worker;
  await expect(page.getByRole('heading', { name: de.demo.preview.summary })).toBeVisible();
  await expect(page.getByTestId('count-critical')).toHaveText(String(expected.critical));
  await expect(page.getByTestId('count-warning')).toHaveText(String(expected.warning));
  await expect(page.getByTestId('count-hidden')).toHaveText(String(expected.hidden));
  expect(expected.hidden).toBeGreaterThan(0);
  // The worker, parsers and sample data load only on demand, not with the page.
  expect(scripts.length).toBeGreaterThan(beforeClick);
  // Privacy (ADR-0003): the run only fetches same-origin code; nothing is sent anywhere.
  const origin = new URL(page.url()).origin;
  for (const request of afterClick) {
    expect(request.method, request.url).toBe('GET');
    expect(request.body, request.url).toBeNull();
    expect(new URL(request.url).origin, request.url).toBe(origin);
  }
});
