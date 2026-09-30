import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] }, grepInvert: /@live/ },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] }, grepInvert: /@live/ },
    // Hits the real GitHub API; run on demand with `pnpm e2e:live`.
    { name: 'live', use: { ...devices['Desktop Chrome'] }, grep: /@live/ },
  ],
  webServer: {
    // Test the production build, not the dev server.
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
