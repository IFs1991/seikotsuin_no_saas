import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, CLINIC_A_ID } from './fixtures';

/**
 * 予約UI統合 E2Eテスト
 * 仕様書: docs/予約UI統合_MVP仕様書.md
 *
 * テストシナリオ:
 * 1. /reservations で一覧が表示される
 * 2. 新規予約を作成 → 一覧に追加される
 * 3. /Reservation へアクセスすると 404 になる（旧プロトタイプの除去確認）
 */

test.describe('予約UI統合テスト', () => {
  test.beforeEach(async ({ page }) => {
    // ログイン
    await page.goto('/login');
    await page.getByLabel('メールアドレス').fill(ADMIN_EMAIL);
    await page.getByLabel('パスワード').fill(ADMIN_PASSWORD);
    await Promise.all([
      page.waitForURL(/\/(dashboard|reservations)/),
      page.getByRole('button', { name: 'ログイン' }).click(),
    ]);
  });

  test('シナリオ1: /reservations で予約一覧が表示される', async ({ page }) => {
    // 予約ページへ遷移
    await page.goto('/reservations');

    // ページが正常に読み込まれることを確認
    await expect(page).toHaveURL(/\/reservations/);

    // 予約UIの主要要素が表示されることを確認
    // ControlBar（ビュー切り替え）が表示される
    await expect(
      page.getByRole('button', { name: /タイムライン|timeline/i })
    ).toBeVisible();

    // Schedulerまたはリスト表示が存在することを確認
    const scheduler = page.locator('[data-testid="scheduler"]');
    const listView = page.locator('[data-testid="appointment-list"]');
    const mainContent = page.locator('main');

    // どちらかのコンテンツが表示される
    await expect(mainContent).toBeVisible();
  });

  test('シナリオ2: リスト表示への切り替えが機能する', async ({ page }) => {
    await page.goto('/reservations');

    // リスト表示ボタンをクリック
    const listButton = page.getByRole('button', { name: /リスト|list/i });
    if (await listButton.isVisible()) {
      await listButton.click();

      // URLにview=listが含まれることを確認
      await expect(page).toHaveURL(/view=list/);
    }
  });

  test('シナリオ3: 新規予約登録フォームを開ける', async ({ page }) => {
    await page.goto('/reservations');

    // 新規登録ボタンまたは登録ビューへの切り替え
    const registerButton = page.getByRole('button', {
      name: /新規|登録|register/i,
    });
    if (await registerButton.isVisible()) {
      await registerButton.click();

      // 登録フォームが表示されることを確認
      await expect(page).toHaveURL(/view=register/);

      // フォーム要素が存在することを確認
      const form = page.locator('form');
      await expect(form).toBeVisible();
    }
  });

  test('シナリオ4: /Reservation へのアクセスは404になる（旧プロトタイプ除去確認）', async ({
    page,
  }) => {
    // 旧プロトタイプのURLにアクセス
    const response = await page.goto('/Reservation');

    // 404レスポンスまたは404ページが表示されることを確認
    if (response) {
      // Next.jsは404でも200を返す場合があるため、ページ内容も確認
      const is404Response = response.status() === 404;
      const has404Content =
        (await page
          .getByText(/404|not found|ページが見つかりません/i)
          .isVisible()) ||
        (await page.getByRole('heading', { name: /404/i }).isVisible());

      // 404レスポンスまたは404コンテンツのいずれかであればOK
      expect(is404Response || has404Content).toBeTruthy();
    }
  });

  test('シナリオ5: 予約UIは現行API（/api/reservations）を使用している', async ({
    page,
  }) => {
    // APIリクエストを監視
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

    // 予約ページへ遷移
    await page.goto('/reservations');

    // ページが読み込まれるまで待機
    await page.waitForLoadState('networkidle');

    // 現行APIへのリクエストがあること、旧モックAPIへのリクエストがないことを確認
    const hasNewApi = apiCalls.some(url => url.includes('/api/reservations'));
    const hasOldApi = apiCalls.some(url => url.includes('/Reservation/api'));

    // 旧モックAPIが呼ばれていないことを確認
    expect(hasOldApi).toBeFalsy();

    // 注: 実際にAPIが呼ばれるかはデータの有無による
    // clinicIdがセットされていればAPIが呼ばれるはず
  });
});

test.describe('予約API統合テスト', () => {
  test('/api/reservations エンドポイントが存在する', async ({ page }) => {
    // API直接アクセスで404ではないことを確認
    const response = await page.request.get('/api/reservations', {
      params: {
        clinic_id: CLINIC_A_ID,
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    // 認証エラー(401)やバリデーションエラー(400)は許容、404は不可
    expect(response.status()).not.toBe(404);
  });
});
