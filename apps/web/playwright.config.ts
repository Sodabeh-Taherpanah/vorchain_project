import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
// `localhost`, not `127.0.0.1`: with `--hostname 127.0.0.1`, Next.js 16 turns the proxy's rewrite
// (e.g. /en/contact -> /en/kontakt) into an absolute `localhost` URL, treats it as external and
// runs the proxy again, which redirects back to /en/contact in an endless loop. Upstream bug:
// https://github.com/vercel/next.js/issues/94745 (details in ADR-0004, Consequences).
const HOSTNAME = 'localhost';
const BASE_URL = `http://${HOSTNAME}:${String(PORT)}`;
const isCI = Boolean(process.env.CI);

/** The demo's core suite (privacy, file formats, axe) also runs on Firefox and WebKit. */
const CROSS_BROWSER_SPECS = /\/demo\.spec\.ts$/;

/**
 * E2E tests run against the production build (`next build` runs first via the turbo
 * `test:e2e` -> `build` dependency). Every spec runs on Chromium; `demo.spec.ts` also on Firefox
 * and WebKit (ADR-0008, P1-20). CI runs one project per job (`--project`).
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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: CROSS_BROWSER_SPECS },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: CROSS_BROWSER_SPECS },
  ],
  webServer: {
    command: `next start --hostname ${HOSTNAME} --port ${String(PORT)}`,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});
