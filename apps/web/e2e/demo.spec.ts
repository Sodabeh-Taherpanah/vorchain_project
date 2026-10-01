/**
 * The demo's privacy promise (backlog P1-20, ADR-0003, ADR-0008): uploaded data never leaves the
 * browser.
 */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { expect, test, type Page, type Request } from '@playwright/test';

import golden from '../../../reference/python-prototype/golden/sample_data_de.json' with { type: 'json' };
import de from '../messages/de.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };
import { MARKED_DESCRIPTION, PRIVACY_MARKER } from './fixtures/generate.ts';

const SAMPLE_NAMES = ['artikel', 'bedarf', 'bestellungen', 'lieferanten', 'lieferhistorie'];
const FIXTURES = new URL('./fixtures/', import.meta.url);

const MIME = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

function fixture(path: string, mimeType: string) {
  return {
    name: path.split('/').at(-1) ?? path,
    mimeType,
    buffer: readFileSync(new URL(path, FIXTURES)),
  };
}

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Buffer | null;
}

/**
 * Records every request of the page and its context from the first navigation on: documents,
 * chunks, the Web Worker's own fetches, downloads. A `Request` seen by both listeners counts once.
 * `requests()` resolves the full headers (cookies included), so call it after the network is idle.
 */
function recordRequests(page: Page) {
  const seen = new Set<Request>();
  const sockets: string[] = [];
  const record = (request: Request) => {
    seen.add(request);
  };
  page.on('request', record);
  page.context().on('request', record);
  page.on('websocket', (socket) => sockets.push(socket.url()));
  const requests = () =>
    Promise.all(
      Array.from(seen, async (request): Promise<RecordedRequest> => ({
        url: request.url(),
        method: request.method(),
        headers: await request.allHeaders(),
        body: request.postDataBuffer(),
      })),
    );
  return { requests, sockets };
}

/** Case-insensitive search in raw and percent-decoded form, so `%2D` or lower case cannot hide it. */
function contains(haystack: string, needle: string): boolean {
  const lower = needle.toLowerCase();
  let decoded = haystack;
  try {
    decoded = decodeURIComponent(haystack);
  } catch {
    // Not valid percent-encoding: the raw text is still searched.
  }
  return haystack.toLowerCase().includes(lower) || decoded.toLowerCase().includes(lower);
}

/**
 * Privacy (ADR-0003): only the app's own origin is contacted (`blob:` URLs of that origin are the
 * export download), nothing is posted, and no URL or header carries the marker.
 */
function expectNoLeak(requests: readonly RecordedRequest[], origin: string, marker: string) {
  for (const request of requests) {
    const where = `${request.method} ${request.url}`;
    expect(new URL(request.url).origin, where).toBe(origin);
    expect(['GET', 'HEAD'], where).toContain(request.method);
    expect(request.body, where).toBeNull();
    expect(contains(request.url, marker), where).toBe(false);
    for (const [name, value] of Object.entries(request.headers)) {
      expect(contains(`${name}: ${value}`, marker), `${where} header ${name}`).toBe(false);
    }
  }
}

async function openDemo(page: Page, locale: 'de' | 'en' = 'de') {
  await page.goto(`/${locale}/demo`);
  await expect(page.getByTestId('file-input')).toBeAttached();
}

/** Uploads files and fixes the analysis date to the golden one (uploads default to today). */
async function analyseUpload(
  page: Page,
  files: Parameters<Page['setInputFiles']>[1],
  locale: 'de' | 'en' = 'de',
) {
  const messages = locale === 'de' ? de : en;
  await page.getByTestId('file-input').setInputFiles(files);
  await page.getByLabel(messages.demo.settings.asOf).fill(golden.asOf);
  const table = page
    .getByRole('region', { name: messages.demo.report.table.region })
    .getByRole('table');
  await expect(table).toBeVisible();
  await expect(page.locator('table[data-total]')).toHaveAttribute(
    'data-total',
    String(golden.exceptions.length),
  );
  return table;
}

test.describe('privacy', () => {
  test('no request carries the uploaded content: load, analyse, drawer and export', async ({
    page,
  }) => {
    const { requests, sockets } = recordRequests(page);
    const worker = page.waitForEvent('worker');
    await openDemo(page);
    await page.waitForLoadState('networkidle');

    const table = await analyseUpload(
      page,
      SAMPLE_NAMES.map((name) => fixture(`privacy/${name}.csv`, MIME.csv)),
    );
    await worker;
    // The marker went through the whole pipeline, so its absence below means something.
    await expect(table).toContainText(PRIVACY_MARKER);
    await expect(table).toContainText(MARKED_DESCRIPTION);

    await page.getByRole('button', { name: `Details zu ${PRIVACY_MARKER}` }).click();
    const dialog = page.getByRole('dialog', { name: `Bestandsverlauf ${PRIVACY_MARKER}` });
    await expect(dialog.locator('.recharts-line-curve')).toHaveCount(2);
    await dialog.getByRole('button', { name: de.demo.report.drawer.showTable }).click();
    await expect(dialog.getByRole('table')).toContainText(PRIVACY_MARKER);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: de.demo.report.export.csv }).click();
    const exported = await readFile(await (await download).path(), 'utf8');
    expect(exported).toContain(PRIVACY_MARKER);
    expect(exported).toContain(MARKED_DESCRIPTION);
    await page.waitForLoadState('networkidle');

    const sent = await requests();
    const origin = new URL(page.url()).origin;
    // At least the page, its chunks and the lazily loaded worker: the loop cannot pass empty.
    expect(sent.filter((r) => r.url.startsWith(origin)).length).toBeGreaterThan(5);
    expectNoLeak(sent, origin, PRIVACY_MARKER);
    expect(sockets).toEqual([]);
  });
});
