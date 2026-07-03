import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

import { toJSTDateString } from '../../lib/jst';

const adminStorageStatePath = path.resolve(
  process.cwd(),
  'src/__tests__/e2e-playwright/storage/admin.json'
);

const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const SAMPLE_RESERVATION_PATIENTS = [
  '渡辺 結衣',
  '小林 誠一',
  '加藤 さくら',
] as const;

test.use({
  storageState: adminStorageStatePath,
  viewport: MOBILE_VIEWPORT,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ timeout: 120_000 });

function formatMobileDateLabel(dateKey: string): string {
  const [yearText, monthText, dayText] = dateKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'] as const;

  return `${month}/${day}（${weekdays[date.getUTCDay()]}）`;
}

async function expectProductionShell(page: Page): Promise<void> {
  await expect(page.locator('body')).toHaveAttribute(
    'data-mobile-uiux-shell',
    'production'
  );
  await expect(
    page.locator('[data-mobile-uiux-production-root]')
  ).toBeVisible();
}

test.describe('mobile-uiux production smoke', () => {
  test('renders home production shell without mock device chrome', async ({
    page,
  }) => {
    await page.goto('/mobile-uiux/screens/home', {
      waitUntil: 'domcontentloaded',
    });

    await expectProductionShell(page);
    await expect(page.getByText('STAGE CONTROLS')).toHaveCount(0);
    await expect(page.getByText('iPHONE')).toHaveCount(0);
  });

  test('navigates to reservations through bottom navigation', async ({
    page,
  }) => {
    await page.goto('/mobile-uiux/screens/home', {
      waitUntil: 'domcontentloaded',
    });

    await Promise.all([
      page.waitForURL(/\/mobile-uiux\/screens\/reservations$/),
      page.getByRole('button', { name: '予約へ移動' }).click(),
    ]);
    await page.waitForLoadState('domcontentloaded');
    await expectProductionShell(page);
  });

  test('shows seeded reservations instead of sample reservation rows', async ({
    page,
  }) => {
    const todayLabel = formatMobileDateLabel(toJSTDateString());

    await page.goto('/mobile-uiux/screens/reservations', {
      waitUntil: 'domcontentloaded',
    });

    await expectProductionShell(page);
    await expect(page.getByText(todayLabel)).toBeVisible();
    await expect(page.getByText('E2E Customer 1').first()).toBeVisible();
    await expect(page.getByText('E2E Customer 2').first()).toBeVisible();
    await expect(
      page.getByText('本日の予約', { exact: true }).first().locator('..')
    ).toContainText('3');

    const body = page.locator('body');
    for (const samplePatient of SAMPLE_RESERVATION_PATIENTS) {
      await expect(body).not.toContainText(samplePatient);
    }
  });

  test('redirects unauthenticated users to login', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
      viewport: MOBILE_VIEWPORT,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await context.clearCookies();
    await context.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    try {
      await page.goto('/mobile-uiux/screens/home', {
        waitUntil: 'domcontentloaded',
      });
      await expect(page).toHaveURL(/\/login\?redirectTo=/);
    } finally {
      await context.close();
    }
  });

  test('saves the daily report and shows mutation success status', async ({
    page,
  }) => {
    await page.goto('/mobile-uiux/screens/daily-reports', {
      waitUntil: 'domcontentloaded',
    });

    await expectProductionShell(page);
    await page
      .getByRole('button', { name: /入力する|編集/ })
      .first()
      .click();
    await expect(page.getByText('日報入力')).toBeVisible();

    await page.getByRole('button', { name: '日報を保存' }).click();

    await expect(
      page.locator('[data-mobile-uiux-mutation-status="success"]')
    ).toContainText('日報を保存しました');
    await expect(page.getByText('本日の日報は提出済みです')).toBeVisible();
  });
});
