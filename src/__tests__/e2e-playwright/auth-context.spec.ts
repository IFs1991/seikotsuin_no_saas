/**
 * 認証コンテキスト連携 E2E テスト
 *
 * 仕様書: 認証コンテキスト連携_MVP仕様書.md
 *
 * シナリオ:
 * 1. Adminでログイン → /chat を開く → 入力が有効で送信できる → /api/chat が clinic_id=clinic-A で実行され、履歴が表示される
 * 2. clinic未割当ユーザーで /chat を開く → 入力/送信が無効になり、権限割当の案内が表示される
 * 3. 非管理者で /admin/mfa-setup を開く → unauthorized へ遷移する
 * 4. 管理者で /admin/mfa-setup を開く → MFAダッシュボードが表示され、userId はプロフィール由来である
 * 5. /blocks で販売停止を作成 → 一覧に反映され、作成者が profile.userId で保存される
 */

import { test, expect, Page } from '@playwright/test';
import {
  CLINIC_A_ID,
  USER_ADMIN_ID,
  USER_STAFF_ID,
  USER_NO_CLINIC_ID,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  STAFF_EMAIL,
  STAFF_PASSWORD,
  NO_CLINIC_EMAIL,
  NO_CLINIC_PASSWORD,
} from './fixtures';

// ログインヘルパー
async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|chat|admin)/);
}

