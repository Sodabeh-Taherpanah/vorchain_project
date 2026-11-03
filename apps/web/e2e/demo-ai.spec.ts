/**
 * The optional AI explanation (V-19, ADR-0015, ADR-0018). The promise: AI is off by default and
 * nothing leaves the browser for a model until the visitor agrees AND clicks "Explain" for one
 * material; then exactly the facts schema is sent, nothing else from the file. The model endpoints
 * are stubbed with `page.route`; no real model is contacted.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request, type Route } from '@playwright/test';

import golden from '../../../reference/python-prototype/golden/sample_data_de.json' with { type: 'json' };
import de from '../messages/de.json' with { type: 'json' };

const ai = de.demo.report.drawer.ai;
const LOCAL_ENDPOINT = 'http://localhost:11434/api/chat';
const REMOTE_BASE = 'https://api.example.test/v1';

/** The exact keys of `ExplanationFacts` (packages/llm/src/explain/facts.ts). */
const FACT_KEYS = [
  'actionCodes',
  'asOf',
  'criticalDate',
  'daysUntil',
  'erpViewDate',
  'hidden',
  'materialId',
  'materialName',
  'minProjectedStock',
  'reasonCodes',
  'safetyStock',
  'severity',
  'supplier',
].sort();

const ANSWER = JSON.stringify({
  summary: 'Das Teil wird knapp.',
  riskDrivers: ['Lieferant meist verspätet'],
  recommendedActions: ['Lieferant anrufen'],
  confidence: 'medium',
});

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** Answers the CORS preflight and the chat call the way Ollama and an OpenAI-compatible API do. */
async function stubModel(route: Route, shape: 'ollama' | 'openai') {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS });
    return;
  }
  const body =
    shape === 'ollama'
      ? { model: 'm', message: { role: 'assistant', content: ANSWER } }
      : { model: 'm', choices: [{ message: { content: ANSWER } }] };
  await route.fulfill({ status: 200, headers: CORS, json: body });
}

async function openDrawer(page: Page, materialId: string) {
  await page.goto('/de/demo');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: de.demo.dataSource.loadSample }).click();
  await page.getByRole('button', { name: `Details zu ${materialId}` }).click();
  return page.getByRole('dialog', { name: `Bestandsverlauf ${materialId}` });
}

/** URLs of every http(s) request that is not for the app's own origin (`data:`/`blob:` stay local). */
function offOrigin(page: Page): Request[] {
  const seen: Request[] = [];
  // The first web request is the app's own page; its origin is the only one that is allowed.
  let own: string | null = null;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    own ??= url.origin;
    if (url.origin !== own) seen.push(request);
  });
  return seen;
}

const urls = (requests: readonly Request[]) => requests.map((r) => r.method() + ' ' + r.url());

function factsOf(request: Request): Record<string, unknown> {
  const payload = JSON.parse(request.postData() ?? '') as {
    messages: { role: string; content: string }[];
  };
  const user = payload.messages.find((m) => m.role === 'user')?.content ?? '';
  const json = /<facts>\n([\s\S]*)\n<\/facts>/.exec(user)?.[1] ?? '';
  return JSON.parse(json) as Record<string, unknown>;
}

