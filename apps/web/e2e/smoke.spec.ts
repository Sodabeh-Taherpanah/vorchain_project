import { expect, test } from '@playwright/test';

test('home page returns 200 and has exactly one h1', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveCount(1);
});
