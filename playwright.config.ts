import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:8000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 8000 --bind 127.0.0.1',
    cwd: '.',
    url: 'http://127.0.0.1:8000/locale-test.html',
    reuseExistingServer: true,
  },
})
