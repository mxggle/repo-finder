import { defineConfig, devices } from '@playwright/test'

import { resolveE2EPort } from './scripts/e2e-port.mjs'

const PORT = await resolveE2EPort()
// E2E_RECORD=1 keeps a video and trace of every test, e.g. for demos (docs/quality-report.md).
const RECORD = Boolean(process.env.E2E_RECORD)

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: RECORD ? 'on' : 'retain-on-failure',
    video: RECORD ? 'on' : 'off',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] }, grepInvert: /@live/ },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] }, grepInvert: /@live/ },
    // Hits the real GitHub API; run on demand with `pnpm e2e:live`.
    { name: 'live', use: { ...devices['Desktop Chrome'] }, grep: /@live/ },
  ],
  webServer: {
    // Test the production build, not the dev server.
    command: `pnpm build && pnpm preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
