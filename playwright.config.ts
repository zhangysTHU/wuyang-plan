import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 75_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    channel: process.env.WUYANG_TEST_EDGE === '1' ? 'msedge' : undefined,
  },
  projects: [
    { name: 'desktop', testMatch: '**/desktop.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testMatch: '**/mobile.spec.ts', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
})
