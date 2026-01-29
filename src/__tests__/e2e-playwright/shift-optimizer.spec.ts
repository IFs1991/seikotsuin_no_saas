import { test, expect } from '@playwright/test';
import path from 'node:path';
import {
  CLINIC_A_ID,
  RESOURCE_IDS,
  STAFF_EMAIL,
  USER_STAFF_ID,
} from './fixtures';

const E2E_STAFF_NAMES = ['E2E Staff 1', 'E2E Staff 2'];
const DUMMY_STAFF_NAMES = ['山田 太郎', '鈴木 花子', '田中 健太', '佐藤 恵美'];

const staffStorageStatePath = path.resolve(
  process.cwd(),
  'src/__tests__/e2e-playwright/storage/staff.json'
);

test.use({ storageState: staffStorageStatePath });

function formatDateJst(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

async function openShiftOptimizerTab(page: Page) {
  const optimizerTab = page.getByRole('button', { name: 'シフト最適化' });
  await expect(optimizerTab).toBeVisible();
  await optimizerTab.click();
}

async function mockProfileApi(page: Page) {
  await page.route('**/api/auth/profile', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: USER_STAFF_ID,
          email: STAFF_EMAIL,
          role: 'staff',
          clinicId: CLINIC_A_ID,
          isActive: true,
          isAdmin: false,
        },
      }),
    })
  );
}

async function waitForStaffPageReady(page: Page) {
  await expect(page.locator('[role="status"]')).not.toBeVisible({
    timeout: 10000,
  });
}

async function mockStaffAnalysisApi(page: Page) {
  const emptyHourlyReservations = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
  }));

  await page.route(/\/api\/staff(\?.*)?$/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          staffMetrics: {
            dailyPatients: 0,
            totalRevenue: 0,
            averageSatisfaction: 0,
          },
          revenueRanking: [],
          satisfactionCorrelation: [],
          performanceTrends: {},
          shiftAnalysis: {
            hourlyReservations: emptyHourlyReservations,
            utilizationRate: 0,
            recommendations: [],
          },
          totalStaff: 0,
          activeStaff: 0,
        },
      }),
    })
  );
}

async function mockEmptyShiftOptimizerApis(page: Page) {
  await page.route('**/api/staff/shifts**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { shifts: [], total: 0 },
      }),
    })
  );

  await page.route('**/api/staff/preferences**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { preferences: [], total: 0 },
      }),
    })
  );

  await page.route('**/api/staff/demand-forecast**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { forecasts: [], hourlyDistribution: [] },
      }),
    })
  );
}

function toIsoFromJst(dateStr: string, hour: number) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 9, 0, 0)).toISOString();
}

async function mockShiftOptimizerDataApis(page: Page, dateJst: string) {
  const shifts = [
    {
      id: 'shift-e2e-1',
      clinic_id: CLINIC_A_ID,
      staff_id: RESOURCE_IDS[0],
      start_time: toIsoFromJst(dateJst, 9),
      end_time: toIsoFromJst(dateJst, 18),
      status: 'confirmed',
      notes: 'E2E shift 1',
      staff: { id: RESOURCE_IDS[0], name: 'E2E Staff 1', type: 'staff' },
    },
    {
      id: 'shift-e2e-2',
      clinic_id: CLINIC_A_ID,
      staff_id: RESOURCE_IDS[1],
      start_time: toIsoFromJst(dateJst, 10),
      end_time: toIsoFromJst(dateJst, 17),
      status: 'proposed',
      notes: 'E2E shift 2',
      staff: { id: RESOURCE_IDS[1], name: 'E2E Staff 2', type: 'staff' },
    },
  ];

  const preferences = [
    {
      id: 'pref-e2e-1',
      clinic_id: CLINIC_A_ID,
      staff_id: RESOURCE_IDS[0],
      preference_text: '週末の勤務を希望します',
      preference_type: 'shift_pattern',
      priority: 3,
      is_active: true,
      staff: { id: RESOURCE_IDS[0], name: 'E2E Staff 1', type: 'staff' },
    },
  ];

  const forecasts = [
    {
      date: dateJst,
      hour: 10,
      count: 3,
      level: 'medium',
    },
  ];

  const hourlyDistribution = [
    { hour: 10, totalCount: 3, averageCount: 3, level: 'medium' },
  ];

  await page.route('**/api/staff/shifts**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { shifts, total: shifts.length },
      }),
    })
  );

  await page.route('**/api/staff/preferences**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { preferences, total: preferences.length },
      }),
    })
  );

  await page.route('**/api/staff/demand-forecast**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { forecasts, hourlyDistribution },
      }),
    })
  );
}

test.describe('シフト最適化 - 実データ化', () => {
  test.beforeEach(async ({ page }) => {
    await mockProfileApi(page);
    await mockStaffAnalysisApi(page);
  });

  test('シフトデータあり: 実データのスタッフ名が表示される', async ({
    page,
  }) => {
    await mockShiftOptimizerDataApis(page, formatDateJst(new Date()));

    await page.goto('/staff');
    await waitForStaffPageReady(page);
    await openShiftOptimizerTab(page);

    await expect(page.getByText('シフト最適化提案')).toBeVisible({
      timeout: 20000,
    });

    for (const name of E2E_STAFF_NAMES) {
      await expect(page.getByText(name).first()).toBeVisible();
    }

    const pageContent = await page.textContent('body');
    for (const dummyName of DUMMY_STAFF_NAMES) {
      expect(pageContent).not.toContain(dummyName);
    }
  });

  test('データなし: 空状態（案内文）が表示される', async ({ page }) => {
    await mockEmptyShiftOptimizerApis(page);

    await page.goto('/staff');
    await waitForStaffPageReady(page);
    await openShiftOptimizerTab(page);

    await expect(page.getByText('シフトデータがありません')).toBeVisible();
    await expect(page.getByText('需要予測データがありません')).toBeVisible();
    await expect(
      page.getByText('スタッフ希望データがありません')
    ).toBeVisible();
  });

  test('需要予測が予約データに基づいて表示される', async ({ page }) => {
    const todayJst = formatDateJst(new Date());

    await mockShiftOptimizerDataApis(page, todayJst);

    await page.goto('/staff');
    await waitForStaffPageReady(page);
    await openShiftOptimizerTab(page);

    await expect(page.getByRole('heading', { name: '需要予測' })).toBeVisible({
      timeout: 20000,
    });

    const forecastDate = page.getByText(todayJst).first();
    await expect(forecastDate).toBeVisible();
    await expect(page.locator('p', { hasText: '予測:' }).first()).toBeVisible();
  });

  test('APIエラー時にエラーメッセージが表示される', async ({ page }) => {
    await page.route(
      /\/api\/staff\/(shifts|preferences|demand-forecast)/,
      route => route.abort()
    );

    await page.goto('/staff');
    await waitForStaffPageReady(page);
    await openShiftOptimizerTab(page);

    const errorMessage = page.locator('text=データ取得に失敗しました');
    await expect(errorMessage).toBeVisible({ timeout: 15000 });
  });
});
