import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;
const isCI = Boolean(process.env.CI);

/**
 * E2E tests run against the production build (`next build` runs first via the turbo
 * `test:e2e` -> `build` dependency). Chromium on every PR; Firefox and WebKit are added for the
 * demo suite in P1-20 (ADR-0008).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `next start --hostname 127.0.0.1 --port ${String(PORT)}`,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});
