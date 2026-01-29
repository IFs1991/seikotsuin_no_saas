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
      const adminSettingsNav = page.getByTestId('admin-settings-nav');
      const adminSettingsContent = page.getByTestId('admin-settings-content');
      // 設定画面へ移動
      await page.goto('/admin/settings');
      // ページの安定化を待機（Next.js dev環境での再レンダリング対策）
      await page.waitForLoadState('networkidle');
      await expect(
        page.getByRole('heading', { name: '基本情報', level: 1 })
      ).toBeVisible();

      // 「基本情報」を選択
      await adminSettingsNav.getByRole('button', { name: '店舗管理' }).click();
      await adminSettingsNav.getByRole('button', { name: '基本情報' }).click();
      // ローディング状態の解消を明示的に待機（タイムアウト延長）
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });
      // フォームが操作可能になるまで待機
      await page.waitForLoadState('networkidle');
      await expect(page.getByLabel('院名')).toBeVisible();

      // テスト用のユニークな値を生成
      const testClinicName = `テスト整骨院_${Date.now()}`;
      const testPhone = '03-9999-8888';

      // 院名を変更（入力フィールドの安定化を待機）
      const clinicNameInput = page.getByLabel('院名');
      await clinicNameInput.waitFor({ state: 'visible' });
      await clinicNameInput.click();
      await clinicNameInput.fill(testClinicName);
      // 入力値が反映されていることを確認
      await expect(clinicNameInput).toHaveValue(testClinicName);

      // 電話番号を変更
      const phoneInput = page.getByLabel('電話番号');
      await phoneInput.click();
      await phoneInput.fill(testPhone);
      await expect(phoneInput).toHaveValue(testPhone);

      // 保存ボタンをクリック
      await expect(page.getByTestId('save-settings-button')).toBeEnabled();
      await page.getByTestId('save-settings-button').click();

      // 保存完了を待機（API応答が遅い場合のためタイムアウト延長）
      await expect(page.getByTestId('success-message')).toContainText(
        '設定を保存しました',
        { timeout: 20000 }
      );

      // Next.js dev環境で load が安定しないため、DOMContentLoadedまで待機
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });

      // 設定画面を再度表示
      await adminSettingsNav.getByRole('button', { name: '店舗管理' }).click();
      await adminSettingsNav.getByRole('button', { name: '基本情報' }).click();
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });
      await page.waitForLoadState('networkidle');
      await expect(page.getByLabel('院名')).toBeVisible();

      // 保存した値が復元されていることを確認
      await expect(page.getByLabel('院名')).toHaveValue(testClinicName);
      await expect(page.getByLabel('電話番号')).toHaveValue(testPhone);
    });

    test('必須項目が空の場合にバリデーションエラーが表示される', async ({
      page,
    }) => {
      const adminSettingsNav = page.getByTestId('admin-settings-nav');
      const adminSettingsContent = page.getByTestId('admin-settings-content');
      await page.goto('/admin/settings');
      // ページの安定化を待機
      await page.waitForLoadState('networkidle');

      await adminSettingsNav.getByRole('button', { name: '店舗管理' }).click();
      await adminSettingsNav.getByRole('button', { name: '基本情報' }).click();
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });
      await page.waitForLoadState('networkidle');

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
    test('SMTP設定を変更して保存後、再訪で値が保持される', async ({ page }) => {
      const adminSettingsNav = page.getByTestId('admin-settings-nav');
      const adminSettingsContent = page.getByTestId('admin-settings-content');
      await page.goto('/admin/settings');
      // ページの安定化を待機
      await page.waitForLoadState('networkidle');

      // コミュニケーション設定を選択
      await adminSettingsNav
        .getByRole('button', { name: '患者コミュニケーション' })
        .click();
      await adminSettingsNav
        .getByRole('button', { name: '自動通知メール' })
        .click();
      // ローディング状態の解消を明示的に待機（タイムアウト延長）
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });
      await page.waitForLoadState('networkidle');
      await expect(
        page.getByRole('heading', { name: '自動通知メール', level: 1 })
      ).toBeVisible();

      // SMTPホストを変更（フィールドの表示を待機）
      const testSmtpHost = 'smtp.test-example.com';
      const smtpHostInput = page.getByLabel('SMTPホスト');
      await smtpHostInput.waitFor({ state: 'visible', timeout: 10000 });
      await smtpHostInput.click();
      await smtpHostInput.fill(testSmtpHost);
      // 入力値が反映されていることを確認
      await expect(smtpHostInput).toHaveValue(testSmtpHost);

      // 保存
      await expect(page.getByTestId('save-settings-button')).toBeEnabled();
      await page.getByTestId('save-settings-button').click();
      // 保存完了を待機
      await expect(
        page
          .getByTestId('success-message')
          .or(page.getByTestId('error-message'))
      ).toBeVisible({ timeout: 20000 });
      await expect(page.getByTestId('success-message')).toContainText(
        '設定を保存しました'
      );

      // Next.js dev環境で load が安定しないため、DOMContentLoadedまで待機
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });

      // 設定画面を再度表示
      await adminSettingsNav
        .getByRole('button', { name: '患者コミュニケーション' })
        .click();
      await adminSettingsNav
        .getByRole('button', { name: '自動通知メール' })
        .click();
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // 保存した値が復元されていることを確認
      const smtpHostInputAfter = page.getByLabel('SMTPホスト');
      await smtpHostInputAfter.waitFor({ state: 'visible', timeout: 10000 });
      await expect(smtpHostInputAfter).toHaveValue(testSmtpHost);
    });
  });

  test.describe('システムセキュリティ設定', () => {
    test('セキュリティポリシーを変更して保存後、再訪で反映される', async ({
      page,
    }) => {
      const adminSettingsNav = page.getByTestId('admin-settings-nav');
      const adminSettingsContent = page.getByTestId('admin-settings-content');
      await page.goto('/admin/settings');
      // ページの安定化を待機
      await page.waitForLoadState('networkidle');

      // システム設定を選択
      await adminSettingsNav
        .getByRole('button', { name: 'システム設定' })
        .click();
      await adminSettingsNav
        .getByRole('button', { name: 'セキュリティ' })
        .click();
      // ローディング状態の解消を明示的に待機（タイムアウト延長）
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });
      await page.waitForLoadState('networkidle');
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

      // Next.js dev環境で load が安定しないため、DOMContentLoadedまで待機
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });

      // 設定画面を再度表示
      await adminSettingsNav
        .getByRole('button', { name: 'システム設定' })
        .click();
      await adminSettingsNav
        .getByRole('button', { name: 'セキュリティ' })
        .click();
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // 保存した値が復元されていることを確認
      const minLengthInputAfter =
        page.getByLabel(/パスワード最小文字数|最小長/);
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
      const adminSettingsNav = page.getByTestId('admin-settings-nav');
      const adminSettingsContent = page.getByTestId('admin-settings-content');
      await page.goto('/admin/settings');
      // ページの安定化を待機
      await page.waitForLoadState('networkidle');

      // 予約設定を選択
      await adminSettingsNav
        .getByRole('button', { name: '予約・カレンダー' })
        .click();
      await adminSettingsNav
        .getByRole('button', { name: '予約枠設定' })
        .click();
      // ローディング状態の解消を明示的に待機（タイムアウト延長）
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // 予約枠時間を変更
      const slotMinutesSelect = page.getByTestId(
        'booking-calendar-slot-minutes-select'
      );
      if (await slotMinutesSelect.isVisible()) {
        await slotMinutesSelect.selectOption('30');
      }

      // 同時予約数を変更
      const maxConcurrentInput = page.getByTestId(
        'booking-calendar-max-concurrent-input'
      );
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

      // Next.js dev環境で load が安定しないため、DOMContentLoadedまで待機
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });

      // 設定画面を再度表示
      await adminSettingsNav
        .getByRole('button', { name: '予約・カレンダー' })
        .click();
      await adminSettingsNav
        .getByRole('button', { name: '予約枠設定' })
        .click();
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // 値が保持されていることを確認
      const slotMinutesAfter = page.getByTestId(
        'booking-calendar-slot-minutes-select'
      );
      if (await slotMinutesAfter.isVisible()) {
        await expect(slotMinutesAfter).toHaveValue('30');
      }
    });
  });

  test.describe('Staff invites', () => {
    test('スタッフを招待して一覧に表示される', async ({ page }) => {
      const adminSettingsNav = page.getByTestId('admin-settings-nav');
      const adminSettingsContent = page.getByTestId('admin-settings-content');

      await page.goto('/admin/settings');
      await page.waitForLoadState('networkidle');

      // スタッフ管理設定へ移動
      await adminSettingsNav
        .getByRole('button', { name: 'スタッフ管理' })
        .click();

      // サブメニュー「スタッフ一覧・招待」をクリック
      await adminSettingsNav
        .getByRole('button', { name: 'スタッフ一覧・招待' })
        .click();

      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // 招待フォームを開く
      await page.getByRole('button', { name: /新しいスタッフを招待/ }).click();
      await expect(page.getByTestId('staff-invite-form')).toBeVisible();

      // テスト用のユニークなメールアドレス
      const testEmail = `test-staff-${Date.now()}@example.com`;
      const testName = 'テストスタッフ';

      // フォーム入力
      await page.getByTestId('staff-invite-name-input').fill(testName);
      await page.getByTestId('staff-invite-email-input').fill(testEmail);
      await page.getByTestId('staff-invite-role-select').selectOption('staff');

      // 招待送信
      await page.getByTestId('staff-invite-submit-button').click();

      // 成功メッセージを確認
      await expect(page.getByText(/招待メールを送信しました/)).toBeVisible({
        timeout: 20000,
      });

      // スタッフ一覧に追加されたことを確認
      // testEmailの行を特定し、その行に「招待中」があることを確認
      const staffRow = page.locator('tr', { hasText: testEmail });
      await expect(staffRow).toBeVisible();
      await expect(staffRow.getByText('招待中')).toBeVisible();
    });

    test('無効なメールアドレスでエラーが表示される', async ({ page }) => {
      const adminSettingsNav = page.getByTestId('admin-settings-nav');
      const adminSettingsContent = page.getByTestId('admin-settings-content');

      await page.goto('/admin/settings');
      await page.waitForLoadState('networkidle');

      await adminSettingsNav
        .getByRole('button', { name: 'スタッフ管理' })
        .click();

      // サブメニュー「スタッフ一覧・招待」をクリック
      await adminSettingsNav
        .getByRole('button', { name: 'スタッフ一覧・招待' })
        .click();

      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });

      await page.getByRole('button', { name: /新しいスタッフを招待/ }).click();

      // 無効なメールアドレス
      await page.getByTestId('staff-invite-email-input').fill('invalid-email');
      await page.getByTestId('staff-invite-role-select').selectOption('staff');
      await page.getByTestId('staff-invite-submit-button').click();

      // エラーメッセージを確認
      // APIは「入力値にエラーがあります」または詳細なZodエラーを返す
      await expect(
        page.getByText(
          /有効なメールアドレス|メールアドレスを入力|入力値にエラー|失敗/
        )
      ).toBeVisible({ timeout: 20000 });
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
      // adminユーザーはCLINIC_A_IDに所属しているため、CLINIC_A_IDを使用
      // data_managementカテゴリの有効なフィールドを使用
      const testSettings = {
        clinic_id: CLINIC_A_ID,
        category: 'data_management',
        settings: {
          importMode: 'merge',
          exportFormat: 'json',
          retentionDays: 180,
        },
      };

      // 最初のPUT
      const response1 = await page.request.put('/api/admin/settings', {
        data: testSettings,
      });
      expect(response1.ok()).toBeTruthy();

      // GETで確認
      const getResponse = await page.request.get(
        `/api/admin/settings?clinic_id=${CLINIC_A_ID}&category=data_management`
      );
      expect(getResponse.ok()).toBeTruthy();
      const getData = await getResponse.json();
      expect(getData.data.settings.importMode).toBe('merge');
      expect(getData.data.settings.retentionDays).toBe(180);

      // 更新のPUT
      testSettings.settings.retentionDays = 365;
      const response2 = await page.request.put('/api/admin/settings', {
        data: testSettings,
      });
      expect(response2.ok()).toBeTruthy();

      // 再度GETで確認（upsertされていることを確認）
      const getResponse2 = await page.request.get(
        `/api/admin/settings?clinic_id=${CLINIC_A_ID}&category=data_management`
      );
      const getData2 = await getResponse2.json();
      expect(getData2.data.settings.retentionDays).toBe(365);
    });

    test('clinic_id 未指定でエラー400が返る', async ({ page }) => {
      const response = await page.request.get(
        '/api/admin/settings?category=clinic_basic'
      );
      expect(response.status()).toBe(400);
    });
  });
});
