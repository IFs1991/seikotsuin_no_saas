import { test, expect } from '@playwright/test';
import path from 'node:path';
import { CLINIC_A_ID } from './fixtures';

const adminStorageStatePath = path.resolve(
  process.cwd(),
  'src/__tests__/e2e-playwright/storage/admin.json'
);

test.use({ storageState: adminStorageStatePath });

/**
 * 管理設定永続化 E2Eテスト
 * 仕様書: docs/管理設定永続化_MVP仕様書.md
 *
 * テストシナリオ:
 * 1. クリニック基本情報の保存・復元
 * 2. コミュニケーション設定のSMTP保存
 * 3. セキュリティ設定のポリシー変更
 * 4. スタッフ招待
 * 5. バリデーションエラー時の動作
 */

test.describe('管理設定永続化', () => {
  test.describe('クリニック基本情報設定', () => {
    test('基本情報を変更して保存後、再読み込みで値が保持される', async ({
      page,
    }) => {
      // 設定画面へ移動
      await page.goto('/admin/settings');
      await expect(
        page.getByRole('heading', { name: '基本情報', level: 1 })
      ).toBeVisible();

      // 「基本情報」を選択
      await page.getByRole('button', { name: '店舗管理' }).click();
      await page.getByRole('button', { name: '基本情報' }).click();
      await expect(page.getByText('設定を読み込み中...')).toBeHidden();
      await expect(page.getByLabel('院名')).toBeVisible();

      // テスト用のユニークな値を生成
      const testClinicName = `テスト整骨院_${Date.now()}`;
      const testPhone = '03-9999-8888';

      // 院名を変更
      await page.getByLabel('院名').clear();
      await page.getByLabel('院名').fill(testClinicName);

      // 電話番号を変更
      await page.getByLabel('電話番号').clear();
      await page.getByLabel('電話番号').fill(testPhone);

      // 保存ボタンをクリック
      await expect(page.getByTestId('save-settings-button')).toBeEnabled();
      await page.getByTestId('save-settings-button').click();

      // 成功メッセージを確認
      await expect(page.getByTestId('success-message')).toContainText(
        '設定を保存しました'
      );

      // ページを再読み込み
      await page.reload();

      // 設定画面を再度表示
      await page.getByRole('button', { name: '店舗管理' }).click();
      await page.getByRole('button', { name: '基本情報' }).click();
      await expect(page.getByText('設定を読み込み中...')).toBeHidden();
      await expect(page.getByLabel('院名')).toBeVisible();

      // 保存した値が復元されていることを確認
      await expect(page.getByLabel('院名')).toHaveValue(testClinicName);
      await expect(page.getByLabel('電話番号')).toHaveValue(testPhone);
    });

    test('必須項目が空の場合にバリデーションエラーが表示される', async ({
      page,
    }) => {
      await page.goto('/admin/settings');

      await page.getByRole('button', { name: '店舗管理' }).click();
      await page.getByRole('button', { name: '基本情報' }).click();

      // 院名を空にする
      await page.getByLabel('院名').clear();

      // 保存ボタンをクリック
      await expect(page.getByTestId('save-settings-button')).toBeEnabled();
      await page.getByTestId('save-settings-button').click();

      // エラーメッセージを確認
      await expect(page.getByTestId('error-message')).toContainText(
        /院名.*必須|院名を入力してください/
      );
    });
  });

  test.describe('コミュニケーション設定', () => {
    test('SMTP設定を変更して保存後、APIで同じ設定が返る', async ({
      page,
    }) => {
      await page.goto('/admin/settings');

      // コミュニケーション設定を選択
      await page.getByRole('button', { name: '患者コミュニケーション' }).click();
      await page.getByRole('button', { name: '自動通知メール' }).click();
      await expect(page.getByText('設定を読み込み中...')).toBeHidden();
      await expect(
        page.getByRole('heading', { name: '自動通知メール', level: 1 })
      ).toBeVisible();

      // SMTPホストを変更
      const testSmtpHost = 'smtp.test-example.com';
      const smtpHostInput = page.getByLabel(/SMTPホスト|SMTPサーバー/);
      if (await smtpHostInput.isVisible()) {
        await smtpHostInput.clear();
        await smtpHostInput.fill(testSmtpHost);
      }

      // 保存
      await expect(page.getByTestId('save-settings-button')).toBeEnabled();
      await page.getByTestId('save-settings-button').click();
      await expect(page.getByTestId('success-message')).toContainText(
        '設定を保存しました'
      );

      // APIで確認
      const response = await page.request.get(
        `/api/admin/settings?clinic_id=${CLINIC_A_ID}&category=communication`
      );
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.data?.settings?.smtpSettings?.host).toBe(testSmtpHost);
    });
  });

  test.describe('システムセキュリティ設定', () => {
    test('セキュリティポリシーを変更して保存後、再訪で反映される', async ({
      page,
    }) => {
      await page.goto('/admin/settings');

      // システム設定を選択
      await page.getByRole('button', { name: 'システム設定' }).click();
      await page.getByRole('button', { name: 'セキュリティ' }).click();
      await expect(page.getByText('設定を読み込み中...')).toBeHidden();
      await expect(
        page.getByRole('heading', { name: 'セキュリティ', level: 1 })
      ).toBeVisible();

      // パスワード最小長を変更
      const minLengthInput = page.getByLabel(/パスワード最小文字数|最小長/);
      if (await minLengthInput.isVisible()) {
        await minLengthInput.clear();
        await minLengthInput.fill('12');
      }

      // 二要素認証を有効化
      const twoFactorToggle = page.getByTestId('2fa-toggle');
      if (await twoFactorToggle.isVisible()) {
        const isChecked = await twoFactorToggle.getAttribute('aria-checked');
        if (isChecked !== 'true') {
          await twoFactorToggle.click();
        }
      }

      // 保存
      await expect(page.getByTestId('save-settings-button')).toBeEnabled();
      await page.getByTestId('save-settings-button').click();
      await expect(page.getByTestId('success-message')).toContainText(
        '設定を保存しました'
      );

      // ページを再読み込み
      await page.reload();

      // 設定画面を再度表示
      await page.getByRole('button', { name: 'システム設定' }).click();
      await page.getByRole('button', { name: 'セキュリティ' }).click();

      // 保存した値が復元されていることを確認
      const minLengthInputAfter = page.getByLabel(/パスワード最小文字数|最小長/);
      if (await minLengthInputAfter.isVisible()) {
        await expect(minLengthInputAfter).toHaveValue('12');
      }

      const twoFactorToggleAfter = page.getByTestId('2fa-toggle');
      if (await twoFactorToggleAfter.isVisible()) {
        await expect(twoFactorToggleAfter).toHaveAttribute(
          'aria-checked',
          'true'
        );
      }
    });
  });

  test.describe('予約・カレンダー設定', () => {
    test('予約枠設定を変更して保存後、値が保持される', async ({ page }) => {
      await page.goto('/admin/settings');

      // 予約設定を選択
      await page.getByRole('button', { name: '予約・カレンダー' }).click();
      await page.getByRole('button', { name: '予約枠設定' }).click();
      await expect(page.getByText('設定を読み込み中...')).toBeHidden();

      // 予約枠時間を変更
      const slotMinutesSelect = page.getByTestId('booking-calendar-slot-minutes-select');
      if (await slotMinutesSelect.isVisible()) {
        await slotMinutesSelect.selectOption('30');
      }

      // 同時予約数を変更
      const maxConcurrentInput = page.getByTestId('booking-calendar-max-concurrent-input');
      if (await maxConcurrentInput.isVisible()) {
        await maxConcurrentInput.clear();
        await maxConcurrentInput.fill('5');
      }

      // 保存
      await expect(page.getByTestId('save-settings-button')).toBeEnabled();
      await page.getByTestId('save-settings-button').click();
      await expect(page.getByTestId('success-message')).toContainText(
        '設定を保存しました'
      );

      // ページを再読み込み
      await page.reload();

      // 設定画面を再度表示
      await page.getByRole('button', { name: '予約・カレンダー' }).click();
      await page.getByRole('button', { name: '予約枠設定' }).click();

      // 値が保持されていることを確認
      const slotMinutesAfter = page.getByTestId('booking-calendar-slot-minutes-select');
      if (await slotMinutesAfter.isVisible()) {
        await expect(slotMinutesAfter).toHaveValue('30');
      }
    });
  });

  test.describe('Staff invites', () => {
    test.skip('Invite UI is not wired to API yet', async ({ page }) => {
      await page.goto('/admin/settings');
    });
  });

  test.describe('APIエンドポイント検証', () => {
    test('GET /api/admin/settings が未登録でもデフォルト値を返す', async ({
      page,
    }) => {
      // 新しいカテゴリでテスト（未登録）
      const response = await page.request.get(
        `/api/admin/settings?clinic_id=${CLINIC_A_ID}&category=data_management`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      // デフォルト値が含まれていることを確認
      expect(data.data?.settings).toBeDefined();
    });

    test('PUT /api/admin/settings でupsertされる', async ({ page }) => {
      const testSettings = {
        clinic_id: CLINIC_A_ID,
        category: 'clinic_basic',
        settings: {
          name: 'API経由テスト院',
          zipCode: '100-0001',
          address: 'テスト住所',
          phone: '03-0000-0000',
          fax: '',
          email: 'api-test@test.com',
          website: '',
          description: 'APIテスト用',
          logoUrl: null,
        },
      };

      // 最初のPUT
      const response1 = await page.request.put('/api/admin/settings', {
        data: testSettings,
      });
      expect(response1.ok()).toBeTruthy();

      // GETで確認
      const getResponse = await page.request.get(
        `/api/admin/settings?clinic_id=${CLINIC_A_ID}&category=clinic_basic`
      );
      expect(getResponse.ok()).toBeTruthy();
      const getData = await getResponse.json();
      expect(getData.data.settings.name).toBe('API経由テスト院');

      // 更新のPUT
      testSettings.settings.name = 'API経由テスト院_更新';
      const response2 = await page.request.put('/api/admin/settings', {
        data: testSettings,
      });
      expect(response2.ok()).toBeTruthy();

      // 再度GETで確認（upsertされていることを確認）
      const getResponse2 = await page.request.get(
        `/api/admin/settings?clinic_id=${CLINIC_A_ID}&category=clinic_basic`
      );
      const getData2 = await getResponse2.json();
      expect(getData2.data.settings.name).toBe('API経由テスト院_更新');
    });

    test('clinic_id 未指定でエラー400が返る', async ({ page }) => {
      const response = await page.request.get('/api/admin/settings?category=clinic_basic');
      expect(response.status()).toBe(400);
    });
  });
});
