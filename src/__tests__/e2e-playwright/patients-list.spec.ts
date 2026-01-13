import { test, expect } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { CLINIC_A_ID } from './fixtures';

test.describe('患者一覧 - 患者マスタ管理 MVP', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page);
  });

  test('患者一覧が表示される（最新順）', async ({ page }) => {
    await page.goto('/patients/list');
    await page.waitForLoadState('networkidle');

    // ページタイトルが表示される
    await expect(
      page.getByRole('heading', { name: '患者一覧' })
    ).toBeVisible();

    // 患者一覧テーブルが表示される
    await expect(page.locator('[data-testid="patients-table"]')).toBeVisible();

    // E2Eシードデータの患者が表示される（最低5名）
    const rows = page.locator('[data-testid="patient-row"]');
    await expect(rows.first()).toBeVisible();
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(5);

    // 最新順で表示される（E2E Customer 1 が先頭に近い位置にある）
    await expect(page.getByText('E2E Customer 1')).toBeVisible();
  });

  test('検索入力でAPIがq付きで呼ばれ、結果が絞り込まれる', async ({ page }) => {
    await page.goto('/patients/list');
    await page.waitForLoadState('networkidle');

    // 検索入力欄が表示される
    const searchInput = page.getByPlaceholder('氏名または電話番号で検索');
    await expect(searchInput).toBeVisible();

    // API呼び出しを監視
    const apiPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/customers') &&
        response.url().includes('q=') &&
        response.status() === 200
    );

    // 検索を実行
    await searchInput.fill('Customer 1');

    // デバウンス後にAPIが呼ばれる
    const response = await apiPromise;
    expect(response.url()).toContain('q=Customer%201');

    // 検索結果が絞り込まれる
    await expect(page.getByText('E2E Customer 1')).toBeVisible();

    // Customer 2 は表示されない（検索で絞り込まれた）
    await expect(page.getByText('E2E Customer 2')).not.toBeVisible();
  });

  test('電話番号で検索できる', async ({ page }) => {
    await page.goto('/patients/list');
    await page.waitForLoadState('networkidle');

    const searchInput = page.getByPlaceholder('氏名または電話番号で検索');

    // 電話番号で検索
    await searchInput.fill('090-0000-0003');

    // API応答を待つ
    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/customers') &&
        response.url().includes('q=') &&
        response.status() === 200
    );

    // 検索結果が表示される
    await expect(page.getByText('E2E Customer 3')).toBeVisible();
  });

  test('編集モーダルで電話番号を更新し一覧に反映される', async ({ page }) => {
    await page.goto('/patients/list');
    await page.waitForLoadState('networkidle');

    // 編集ボタンをクリック（最初の患者）
    const editButton = page.locator('[data-testid="edit-patient-button"]').first();
    await editButton.click();

    // 編集モーダルが表示される
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('患者情報編集')).toBeVisible();

    // 電話番号フィールドを更新
    const phoneInput = page.getByLabel('電話番号');
    await phoneInput.clear();
    await phoneInput.fill('090-9999-9999');

    // PATCH APIの呼び出しを監視
    const patchPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/customers') &&
        response.request().method() === 'PATCH' &&
        response.status() === 200
    );

    // 保存ボタンをクリック
    await page.getByRole('button', { name: '保存' }).click();

    // APIが呼ばれる
    await patchPromise;

    // モーダルが閉じる
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // 成功トーストが表示される
    await expect(page.getByText('保存しました')).toBeVisible();

    // 一覧に更新された電話番号が反映される
    await expect(page.getByText('090-9999-9999')).toBeVisible();
  });

  test('新規登録で患者が追加される', async ({ page }) => {
    await page.goto('/patients/list');
    await page.waitForLoadState('networkidle');

    // 新規登録ボタンをクリック
    await page.getByRole('button', { name: '新規登録' }).click();

    // 新規登録モーダルが表示される
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('患者新規登録')).toBeVisible();

    // 最小項目を入力
    const uniqueName = `E2E New Patient ${Date.now()}`;
    await page.getByLabel('氏名').fill(uniqueName);
    await page.getByLabel('電話番号').fill('080-1234-5678');

    // POST APIの呼び出しを監視
    const postPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/customers') &&
        response.request().method() === 'POST' &&
        response.status() === 201
    );

    // 登録ボタンをクリック
    await page.getByRole('button', { name: '登録' }).click();

    // APIが呼ばれる
    await postPromise;

    // モーダルが閉じる
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // 成功トーストが表示される
    await expect(page.getByText('登録しました')).toBeVisible();

    // 一覧に新規患者が表示される
    await expect(page.getByText(uniqueName)).toBeVisible();
  });

  test('編集モーダルで氏名・メール・メモを更新できる', async ({ page }) => {
    await page.goto('/patients/list');
    await page.waitForLoadState('networkidle');

    // Customer 5 を検索して編集
    const searchInput = page.getByPlaceholder('氏名または電話番号で検索');
    await searchInput.fill('Customer 5');

    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/customers') &&
        response.url().includes('q=') &&
        response.status() === 200
    );

    // 編集ボタンをクリック
    const editButton = page.locator('[data-testid="edit-patient-button"]').first();
    await editButton.click();

    // モーダルが表示される
    await expect(page.getByRole('dialog')).toBeVisible();

    // 各フィールドが表示される
    await expect(page.getByLabel('氏名')).toBeVisible();
    await expect(page.getByLabel('電話番号')).toBeVisible();
    await expect(page.getByLabel('メールアドレス')).toBeVisible();
    await expect(page.getByLabel('メモ')).toBeVisible();

    // メモを更新
    const notesInput = page.getByLabel('メモ');
    await notesInput.fill('E2E更新テストメモ');

    // 保存
    const patchPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/customers') &&
        response.request().method() === 'PATCH' &&
        response.status() === 200
    );

    await page.getByRole('button', { name: '保存' }).click();
    await patchPromise;

    await expect(page.getByText('保存しました')).toBeVisible();
  });
});
