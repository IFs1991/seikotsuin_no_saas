import { test, expect } from '@playwright/test';
import path from 'node:path';
import { CLINIC_A_ID } from './fixtures';

const adminStorageStatePath = path.resolve(
  process.cwd(),
  'src/__tests__/e2e-playwright/storage/admin.json'
);

test.use({ storageState: adminStorageStatePath });

test.describe('予約UI統合テスト', () => {
  test('シナリオ1: /reservations でタイムラインが表示される', async ({
    page,
  }) => {
    await page.goto('/reservations');

    await expect(page).toHaveURL(/\/reservations/);
    await expect(
      page.getByRole('button', { name: 'タイムライン' })
    ).toBeVisible();
    await expect(page.locator('.timeline-scroll')).toBeVisible();
  });

  test('シナリオ2: リスト表示への切り替えが機能する', async ({ page }) => {
    await page.goto('/reservations');

    await page.getByRole('button', { name: '予約一覧' }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(
      page.getByRole('columnheader', { name: '時間' })
    ).toBeVisible();
  });

  test('シナリオ3: 新規予約登録フォームを開ける', async ({ page }) => {
    await page.goto('/reservations');

    await page.getByRole('button', { name: '新規登録' }).click();
    await expect(page).toHaveURL(/view=register/);
    await expect(
      page.getByRole('heading', { name: '新規予約登録' })
    ).toBeVisible();
  });

  test('シナリオ4: /Reservation へのアクセスは404になる（旧プロトタイプ除去確認）', async ({
    page,
  }) => {
    const response = await page.goto('/Reservation');

    if (response) {
      const is404Response = response.status() === 404;
      const has404Content =
        (await page
          .getByText(/404|not found|ページが見つかりません/i)
          .isVisible()) ||
        (await page.getByRole('heading', { name: /404/i }).isVisible());

      expect(is404Response || has404Content).toBeTruthy();
    }
  });

  test('シナリオ5: 予約UIは現行API（/api/reservations）を使用している', async ({
    page,
  }) => {
    const apiCalls: string[] = [];

    page.on('request', request => {
      const url = request.url();
      if (
        url.includes('/api/reservations') ||
        url.includes('/Reservation/api')
      ) {
        apiCalls.push(url);
      }
    });

    await page.goto('/reservations');
    await page.waitForLoadState('networkidle');

    const hasOldApi = apiCalls.some(url => url.includes('/Reservation/api'));
    expect(hasOldApi).toBeFalsy();
  });
});

test.describe('予約API統合テスト', () => {
  test(' /api/reservations エンドポイントが存在する', async ({ page }) => {
    const response = await page.request.get('/api/reservations', {
      params: {
        clinic_id: CLINIC_A_ID,
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    expect(response.status()).not.toBe(404);
  });
});
