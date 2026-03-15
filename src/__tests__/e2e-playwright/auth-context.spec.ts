import { test, expect } from '@playwright/test';
import path from 'node:path';

const adminStorageStatePath = path.resolve(
  process.cwd(),
  'src/__tests__/e2e-playwright/storage/admin.json'
);
const staffStorageStatePath = path.resolve(
  process.cwd(),
  'src/__tests__/e2e-playwright/storage/staff.json'
);

test.describe('認証コンテキスト連携 E2E', () => {
  test.describe('Chat ページ - 正常系', () => {
    test.use({ storageState: adminStorageStatePath });

    test('Adminで /chat を開くとチャットUIが表示される', async ({ page }) => {
      await page.goto('/chat');

      await expect(page.getByText('AIチャット')).toBeVisible();
      await expect(page.getByPlaceholder('メッセージを入力...')).toBeVisible();
      await expect(page.getByRole('button', { name: '送信' })).toBeVisible();
    });

    test('/api/chat が clinic_id を含むリクエストで実行される', async ({
      page,
    }) => {
      await page.goto('/chat');

      const chatRequest = page.waitForRequest(request => {
        return (
          request.url().includes('/api/chat') && request.method() === 'POST'
        );
      });

      await page.getByPlaceholder('メッセージを入力...').fill('売上を教えて');
      await page.getByRole('button', { name: '送信' }).click();

      const request = await chatRequest;
      const postData = request.postDataJSON();
      expect(postData.clinic_id).toBeTruthy();
      expect(postData.clinic_id).not.toBe('demo-clinic-id');
    });
  });

  test.describe('MFA設定ページ - 権限チェック', () => {
    test.use({ storageState: staffStorageStatePath });

    test('非管理者（staff）で /admin/mfa-setup を開くと unauthorized へ遷移', async ({
      page,
    }) => {
      await page.goto('/admin/mfa-setup');

      await page.waitForURL('**/unauthorized');
      await expect(
        page.getByRole('heading', { name: 'アクセス権限がありません' })
      ).toBeVisible();
    });
  });

  test.describe('MFA設定ページ - 正常系', () => {
    test.use({ storageState: adminStorageStatePath });

    test('管理者で /admin/mfa-setup を開くと MFAダッシュボードが表示される', async ({
      page,
    }) => {
      await page.goto('/admin/mfa-setup');

      await expect(
        page.getByRole('heading', { name: '多要素認証（MFA）設定' })
      ).toBeVisible();
      await expect(page.getByTestId('mfa-dashboard')).toBeVisible();
    });
  });
});
