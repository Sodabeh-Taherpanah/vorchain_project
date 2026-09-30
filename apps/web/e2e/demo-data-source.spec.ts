import { readFileSync } from 'node:fs';

import { expect, test, type Page, type Request } from '@playwright/test';

import de from '../messages/de.json' with { type: 'json' };

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

/** Privacy (ADR-0003): after page load only same-origin code is fetched; nothing is sent. */
function expectNothingSent(page: Page, sent: readonly SentRequest[]) {
  const origin = new URL(page.url()).origin;
  for (const request of sent) {
    expect(request.method, request.url).toBe('GET');
    expect(request.body, request.url).toBeNull();
    expect(new URL(request.url).origin, request.url).toBe(origin);
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
  expectNothingSent(page, sent);
});
