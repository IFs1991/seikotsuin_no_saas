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

// Prefer local app settings over the generic E2E fallback so Playwright waits
// on the same port that `npm run dev` is configured to use in local dev.
['.env.local', '.env.test', '.env'].forEach(loadEnvFile);

function normalizePlaywrightBaseURL(value: string): string {
  try {
    const url = new URL(value);
    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1';
      return url.toString().replace(/\/$/, '');
    }
  } catch {
    return value;
  }

  return value;
}

const rawBaseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://127.0.0.1:3000';
const baseURL = normalizePlaywrightBaseURL(rawBaseURL);
const isLocalBaseUrl =
  baseURL.includes('localhost') || baseURL.includes('127.0.0.1');
const baseURLPort = new URL(baseURL).port || '3000';
const browserChannel =
  process.env.PLAYWRIGHT_BROWSER_CHANNEL || process.env.PLAYWRIGHT_CHANNEL;
const mobileUiuxAllowedClinicIds =
  process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS ||
  '00000000-0000-0000-0000-0000000000a1';

export default defineConfig({
  testDir: 'src/__tests__/e2e-playwright',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? undefined : 1,
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
        // --hostname 127.0.0.1 は dev script の 0.0.0.0 を上書きする（後勝ち）。
        // 0.0.0.0 バインドのままだと Next middleware のリダイレクト Location が
        // http://0.0.0.0:... になり、Windows の Chromium が ERR_ADDRESS_INVALID で落ちる。
        command: `npm run dev -- --port ${baseURLPort} --hostname 127.0.0.1`,
        url: `${baseURL}/api/health`,
        // E2E_INVITE_MODE などの環境変数を反映するため、常に新しいサーバーを起動
        // @see docs/stabilization/spec-staff-invite-e2e-stability-v0.1.md
        reuseExistingServer: false,
        timeout: 120_000,
        // E2E専用環境変数をwebServerに渡す
        env: {
          ...process.env,
          E2E_INVITE_MODE: process.env.E2E_INVITE_MODE || 'skip',
          NEXT_PUBLIC_APP_URL: baseURL,
          MOBILE_UIUX_ENABLED: process.env.MOBILE_UIUX_ENABLED || 'true',
          MOBILE_UIUX_REAL_DATA_ENABLED:
            process.env.MOBILE_UIUX_REAL_DATA_ENABLED || 'true',
          MOBILE_UIUX_ALLOWED_CLINIC_IDS: mobileUiuxAllowedClinicIds,
          MOBILE_UIUX_USE_DB_ENTITLEMENTS:
            process.env.MOBILE_UIUX_USE_DB_ENTITLEMENTS || 'false',
          MOBILE_UIUX_WRITE_ENABLED:
            process.env.MOBILE_UIUX_WRITE_ENABLED || 'true',
          MOBILE_UIUX_RESERVATION_WRITE_ENABLED:
            process.env.MOBILE_UIUX_RESERVATION_WRITE_ENABLED || 'true',
          MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED:
            process.env.MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED || 'true',
          MOBILE_UIUX_SETTINGS_WRITE_ENABLED:
            process.env.MOBILE_UIUX_SETTINGS_WRITE_ENABLED || 'true',
          NEXT_PUBLIC_E2E: 'true',
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
