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
  '/de/xyz',
  '/en/xyz',
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
    await page.goto('/de/xyz');
    await page.screenshot({ path: test.info().outputPath('404-360.png'), fullPage: true });
  });

  test('the header stays on top while scrolling and marks the current page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/de/kontakt');

    const nav = page.getByRole('banner').getByRole('navigation', { name: de.nav.label });
    await expect(nav.getByRole('link', { name: de.nav.contact })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: de.nav.demo })).not.toHaveAttribute('aria-current');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    const box = await page.getByRole('banner').boundingBox();
    expect(box?.y).toBe(0);
    await page.screenshot({ path: test.info().outputPath('shell-1280.png') });
  });

  test('at 360 px the menu opens, traps Escape and returns focus', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/de');
    const trigger = page.getByRole('button', { name: de.nav.menu });

    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: de.nav.menuTitle });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: de.nav.cta })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('menu-360.png') });

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByRole('link', { name: de.nav.contact }).click();
    await expect(page).toHaveURL(/\/de\/kontakt$/);
    await expect(dialog).toBeHidden();
  });

  test('the open menu has no serious axe violations in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/de');
    await page.getByRole('button', { name: de.nav.menu }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
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
