import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(fileName: string) {
  const envPath = path.resolve(process.cwd(), fileName);

  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

['.env.test', '.env.local', '.env'].forEach(loadEnvFile);

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://localhost:3000';
const isLocalBaseUrl =
  baseURL.includes('localhost') || baseURL.includes('127.0.0.1');
const browserChannel =
  process.env.PLAYWRIGHT_BROWSER_CHANNEL || process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: 'src/__tests__/e2e-playwright',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: isLocalBaseUrl
    ? {
        command: 'npm run dev',
        url: baseURL,
        // E2E_INVITE_MODE などの環境変数を反映するため、常に新しいサーバーを起動
        // @see docs/stabilization/spec-staff-invite-e2e-stability-v0.1.md
        reuseExistingServer: false,
        timeout: 120_000,
        // E2E専用環境変数をwebServerに渡す
        env: {
          ...process.env,
          E2E_INVITE_MODE: process.env.E2E_INVITE_MODE || 'skip',
        },
      }
    : undefined,
  globalSetup: './src/__tests__/e2e-playwright/global-setup.ts',
  globalTeardown: './src/__tests__/e2e-playwright/global-teardown.ts',
  projects: [
    {
      name: 'chromium',
      use: browserChannel
        ? { ...devices['Desktop Chrome'], channel: browserChannel }
        : { ...devices['Desktop Chrome'] },
    },
  ],
});
