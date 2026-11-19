import { expect, test, type Page, type Request } from '@playwright/test';
import { generateScaleDataset } from '@vorchain/sample-data/scale';

import de from '../messages/de.json' with { type: 'json' };

/**
 * Large uploads (backlog V-13b): progress, cancel, a paged result table and a responsive page.
 * CI runs 200 000 demand rows (8.4 MB); `E2E_LARGE_ROWS=1000000` runs the 42 MB case locally.
 */
const ROWS = Number(process.env.E2E_LARGE_ROWS ?? 200_000);

/** The longest a single task may block the page (Long Tasks API reports tasks above 50 ms). */
const LONG_TASK_BUDGET_MS = ROWS >= 1_000_000 ? 1000 : 500;

test.setTimeout(240_000);

function largeFiles() {
  const dataset = generateScaleDataset({
    materials: Math.round(ROWS / 5),
    demandRows: ROWS,
    seed: 2026,
  });
  return {
    asOf: dataset.asOf,
    files: dataset.files.map(({ name, content }) => ({
      name,
      mimeType: 'text/csv',
      buffer: Buffer.from(content, 'utf8'),
    })),
  };
}

/**
 * Records the page's long tasks. `longestSince(mark)` is the longest one that started after `mark`
 * (a `performance.now()` value): Playwright's own transfer of the files into the page is a long
 * task too, but it is the test harness and not the app, so the check starts when it is done.
 */
async function watchLongTasks(page: Page) {
  await page.evaluate(() => {
    const tasks: [number, number][] = [];
    (window as unknown as { __longTasks: [number, number][] }).__longTasks = tasks;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) tasks.push([entry.startTime, entry.duration]);
    }).observe({ type: 'longtask', buffered: true });
  });
  return {
    mark: () => page.evaluate(() => performance.now()),
    longestSince: (mark: number) =>
      page.evaluate(
        (from) =>
          Math.max(
            0,
            ...(window as unknown as { __longTasks: [number, number][] }).__longTasks
              .filter(([start]) => start >= from)
              .map(([, duration]) => duration),
          ),
        mark,
      ),
  };
}

async function openDemo(page: Page) {
  const sent: { method: string; url: string; body: string | null }[] = [];
  let ready = false;
  page.context().on('request', (request: Request) => {
    if (ready)
      sent.push({ method: request.method(), url: request.url(), body: request.postData() });
  });
  await page.goto('/de/demo');
  await page.waitForLoadState('networkidle');
  ready = true;
  return sent;
}

test.describe('a large upload', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Long Tasks API: Chromium only');
  // Why serial: both tests load a very large file; running them side by side
  // starves the main thread and makes the long-task budget flaky.
  test.describe.configure({ mode: 'serial' });

  test('shows progress, pages the result and keeps the page responsive', async ({ page }) => {
    const sent = await openDemo(page);
    const tasks = await watchLongTasks(page);
    const { files, asOf } = largeFiles();

    await page.getByTestId('file-input').setInputFiles(files);
    const afterUpload = await tasks.mark();
    await expect(
      page.getByRole('progressbar', { name: de.demo.status.progressLabel }),
    ).toBeVisible();
    await expect(page.getByRole('status')).toHaveText(de.demo.status.complete, {
      timeout: 120_000,
    });
    await page.getByLabel(de.demo.settings.asOf).fill(asOf);

    const region = page.getByRole('region', { name: de.demo.report.table.region });
    await expect(region.getByRole('rowheader').first()).toBeVisible({ timeout: 120_000 });
    const total = Number(await region.getByRole('table').getAttribute('data-total'));
    expect(total).toBeGreaterThan(250); // more than the print limit, so the table is paged
    await expect(region.getByRole('rowheader')).toHaveCount(10);

    await page.getByRole('button', { name: /weitere anzeigen/ }).click();
    await expect(region.getByRole('rowheader')).toHaveCount(110);

    const longestTask = await tasks.longestSince(afterUpload);
    test
      .info()
      .annotations.push({ type: 'longest-task-ms', description: String(Math.round(longestTask)) });
    expect(longestTask).toBeLessThan(LONG_TASK_BUDGET_MS);
    // Privacy (ADR-0003): nothing left the page, not even in a URL.
    const origin = new URL(page.url()).origin;
    for (const request of sent) {
      expect(request.method, request.url).toBe('GET');
      expect(request.body, request.url).toBeNull();
      expect(new URL(request.url).origin, request.url).toBe(origin);
    }
  });

  test('cancel stops the load and a new load works afterwards', async ({ page }) => {
    await openDemo(page);
    const { files } = largeFiles();

    await page.getByTestId('file-input').setInputFiles(files);
    await page.getByRole('button', { name: de.demo.status.cancel }).click();

    await expect(page.getByRole('status')).toHaveText(de.demo.status.cancelled);
    await expect(page.getByRole('progressbar')).toHaveCount(0);

    await page.getByRole('button', { name: de.demo.dataSource.loadSample }).click();
    await expect(page.getByRole('status')).toHaveText(de.demo.status.complete);
  });
});