test.describe('AI explanation', () => {
  test('is off by default: no model request, and the model code is not even loaded', async ({
    page,
  }) => {
    const external = offOrigin(page);
    const scripts: string[] = [];
    page.on('response', (response) => {
      if (response.request().resourceType() === 'script') {
        void response.text().then((body) => scripts.push(body));
      }
    });
    const dialog = await openDrawer(page, 'M0030');
    await expect(dialog.getByRole('button', { name: ai.enable })).toBeVisible();
    await expect(dialog.getByRole('button', { name: ai.explain })).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    expect(urls(external)).toEqual([]);
    // The Ollama adapter is only fetched after consent and a click (lazy `import()`).
    expect(scripts.some((body) => body.includes('/api/chat'))).toBe(false);
  });

  test('agreeing sends nothing; the click sends only the facts of that one material', async ({
    page,
  }) => {
    const external = offOrigin(page);
    await page.route(LOCAL_ENDPOINT, (route) => stubModel(route, 'ollama'));
    const dialog = await openDrawer(page, 'M0030');

    await dialog.getByRole('button', { name: ai.enable }).click();
    await expect(dialog.getByText(ai.consent.sendsNames)).toBeVisible();
    await dialog.getByRole('button', { name: ai.consent.activate }).click();
    await expect(dialog.getByRole('button', { name: ai.explain })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(urls(external), 'nothing is sent before "Explain"').toEqual([]);

    const sent = page.waitForRequest((r) => r.url() === LOCAL_ENDPOINT && r.method() === 'POST');
    await dialog.getByRole('button', { name: ai.explain }).click();
    const request = await sent;
    await expect(dialog.getByTestId('ai-result')).toContainText('Das Teil wird knapp.');

    const facts = factsOf(request);
    expect(Object.keys(facts).sort()).toEqual(FACT_KEYS);
    expect(facts.materialId).toBe('M0030');
    // The canary: no other material of the file appears anywhere in the request.
    const body = request.postData() ?? '';
    for (const other of golden.exceptions) {
      if (other.material_id !== 'M0030') expect(body).not.toContain(other.material_id);
    }
    const hosts = new Set(external.map((r) => new URL(r.url()).origin));
    expect([...hosts]).toEqual(['http://localhost:11434']);
  });

  test('a remote provider needs its own agreement that names the host', async ({ page }) => {
    await page.route(`${REMOTE_BASE}/chat/completions`, (route) => stubModel(route, 'openai'));
    const dialog = await openDrawer(page, 'M0030');
    await dialog.getByRole('button', { name: ai.enable }).click();
    await dialog.getByRole('radio', { name: ai.consent.remote }).check();
    await dialog.getByLabel(ai.consent.baseUrlRemote).fill(REMOTE_BASE);
    await dialog.getByLabel(ai.consent.model).fill('gpt-test');
    await dialog.getByLabel(ai.consent.apiKey).fill('sk-test-key');

    const activate = dialog.getByRole('button', { name: ai.consent.activate });
    await expect(activate).toBeDisabled();
    await dialog
      .getByRole('checkbox', { name: ai.consent.remoteAgree.replace('{host}', 'api.example.test') })
      .check();
    await expect(activate).toBeEnabled();
    await activate.click();

    const sent = page.waitForRequest((r) => r.url() === `${REMOTE_BASE}/chat/completions`);
    await dialog.getByRole('button', { name: ai.explain }).click();
    const request = await sent;
    expect(request.headers().authorization).toBe('Bearer sk-test-key');
    expect(Object.keys(factsOf(request)).sort()).toEqual(FACT_KEYS);
    await expect(dialog.getByTestId('ai-result')).toBeVisible();
  });

  test('nothing is stored: a reload starts with AI off and no key in browser storage', async ({
    page,
  }) => {
    const dialog = await openDrawer(page, 'M0030');
    await dialog.getByRole('button', { name: ai.enable }).click();
    await dialog.getByRole('radio', { name: ai.consent.remote }).check();
    await dialog.getByLabel(ai.consent.baseUrlRemote).fill(REMOTE_BASE);
    await dialog.getByLabel(ai.consent.model).fill('gpt-test');
    await dialog.getByLabel(ai.consent.apiKey).fill('sk-secret-123');
    const stored = () =>
      page.evaluate(() =>
        JSON.stringify([
          Object.entries(localStorage),
          Object.entries(sessionStorage),
          document.cookie,
        ]),
      );
    expect(await stored()).not.toContain('sk-secret-123');

    const reopened = await openDrawer(page, 'M0030');
    await expect(reopened.getByRole('button', { name: ai.enable })).toBeVisible();
    expect(await stored()).not.toContain('sk-secret-123');
  });

  for (const stage of ['intro', 'consent', 'remote consent'] as const) {
    test(`the drawer has no serious axe violations: AI ${stage}`, async ({ page }) => {
      const dialog = await openDrawer(page, 'M0030');
      if (stage !== 'intro') await dialog.getByRole('button', { name: ai.enable }).click();
      if (stage === 'remote consent') {
        await dialog.getByRole('radio', { name: ai.consent.remote }).check();
        await dialog.getByLabel(ai.consent.baseUrlRemote).fill(REMOTE_BASE);
      }
      await expect(dialog.getByTestId('ai-panel')).toBeVisible();
      const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(serious).toEqual([]);
    });
  }
});
