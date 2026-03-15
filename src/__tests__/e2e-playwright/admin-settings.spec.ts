import { test, expect, Page } from '@playwright/test';
import path from 'node:path';
import { CLINIC_A_ID } from './fixtures';

const adminStorageStatePath = path.resolve(
  process.cwd(),
  'src/__tests__/e2e-playwright/storage/admin.json'
);

test.use({ storageState: adminStorageStatePath });
test.describe.configure({ mode: 'serial' });

/**
 * React ハイドレーション完了 + デフォルトコンポーネント初期化を待機する。
 *
 * page.goto('...', { waitUntil: 'domcontentloaded' }) はSSR HTMLの受信のみを保証し、
 * Reactのハイドレーションやdynamic importの完了を保証しない。
 * ハイドレーション前のクリックはイベントハンドラが未アタッチで無視される。
 *
 * デフォルト表示の ClinicBasicSettings が描画する「院名」入力が可視になれば、
 * React hydration + dynamic import + useUserProfile + useAdminSettings が全て完了している。
 */
async function waitForPageReady(page: Page) {
  await expect(page.getByLabel('院名')).toBeVisible({ timeout: 30000 });
}

/**
 * 管理設定永続化 E2Eテスト
 * 仕様書: docs/管理設定永続化_MVP仕様書.md
 *
 * テストシナリオ:
 * 1. クリニック基本情報の保存・復元
 * 2. コミュニケーション設定のSMTP公開設定保存
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
      await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      // 「基本情報」を選択（デフォルト表示だが明示的にクリック）
      await adminSettingsNav.getByRole('button', { name: '店舗管理' }).click();
      await adminSettingsNav.getByRole('button', { name: '基本情報' }).click();
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });
      await expect(page.getByLabel('院名')).toBeVisible();

      // テスト用のユニークな値を生成
      const testClinicName = `テスト整骨院_${Date.now()}`;
      const testPhone = '03-9999-8888';

      // 院名を変更
      const clinicNameInput = page.getByLabel('院名');
      await clinicNameInput.click();
      await clinicNameInput.fill(testClinicName);
      await expect(clinicNameInput).toHaveValue(testClinicName);

      // 電話番号を変更
      const phoneInput = page.getByLabel('電話番号');
      await phoneInput.click();
      await phoneInput.fill(testPhone);
      await expect(phoneInput).toHaveValue(testPhone);

      // 保存ボタンをクリック
      await expect(page.getByTestId('save-settings-button')).toBeEnabled();
      await page.getByTestId('save-settings-button').click();

      // 保存完了を待機
      await expect(page.getByTestId('success-message')).toContainText(
        '設定を保存しました',
        { timeout: 20000 }
      );

      // リロード後に値が保持されることを確認
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      await adminSettingsNav.getByRole('button', { name: '店舗管理' }).click();
      await adminSettingsNav.getByRole('button', { name: '基本情報' }).click();
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });
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
      await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      await adminSettingsNav.getByRole('button', { name: '店舗管理' }).click();
      await adminSettingsNav.getByRole('button', { name: '基本情報' }).click();
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });

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
    test('SMTP公開設定を username + secure 契約で保存し、平文パスワード入力なしで再訪後も保持される', async ({
      page,
    }) => {
      const adminSettingsNav = page.getByTestId('admin-settings-nav');
      const adminSettingsContent = page.getByTestId('admin-settings-content');
      let lastSavePayload: Record<string, unknown> | null = null;

      await page.route('**/api/admin/settings', async route => {
        const request = route.request();
        if (request.method() === 'PUT') {
          lastSavePayload = request.postDataJSON() as Record<string, unknown>;
        }
        await route.continue();
      });

      await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      // コミュニケーション設定を選択
      await adminSettingsNav
        .getByRole('button', { name: '患者コミュニケーション' })
        .click();
      await adminSettingsNav
        .getByRole('button', { name: '自動通知メール' })
        .click();
      // ローディング状態の解消を待機
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });
      await expect(
        page.getByRole('heading', { name: '自動通知メール', level: 1 })
      ).toBeVisible();
      await expect(page.getByLabel('パスワード')).toHaveCount(0);
      await expect(
        page.locator('input[type="password"], textarea[type="password"]')
      ).toHaveCount(0);

      // SMTP設定セクションは emailEnabled=true のときだけ表示される
      // デフォルトは false なので、先にメールチャンネルを有効化する
      const emailCheckbox = page.getByLabel('メール');
      if (!(await emailCheckbox.isChecked())) {
        await emailCheckbox.check();
      }

      // SMTPホストを変更
      const testSmtpHost = 'smtp.test-example.com';
      const testSmtpUsername = `mailer-${Date.now()}@example.com`;
      const smtpHostInput = page.getByLabel('SMTPホスト');
      await smtpHostInput.waitFor({ state: 'visible', timeout: 10000 });
      await smtpHostInput.click();
      await smtpHostInput.fill(testSmtpHost);
      await expect(smtpHostInput).toHaveValue(testSmtpHost);

      const smtpUsernameInput = page.getByLabel('ユーザー名');
      await smtpUsernameInput.fill(testSmtpUsername);
      await expect(smtpUsernameInput).toHaveValue(testSmtpUsername);

      const secureCheckbox = page.getByLabel('SSL/TLS暗号化を使用');
      await expect(secureCheckbox).toBeChecked();
      await secureCheckbox.uncheck();
      await expect(secureCheckbox).not.toBeChecked();

      // 保存
      await expect(page.getByTestId('save-settings-button')).toBeEnabled();
      await page.getByTestId('save-settings-button').click();
      await expect(
        page
          .getByTestId('success-message')
          .or(page.getByTestId('error-message'))
      ).toBeVisible({ timeout: 20000 });
      await expect(page.getByTestId('success-message')).toContainText(
        '設定を保存しました'
      );
      expect(lastSavePayload).toMatchObject({
        category: 'communication',
        settings: {
          channels: expect.any(Object),
          smtpSettings: {
            host: testSmtpHost,
            username: testSmtpUsername,
            secure: false,
          },
        },
      });
      expect(lastSavePayload).not.toBeNull();
      expect(JSON.stringify(lastSavePayload)).not.toContain('"password"');
      expect(JSON.stringify(lastSavePayload)).not.toContain('"user"');

      // リロード後に値が保持されることを確認
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      await adminSettingsNav
        .getByRole('button', { name: '患者コミュニケーション' })
        .click();
      await adminSettingsNav
        .getByRole('button', { name: '自動通知メール' })
        .click();
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });

      // 保存した値が復元されていることを確認
      // emailEnabled=true で保存したので SMTP セクションが表示されるはず
      await expect(page.getByLabel('メール')).toBeChecked();
      const smtpHostInputAfter = page.getByLabel('SMTPホスト');
      await smtpHostInputAfter.waitFor({ state: 'visible', timeout: 10000 });
      await expect(smtpHostInputAfter).toHaveValue(testSmtpHost);
      await expect(page.getByLabel('ユーザー名')).toHaveValue(testSmtpUsername);
      await expect(page.getByLabel('SSL/TLS暗号化を使用')).not.toBeChecked();
      await expect(
        page.locator('input[type="password"], textarea[type="password"]')
      ).toHaveCount(0);
    });
  });

  test.describe('システムセキュリティ設定', () => {
    test('セキュリティポリシーを変更して保存後、再訪で反映される', async ({
      page,
    }) => {
      const adminSettingsNav = page.getByTestId('admin-settings-nav');
      const adminSettingsContent = page.getByTestId('admin-settings-content');
      await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      // システム設定を選択
      await adminSettingsNav
        .getByRole('button', { name: 'システム設定' })
        .click();
      await adminSettingsNav
        .getByRole('button', { name: 'セキュリティ' })
        .click();
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });
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

      // リロード後に値が保持されることを確認
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      await adminSettingsNav
        .getByRole('button', { name: 'システム設定' })
        .click();
      await adminSettingsNav
        .getByRole('button', { name: 'セキュリティ' })
        .click();
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });

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
      await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      // 予約設定を選択
      await adminSettingsNav
        .getByRole('button', { name: '予約・カレンダー' })
        .click();
      await adminSettingsNav
        .getByRole('button', { name: '予約枠設定' })
        .click();
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });

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

      // リロード後に値が保持されることを確認
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      await adminSettingsNav
        .getByRole('button', { name: '予約・カレンダー' })
        .click();
      await adminSettingsNav
        .getByRole('button', { name: '予約枠設定' })
        .click();
      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });

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

      await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      // スタッフ管理設定へ移動
      await adminSettingsNav
        .getByRole('button', { name: 'スタッフ管理' })
        .click();
      await adminSettingsNav
        .getByRole('button', { name: 'スタッフ一覧・招待' })
        .click();

      await expect(
        adminSettingsContent.getByText('設定を読み込み中...')
      ).toBeHidden({ timeout: 15000 });

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
      const staffRow = page.locator('tr', { hasText: testEmail });
      await expect(staffRow).toBeVisible();
      await expect(staffRow.getByText('招待中')).toBeVisible();
    });

    test('無効なメールアドレスでエラーが表示される', async ({ page }) => {
      const adminSettingsNav = page.getByTestId('admin-settings-nav');
      const adminSettingsContent = page.getByTestId('admin-settings-content');

      await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' });
      await waitForPageReady(page);

      await adminSettingsNav
        .getByRole('button', { name: 'スタッフ管理' })
        .click();
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
      const response = await page.request.get(
        `/api/admin/settings?clinic_id=${CLINIC_A_ID}&category=data_management`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.data?.settings).toBeDefined();
    });

    test('PUT /api/admin/settings でupsertされる', async ({ page }) => {
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
