import { defineConfig, devices } from '@playwright/test'

import { API_PORT, API_URL, PAGES_PORT, PAGES_URL } from './tests/e2e/helpers/ports'

// Chromium only: it is the engine available from the npm registry in every environment we run in
// (scripts/chromium-from-npm.mjs). Firefox and WebKit builds for Playwright are not published there.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: PAGES_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Use an existing Chromium instead of Playwright's download, for environments where
          // the download host is blocked (see scripts/chromium-from-npm.mjs).
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
          // A fake microphone (a tone) and automatic permission, for the voice tests. Denied or
          // missing microphones are simulated in those tests.
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
      },
    },
  ],
  // Fresh servers on their own ports (tests/e2e/helpers/ports.ts), never a server left running:
  // the tests need these exact options.
  webServer: [
    {
      // Static pages (dev.html, tests/e2e/pages) and the built bundle.
      command: `node scripts/serve-static.mjs --port ${PAGES_PORT} --api-url ${API_URL}`,
      cwd: '.',
      url: `${PAGES_URL}/dev.html`,
      reuseExistingServer: false,
    },
    {
      // Protocol v1 test server (server/README.md). Every test shares one site and address, so the
      // message rate limit is raised.
      command: `node server/cli.ts --port ${API_PORT} --chunk-delay 0 --messages-per-minute 10000 --quiet`,
      cwd: '.',
      url: `${API_URL}/healthz`,
      reuseExistingServer: false,
    },
  ],
})
