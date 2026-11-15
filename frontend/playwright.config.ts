import { defineConfig, devices } from '@playwright/test'

/**
 * E2E navigation tests (see e2e/README.md).
 *
 * - `chromium`: the real user journeys, against the Vite dev server with every API request answered
 *   in the browser from the fixtures of `src/test/` — offline, deterministic, fast.
 * - `live` (optional): a few read-only checks against a deployed API, through the dev server's own
 *   proxy. Its tests are skipped unless `E2E_API_BASE_URL` is set.
 */
const PORT = Number(process.env.E2E_PORT ?? 4173)
const LIVE_PORT = Number(process.env.E2E_LIVE_PORT ?? 4174)
const LIVE_API = process.env.E2E_API_BASE_URL

/** The API base URL of the mocked project: a host that does not exist, so nothing can leak to a real server. */
const MOCK_API = 'http://api.stocklock.test'

// Software WebGL, so the 3D scenes are really drawn in headless Chromium, on any machine.
const chrome = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1440, height: 900 },
  locale: 'fr-CA',
  timezoneId: 'America/Toronto',
  launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] },
}

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // The dev server compiles every module on demand and the scenes are drawn in software: a few workers only.
  workers: process.env.CI ? 2 : 3,
  reporter: [['list'], ['html', { outputFolder: 'e2e/.report', open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'chromium',
      testIgnore: /live\//,
      use: { ...chrome, baseURL: `http://localhost:${PORT}` },
    },
    {
      name: 'live',
      testMatch: /live\/.*\.spec\.ts/,
      timeout: 90_000,
      use: { ...chrome, baseURL: `http://localhost:${LIVE_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_BASE_URL: MOCK_API, VITE_DEV_PROXY_TARGET: '' },
    },
    // Only when a deployed API is given: a second dev server that proxies `/api` to it (same origin, no CORS).
    ...(LIVE_API
      ? [
          {
            command: `npm run dev -- --port ${LIVE_PORT} --strictPort`,
            url: `http://localhost:${LIVE_PORT}`,
            reuseExistingServer: false,
            timeout: 60_000,
            env: { VITE_DEV_PROXY_TARGET: LIVE_API },
          },
        ]
      : []),
  ],
})
