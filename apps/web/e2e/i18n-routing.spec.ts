import { expect, test } from '@playwright/test';

import de from '../messages/de.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };

const ROUTES = [
  { de: '/de', en: '/en', title: { de: de.home.title, en: en.home.title } },
  { de: '/de/demo', en: '/en/demo', title: { de: de.demo.title, en: en.demo.title } },
  { de: '/de/kontakt', en: '/en/contact', title: { de: de.contact.title, en: en.contact.title } },
  {
    de: '/de/impressum',
    en: '/en/legal-notice',
    title: { de: de.legalNotice.title, en: en.legalNotice.title },
  },
  {
    de: '/de/datenschutz',
    en: '/en/privacy',
    title: { de: de.privacy.title, en: en.privacy.title },
  },
] as const;

for (const locale of ['de', 'en'] as const) {
  for (const route of ROUTES) {
    const path = route[locale];

    test(`${path} returns 200 with lang="${locale}" and one localized h1`, async ({ page }) => {
      const response = await page.goto(path);

      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(path);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.title[locale]);
    });
  }
}

test.describe('root redirect', () => {
  test.describe('German browser', () => {
    test.use({ locale: 'de-DE' });

    test('/ redirects to /de', async ({ page }) => {
      await page.goto('/');

      await expect(page).toHaveURL(/\/de$/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    });
  });

  test.describe('English browser', () => {
    test.use({ locale: 'en-US' });

    test('/ redirects to /en', async ({ page }) => {
      await page.goto('/');

      await expect(page).toHaveURL(/\/en$/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    });
  });

  test.describe('browser in an unsupported language', () => {
    test.use({ locale: 'fr-FR' });

    test('/ falls back to the default locale /de', async ({ page }) => {
      await page.goto('/');

      await expect(page).toHaveURL(/\/de$/);
    });
  });
});

test('an internal German slug under /en redirects to the English slug', async ({ page }) => {
  await page.goto('/en/kontakt');

  await expect(page).toHaveURL(/\/en\/contact$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.contact.title);
});

test('sets no cookies on redirects or pages (no consent banner in Phase 1)', async ({
  page,
  context,
}) => {
  // `set-cookie` is only exposed asynchronously; collect the lookups and settle them before asserting.
  const lookups: Promise<string | null>[] = [];
  page.on('response', (response) => {
    lookups.push(
      response.headerValue('set-cookie').then((header) => header && `${response.url()}: ${header}`),
    );
  });

  await page.goto('/');
  for (const route of ROUTES) {
    await page.goto(route.de);
    await page.goto(route.en);
  }

  const setCookieHeaders = (await Promise.all(lookups)).filter((entry) => entry !== null);
  expect(setCookieHeaders).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});

test('announces hreflang alternates for a localized slug in the Link header', async ({
  request,
  baseURL,
}) => {
  const response = await request.get('/en/contact', { maxRedirects: 0 });
  const link = response.headers().link ?? '';
  const origin = String(baseURL);

  expect(response.status()).toBe(200);
  expect(link).toContain(`<${origin}/de/kontakt>; rel="alternate"; hreflang="de"`);
  expect(link).toContain(`<${origin}/en/contact>; rel="alternate"; hreflang="en"`);
  expect(link).toContain(`<${origin}/kontakt>; rel="alternate"; hreflang="x-default"`);
});
