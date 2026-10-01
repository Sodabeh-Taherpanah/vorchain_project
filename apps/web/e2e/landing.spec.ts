import { expect, test } from '@playwright/test';

import de from '../messages/de.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };

const LOCALES = [
  { locale: 'de', messages: de, contact: '/de/kontakt' },
  { locale: 'en', messages: en, contact: '/en/contact' },
] as const;

for (const { locale, messages, contact } of LOCALES) {
  const m = messages.home;

  test.describe(`landing page (${locale})`, () => {
    test('renders every section in order', async ({ page }) => {
      await page.goto(`/${locale}`);

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(m.title);
      await expect(page.getByRole('heading', { level: 2 })).toHaveText([
        m.problem.title,
        m.howItWorks.title,
        m.privacy.title,
        m.faq.title,
        m.cta.title,
      ]);
    });

    test('the hero CTA opens the demo', async ({ page }) => {
      await page.goto(`/${locale}`);

      // Scoped to <main>: the header repeats the same call to action on every page.
      await page.getByRole('main').getByRole('link', { name: m.hero.cta }).click();

      await expect(page).toHaveURL(new RegExp(`/${locale}/demo$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.demo.title);
    });

    test('the closing CTA opens the contact page', async ({ page }) => {
      await page.goto(`/${locale}`);

      await page.getByRole('link', { name: m.cta.button }).click();

      await expect(page).toHaveURL(new RegExp(`${contact}$`));
    });
  });
}

test('FAQ disclosures open and close with the keyboard', async ({ page }) => {
  await page.goto('/de');
  const item = de.home.faq.items.data;
  const summary = page.locator('summary', { hasText: item.question });
  const answer = page.getByText(item.answer);
  await expect(answer).toBeHidden();

  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(answer).toBeVisible();

  await page.keyboard.press('Space');
  await expect(answer).toBeHidden();
});

test('the reserved chart slot keeps its height on load (no layout shift)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/de');

  const box = await page.getByTestId('hidden-risk-chart-slot').boundingBox();

  // 16:10 of the 328 px content width at 360 px (16 px gutters).
  expect(box?.width).toBe(328);
  expect(box?.height).toBe(205);
});
