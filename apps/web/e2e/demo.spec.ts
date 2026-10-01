/**
 * The demo's core promises on Chromium, Firefox and WebKit (backlog P1-20, ADR-0003, ADR-0008):
 * uploaded data never leaves the browser, CSV and XLSX give the same result, wrong files get a
 * specific message, and every state is free of serious accessibility violations.
 */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';

import golden from '../../../reference/python-prototype/golden/sample_data_de.json' with { type: 'json' };
import de from '../messages/de.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };
import {
  DATE_TYPO_LINE,
  DATE_TYPO_VALUE,
  MARKED_DESCRIPTION,
  PRIVACY_MARKER,
} from './fixtures/generate.ts';

const SAMPLE_NAMES = ['artikel', 'bedarf', 'bestellungen', 'lieferanten', 'lieferhistorie'];
const FIXTURES = new URL('./fixtures/', import.meta.url);
const SAMPLE_CSV = new URL('../../../reference/python-prototype/sample_data_de/', import.meta.url);
/** Golden-equivalent workbooks of the same sample (packages/parsers/scripts/generate-xlsx-fixtures.py). */
const SAMPLE_XLSX = new URL(
  '../../../packages/parsers/test/fixtures/xlsx/sample_data_de/',
  import.meta.url,
);

const MIME = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

function sampleFiles(dir: URL, extension: keyof typeof MIME) {
  return SAMPLE_NAMES.map((name) => ({
    name: `${name}.${extension}`,
    mimeType: MIME[extension],
    buffer: readFileSync(new URL(`${name}.${extension}`, dir)),
  }));
}

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

/**
 * The file input and buttons are in the server HTML, so they exist before React hydrates; an
 * upload or click before then is lost (seen on WebKit). Like the other demo specs, wait until the
 * page's chunks are loaded.
 */
