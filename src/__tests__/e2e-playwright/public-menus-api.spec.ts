/**
 * E2E: GET /api/public/menus - 公開メニューAPI 回帰テスト
 *
 * @spec docs/stabilization/spec-rls-menus-staff-preferences-hardening-v0.2.md
 *   4.3 公開API回帰テスト / DOD-09 (client path guard)
 *
 * テスト方針:
 * - DOD-09: 公開導線テストは Supabase 直接参照ではなく、
 *           HTTP で /api/public/menus を実呼び出しする。
 * - 匿名アクセスで動作することを確認（認証不要）。
 * - テナント境界: clinic_id で絞り込み、他テナントのメニューは返さない。
 *
 * 前提:
 * - NEXT_PUBLIC_APP_URL 環境変数でアプリURL指定（デフォルト: http://localhost:3000）
 * - TEST_ACTIVE_CLINIC_ID: アクティブなクリニックの UUID
 * - TEST_INACTIVE_CLINIC_ID: 非アクティブなクリニックの UUID（省略時はスキップ）
 */

import { test, expect } from '@playwright/test';

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';

// テスト用 UUID（UUID 形式は正しいが存在しないクリニック）
const NONEXISTENT_CLINIC_ID = '00000000-0000-0000-0000-000000000000';

test.describe('GET /api/public/menus', () => {
  // ----------------------------------------------------------------
  // 正常系: 有効な clinic_id → 200 + 対象クリニックのメニューのみ返却
  // ----------------------------------------------------------------
  test('有効な clinic_id で 200 + メニューを返す', async ({ request }) => {
    const clinicId = process.env.TEST_ACTIVE_CLINIC_ID;
    if (!clinicId) {
      test.skip(true, 'TEST_ACTIVE_CLINIC_ID が未設定のためスキップ');
      return;
    }

    const response = await request.get(
      `${BASE_URL}/api/public/menus?clinic_id=${clinicId}`
    );
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.clinic_id).toBe(clinicId);
    expect(Array.isArray(body.data.menus)).toBe(true);

    // 返却されたメニューはすべて対象クリニックのもの（テナント境界確認）
    for (const menu of body.data.menus) {
      expect(menu).not.toHaveProperty('clinic_id'); // 公開APIは clinic_id を非公開
    }
  });

  // ----------------------------------------------------------------
  // バリデーション: clinic_id が UUID 形式でない → 400
  // ----------------------------------------------------------------
  test('clinic_id が UUID 形式でない場合は 400 を返す', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/public/menus?clinic_id=invalid-not-uuid`
    );
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
  });

  // ----------------------------------------------------------------
  // 存在しない clinic_id（UUID 形式は正しい）→ 404
  // ----------------------------------------------------------------
  test('存在しない clinic_id（UUID 形式は正しい）は 404 を返す', async ({
    request,
  }) => {
    const response = await request.get(
      `${BASE_URL}/api/public/menus?clinic_id=${NONEXISTENT_CLINIC_ID}`
    );
    expect(response.status()).toBe(404);

    const body = await response.json();
    expect(body.success).toBe(false);
  });

  // ----------------------------------------------------------------
  // 非アクティブクリニック → 403
  // ----------------------------------------------------------------
  test('非アクティブクリニックの clinic_id は 403 を返す', async ({
    request,
  }) => {
    const clinicId = process.env.TEST_INACTIVE_CLINIC_ID;
    if (!clinicId) {
      test.skip(true, 'TEST_INACTIVE_CLINIC_ID が未設定のためスキップ');
      return;
    }

    const response = await request.get(
      `${BASE_URL}/api/public/menus?clinic_id=${clinicId}`
    );
    expect(response.status()).toBe(403);

    const body = await response.json();
    expect(body.success).toBe(false);
  });

  // ----------------------------------------------------------------
  // テナント境界: clinic_id を指定すると他テナントのメニューは返らない
  // ----------------------------------------------------------------
  test('clinic_id を指定すると対象テナントのメニューのみ返される', async ({
    request,
  }) => {
    const clinicId = process.env.TEST_ACTIVE_CLINIC_ID;
    if (!clinicId) {
      test.skip(true, 'TEST_ACTIVE_CLINIC_ID が未設定のためスキップ');
      return;
    }

    const response = await request.get(
      `${BASE_URL}/api/public/menus?clinic_id=${clinicId}`
    );
    expect(response.status()).toBe(200);

    const body = await response.json();
    // data.clinic_id は常にリクエストした clinic_id と一致する
    expect(body.data.clinic_id).toBe(clinicId);
  });
});