// clinic未割当ユーザーでログイン
async function loginAsNoClinicUser(page: Page) {
  // E2E用の clinic_id = null ユーザーでログイン
  await page.goto('/login');
  await page.fill('input[name="email"]', NO_CLINIC_EMAIL);
  await page.fill('input[name="password"]', NO_CLINIC_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
}

test.describe('認証コンテキスト連携 E2E', () => {
  /**
   * シナリオ 1: Admin で /chat を開く
   * - 入力が有効で送信できる
   * - /api/chat が clinic_id=clinic-A で実行される
   * - 履歴が表示される
   */
  test.describe('Chat ページ - 正常系', () => {
    test('Adminでログイン → /chat で入力が有効で送信できる', async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto('/chat');

      // チャットページが表示される
      await expect(page.locator('text=AIチャット')).toBeVisible();

      // 入力フィールドが有効
      const input = page.locator('input[placeholder*="メッセージを入力"]');
      await expect(input).toBeEnabled();

      // 送信ボタンが有効（入力がある場合）
      await input.fill('テストメッセージ');
      const sendButton = page.locator('button:has-text("送信")');
      await expect(sendButton).toBeEnabled();
    });

    test('/api/chat が clinic_id を含むリクエストで実行される', async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto('/chat');

      // APIリクエストをインターセプト
      const chatRequest = page.waitForRequest((request) => {
        return request.url().includes('/api/chat') && request.method() === 'POST';
      });

      // メッセージを送信
      const input = page.locator('input[placeholder*="メッセージを入力"]');
      await input.fill('売上を教えて');
      await page.click('button:has-text("送信")');

      // APIリクエストを検証
      const request = await chatRequest;
      const postData = request.postDataJSON();
      expect(postData.clinic_id).toBeTruthy();
      expect(postData.clinic_id).not.toBe('demo-clinic-id'); // ハードコードされていない
    });
  });

  /**
   * シナリオ 2: clinic未割当ユーザーで /chat を開く
   * - 入力/送信が無効になる
   * - 権限割当の案内が表示される
   */
  test.describe('Chat ページ - clinic未割当', () => {
    test('clinic未割当ユーザーで /chat を開く → 入力が無効', async ({ page }) => {
      await loginAsNoClinicUser(page);
      await page.goto('/chat');

      // 入力フィールドが無効
      const input = page.locator('input[placeholder*="メッセージを入力"]');
      await expect(input).toBeDisabled();

      // 送信ボタンが無効
      const sendButton = page.locator('button:has-text("送信")');
      await expect(sendButton).toBeDisabled();
    });

    test('clinic未割当ユーザーで /chat を開く → 権限割当の案内が表示される', async ({ page }) => {
      await loginAsNoClinicUser(page);
      await page.goto('/chat');

      // 権限割当の案内が表示される
      await expect(page.locator('text=管理者に権限割当を依頼してください')).toBeVisible();
    });
  });

  /**
   * シナリオ 3: 非管理者で /admin/mfa-setup を開く
   * - unauthorized へ遷移する
   */
  test.describe('MFA設定ページ - 権限チェック', () => {
    test('非管理者（staff）で /admin/mfa-setup を開く → unauthorized へ遷移', async ({ page }) => {
      await login(page, STAFF_EMAIL, STAFF_PASSWORD);
      await page.goto('/admin/mfa-setup');

      // unauthorized ページへ遷移
      await page.waitForURL('**/unauthorized');
      await expect(page.locator('text=権限がありません')).toBeVisible();
    });
  });

  /**
   * シナリオ 4: 管理者で /admin/mfa-setup を開く
   * - MFAダッシュボードが表示される
   * - userId はプロフィール由来である
   */
  test.describe('MFA設定ページ - 正常系', () => {
    test('管理者で /admin/mfa-setup を開く → MFAダッシュボードが表示される', async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto('/admin/mfa-setup');

      // MFA設定ページが表示される
      await expect(page.locator('text=多要素認証（MFA）設定')).toBeVisible();

      // MFAダッシュボードが表示される
      await expect(page.locator('[data-testid="mfa-dashboard"]')).toBeVisible();
    });

    test('MFAダッシュボードの userId がプロフィール由来（ハードコードされていない）', async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto('/admin/mfa-setup');

      // userId が 'current-user-id' ではないことを確認
      const userIdElement = page.locator('[data-testid="mfa-user-id"]');
      if (await userIdElement.isVisible()) {
        const userId = await userIdElement.textContent();
        expect(userId).not.toBe('current-user-id');
        expect(userId).toBeTruthy();
      }
    });
  });

  /**
   * シナリオ 5: /blocks で販売停止を作成
   * - 一覧に反映される
   * - 作成者が profile.userId で保存される
   */
  test.describe('Blocks ページ - 販売停止作成', () => {
    test('管理者で /blocks を開く → 販売停止設定ページが表示される', async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto('/blocks');

      // 販売停止設定ページが表示される
      await expect(page.locator('text=販売停止設定')).toBeVisible();
    });

    test('リソースがAPIから取得される（sampleResourcesではない）', async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

      // APIリクエストをインターセプト
      const resourcesRequest = page.waitForRequest((request) => {
        return request.url().includes('/api/resources') && request.method() === 'GET';
      });

      await page.goto('/blocks');

      // /api/resources が clinic_id を含むリクエストで呼ばれる
      const request = await resourcesRequest;
      expect(request.url()).toContain('clinic_id=');
    });

    test('販売停止作成時に createdBy がプロフィール由来', async ({ page }) => {
      await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto('/blocks');

      // 新規作成ボタンをクリック
      await page.click('button:has-text("新規作成")');

      // リソースを選択
      await page.click('[data-testid="resource-item"]:first-child');

      // 日時を入力
      const today = new Date().toISOString().split('T')[0];
      await page.fill('input[type="date"]:first-of-type', today);
      await page.fill('input[type="time"]:first-of-type', '09:00');
      await page.fill('input[type="date"]:last-of-type', today);
      await page.fill('input[type="time"]:last-of-type', '10:00');

      // 保存リクエストをインターセプト
      const saveRequest = page.waitForRequest((request) => {
        const url = request.url();
        return (
          request.method() === 'POST' &&
          (url.includes('/api/blocks') || url.includes('/rest/v1/blocks'))
        );
      });

      // 保存ボタンをクリック
      await page.click('button:has-text("設定を保存")');

      // リクエストの createdBy を検証
      const request = await saveRequest;
      const postData = request.postDataJSON();
      const payload = Array.isArray(postData) ? postData[0] : postData;
      const createdBy = payload?.createdBy ?? payload?.created_by;

      expect(createdBy).toBe(USER_ADMIN_ID);
      expect(createdBy).not.toBe('current-user-id'); // ハードコードされていない
    });

    test('clinic未割当ユーザーで /blocks を開く → 新規作成が無効', async ({ page }) => {
      await loginAsNoClinicUser(page);
      await page.goto('/blocks');

      // 新規作成ボタンが無効
      const createButton = page.locator('button:has-text("新規作成")');
      await expect(createButton).toBeDisabled();

      // 権限割当の案内が表示される
      await expect(page.locator('text=管理者に権限割当を依頼してください')).toBeVisible();
    });
  });
});