async function openDemo(page: Page, locale: 'de' | 'en' = 'de') {
  await page.goto(`/${locale}/demo`);
  await page.waitForLoadState('networkidle');
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

async function counts(page: Page) {
  const tile = (key: string) => page.getByTestId(`tile-${key}`).locator('dd').first().textContent();
  return {
    critical: await tile('critical'),
    warning: await tile('warning'),
    hidden: await tile('hidden'),
    total: await page.locator('table[data-total]').getAttribute('data-total'),
    ranking: await page
      .getByRole('region', { name: de.demo.report.table.region })
      .getByRole('rowheader')
      .allTextContents(),
  };
}

test.describe('privacy', () => {
  test('no request carries the uploaded content: load, analyse, drawer and export', async ({
    page,
  }) => {
    const { requests, sockets } = recordRequests(page);
    const worker = page.waitForEvent('worker');
    await openDemo(page);

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

  /**
   * Guards the test above against a vacuous pass: if a browser or Playwright update stopped
   * reporting Web Worker requests, or a check in `expectNoLeak` broke, the privacy test would stay
   * green while proving nothing. Here a worker deliberately leaks, and the recorder must see it.
   */
  test('the recorder sees a leak from a Web Worker and expectNoLeak rejects it', async ({
    page,
  }) => {
    const { requests } = recordRequests(page);
    await openDemo(page);
    const origin = new URL(page.url()).origin;
    const leakUrl = `${origin}/privacy-canary`;
    // Nothing listens there, so the connection is refused, but the request is still issued and
    // reported. Not a browser-blocked "unsafe" port (1, 9, ...), which would never be requested.
    const foreignUrl = 'http://127.0.0.1:3199/privacy-canary';

    await page.evaluate(
      async ({ leakUrl, foreignUrl, marker }) => {
        const source = `
          const send = (url, init) => fetch(url, init).catch(() => undefined);
          Promise.all([
            send(${JSON.stringify(leakUrl)}, { method: 'POST', body: ${JSON.stringify(marker)} }),
            send(${JSON.stringify(foreignUrl)}),
          ]).then(() => postMessage('done'));
        `;
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        const worker = new Worker(url);
        await new Promise((resolve) => {
          worker.onmessage = resolve;
        });
        worker.terminate();
        URL.revokeObjectURL(url);
      },
      { leakUrl, foreignUrl, marker: PRIVACY_MARKER },
    );

    // The locale proxy may redirect the POST (`/de/privacy-canary`); only the original counts here.
    const canaries = async () => {
      const sent = await requests();
      return {
        sent,
        leak: sent.find((r) => r.url === leakUrl),
        foreign: sent.filter((r) => r.url === foreignUrl),
      };
    };
    await expect
      .poll(async () => {
        const { leak, foreign } = await canaries();
        return leak !== undefined && foreign.length > 0;
      })
      .toBe(true);
    const { sent, leak, foreign } = await canaries();
    expect(leak?.method).toBe('POST');
    expect(leak?.body?.toString('utf8')).toBe(PRIVACY_MARKER);

    expect(() => {
      expectNoLeak(sent, origin, PRIVACY_MARKER);
    }).toThrow();
    // The origin allowlist alone must catch a request that carries no marker.
    expect(() => {
      expectNoLeak(foreign, origin, PRIVACY_MARKER);
    }).toThrow();
    // The page's own requests pass, so the throws above come from the canaries.
    expectNoLeak(
      sent.filter((r) => !r.url.includes('/privacy-canary')),
      origin,
      PRIVACY_MARKER,
    );
  });
});

test.describe('file formats and errors', () => {
  test('the sample as XLSX shows the same counts and ranking as the CSV', async ({ page }) => {
    await openDemo(page);
    await analyseUpload(page, sampleFiles(SAMPLE_CSV, 'csv'));
    const csv = await counts(page);

    await openDemo(page);
    await analyseUpload(page, sampleFiles(SAMPLE_XLSX, 'xlsx'));
    for (const table of ['materials', 'open_purchase_orders', 'demand', 'supplier_history']) {
      await expect(page.getByTestId(`table-${table}`)).toContainText('.xlsx');
    }
    const xlsx = await counts(page);

    expect(xlsx).toEqual(csv);
    expect(xlsx.critical).toBe(
      String(golden.exceptions.filter((e) => e.severity === 'CRITICAL').length),
    );
    expect(xlsx.hidden).toBe(
      String(golden.exceptions.filter((e) => e.hidden_risk === 'yes').length),
    );
    expect(xlsx.ranking.slice(0, 3).map((id) => id.slice(0, 5))).toEqual(
      golden.exceptions.slice(0, 3).map((e) => e.material_id),
    );
  });

  for (const extension of ['pdf', 'xls'] as const) {
    test(`a .${extension} file gets the unsupported-file-type message`, async ({ page }) => {
      await openDemo(page);

      await page
        .getByTestId('file-input')
        .setInputFiles(fixture(`wrong-type/bestellungen.${extension}`, 'application/octet-stream'));

      await expect(page.getByRole('status')).toContainText(/Probleme? gefunden/);
      await expect(page.getByRole('heading', { name: de.demo.mapCheck.fileErrors })).toBeVisible();
      await expect(
        page.getByText(
          `bestellungen.${extension}: Dateien mit der Endung .${extension} werden nicht unterstützt.`,
        ),
      ).toBeVisible();
    });
  }

  test('a German date typo in a CSV names the file, line and column', async ({ page }) => {
    await openDemo(page);

    await page
      .getByTestId('file-input')
      .setInputFiles(fixture('date-typo/bestellungen.csv', MIME.csv));

    const orders = page.getByTestId('table-open_purchase_orders');
    await expect(orders).toHaveAttribute('data-status', 'invalid');
    await expect(orders).toContainText(
      `bestellungen.csv, Zeile ${String(DATE_TYPO_LINE)}, Spalte „Liefertermin“: ` +
        `„${DATE_TYPO_VALUE}“ ist kein gültiges Datum.`,
    );
  });
});

/**
 * Waits for running CSS animations (the drawer fades and slides in). axe measures colour contrast
 * as rendered, so a half-transparent drawer fails it; on CI's WebKit the fade is still running
 * when the chart is already drawn.
 */
async function animationsFinished(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

/** Fails on serious or critical axe violations anywhere on the page. */
async function expectNoSeriousViolations(page: Page) {
  await animationsFinished(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target) }));
  expect(serious).toEqual([]);
}

type DemoState = 'initial' | 'results' | 'drawer open';

/** Brings `/<locale>/demo` into `state` with the bundled sample. */
async function showState(page: Page, locale: 'de' | 'en', state: DemoState) {
  const messages = locale === 'de' ? de : en;
  await openDemo(page, locale);
  if (state === 'initial') return;

  await page.getByRole('button', { name: messages.demo.dataSource.loadSample }).click();
  await expect(
    page.getByRole('region', { name: messages.demo.report.table.region }).getByRole('table'),
  ).toBeVisible();
  if (state === 'results') return;

  const [first] = golden.exceptions;
  if (first === undefined) throw new Error('golden file has no exceptions');
  await page
    .getByRole('button', {
      name: messages.demo.report.table.details.replace('{materialId}', first.material_id),
    })
    .click();
  await expect(page.getByRole('dialog').locator('.recharts-line-curve')).toHaveCount(2);
}

for (const locale of ['de', 'en'] as const) {
  for (const state of ['initial', 'results', 'drawer open'] as const) {
    test(`/${locale}/demo has no serious axe violations (${state})`, async ({ page }) => {
      // axe walks the whole results table (every row stays in the DOM for printing); on WebKit
      // and on two-core CI runners that alone can take 10 s or more.
      test.setTimeout(60_000);
      await showState(page, locale, state);

      await expectNoSeriousViolations(page);
    });
  }
}
