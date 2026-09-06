import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3110';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname)) {
  throw new Error('production-build検証は隔離されたローカル環境に限定します。');
}

// 先にnpm run buildを実行する。外部server指定は修正前buildとの比較検証用。
export default defineConfig({
  testDir: 'src/__tests__/e2e-playwright',
  testMatch: 'production-csp.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL },
  webServer:
    process.env.PLAYWRIGHT_PRODUCTION_SERVER === 'external'
      ? undefined
      : {
          command: `npm run start -- --port ${new URL(baseURL).port || '3110'}`,
          url: `${baseURL}/login`,
          reuseExistingServer: false,
          timeout: 60_000,
          env: { ...process.env, CSP_ROLLOUT_PHASE: 'full-enforce' },
        },
});
