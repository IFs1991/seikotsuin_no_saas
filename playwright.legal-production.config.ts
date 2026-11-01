import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3122';
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
  throw new Error('Production配信制御の試験はローカルのみです。');
}
export default defineConfig({
  testDir: 'src/__tests__/e2e-playwright',
  testMatch: 'legal-production-hold.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL },
  webServer: {
    command: `npm run start -- --port ${new URL(baseURL).port || '3122'}`,
    url: `${baseURL}/terms`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ...process.env,
      CSP_ROLLOUT_PHASE: 'full-enforce',
      VERCEL_ENV: 'production',
      LEGAL_PUBLICATION_MODE: 'hold',
      WORKS_LEGAL_PUBLICATION_MODE: 'hold',
    },
  },
});
