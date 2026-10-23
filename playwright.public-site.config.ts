import { defineConfig, devices } from '@playwright/test';

// 公開サイト（共通トップ・製品LP・問い合わせ・法務）の受入検証。
// 先に npm run build を実行する。本番と同じ CSP（full-enforce）で、DB・認証なしに確認できる範囲だけを扱う。
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3120';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname)) {
  throw new Error('公開サイトの受入検証は隔離されたローカル環境に限定します。');
}

export default defineConfig({
  testDir: 'src/__tests__/e2e-playwright',
  testMatch: 'public-site.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL, locale: 'ja-JP' },
  webServer:
    process.env.PLAYWRIGHT_PUBLIC_SITE_SERVER === 'external'
      ? undefined
      : {
          command: `npm run start -- --port ${new URL(baseURL).port || '3120'}`,
          url: `${baseURL}/terms`,
          reuseExistingServer: false,
          timeout: 60_000,
          env: { ...process.env, CSP_ROLLOUT_PHASE: 'full-enforce' },
        },
});
