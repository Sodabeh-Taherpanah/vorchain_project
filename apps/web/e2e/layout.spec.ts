import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import de from '../messages/de.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };

const STUB_PAGES = [
  '/de',
  '/de/demo',
  '/de/kontakt',
  '/de/impressum',
  '/de/datenschutz',
  '/en',
  '/en/demo',
  '/en/contact',
  '/en/legal-notice',
  '/en/privacy',
] as const;

test.describe('localized 404', () => {
  for (const [locale, messages] of [
    ['de', de],
    ['en', en],
  ] as const) {
    test(`/${locale}/xyz answers 404 in ${locale} inside the site layout`, async ({ page }) => {
      const response = await page.goto(`/${locale}/xyz`);

      expect(response?.status()).toBe(404);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.notFound.title);
      await expect(page.getByRole('banner')).toBeVisible();
      await expect(page.getByRole('contentinfo')).toBeVisible();
    });
  }

  test('a path without a locale gets the branded bilingual 404', async ({ page }) => {
    const response = await page.goto('/missing.png');

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(de.notFound.title);
  });
});

test.describe('accessibility (axe)', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const path of STUB_PAGES) {
      test(`${path} has no serious violations in ${colorScheme} mode`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(path);

        const { violations } = await new AxeBuilder({ page }).analyze();
        const blocking = violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical',
        );

        expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      });
    }
  }
});

test.describe('layout shell', () => {
  test('at 360 px no page scrolls horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const path of STUB_PAGES) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    await page.goto('/de/kontakt');
    await page.screenshot({ path: test.info().outputPath('kontakt-360.png'), fullPage: true });
  });

  test('the skip link is the first tab stop and moves focus to main', async ({ page }) => {
    await page.goto('/de');

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: de.layout.skipLink });
    await expect(skip).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  test('the locale switcher keeps the current page', async ({ page }) => {
    await page.goto('/de/kontakt');

    await page.getByRole('link', { name: en.localeSwitcher.en }).click();

    await expect(page).toHaveURL(/\/en\/contact$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.contact.title);
  });

  test('the theme toggle overrides the system scheme without storing anything', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/de');
    const toggle = page.getByRole('button', { name: de.theme.toggle });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();

    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });

  test('pages load nothing from third-party origins (self-hosted fonts)', async ({
    page,
    baseURL,
  }) => {
    const ownOrigin = new URL(baseURL ?? '').origin;
    const foreign: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol !== 'data:' && url.origin !== ownOrigin) {
        foreign.push(request.url());
      }
    });

    await page.goto('/de');
    await page.waitForLoadState('networkidle');

    expect(foreign).toEqual([]);
  });
});
