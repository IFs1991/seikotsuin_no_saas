/**
 * E2E-1: admin によるクリニック作成テスト
 *
 * シナリオ:
 * 1. adminユーザーとしてログイン
 * 2. 新規クリニックを作成
 * 3. 作成したクリニックが一覧に反映されることを確認
 * 4. クリニックの更新（編集）ができることを確認
 * 5. クリニックの無効化ができることを確認
 *
 * 参照: tenant_hq_clinic_plan_v1.yml (test_plan.e2e_playwright.E2E-1)
 *
 * @spec docs/stabilization/jest-mock-unification-spec-v0.1.md - Error Class 5
 * 注意: このテストは実際のSupabaseインスタンスに依存します。
 * Jest環境ではデフォルトでスキップされます。
 * 実行するには E2E_RLS_ENABLED=true を設定してください。
 */

import {
  createAdminClient,
  createTherapistClient,
  generateTestId,
  validateTestEnvironment,
} from './helpers/test-auth';

// テスト環境の検証
const envValidation = validateTestEnvironment();

// テストをスキップするかどうか（E2E_RLS_ENABLED=false の場合スキップ）
const describeOrSkip = envValidation.shouldSkip ? describe.skip : describe;

// スキップ理由をログ出力
if (envValidation.shouldSkip && envValidation.reason) {
  console.log(`[admin-tenants.e2e.test.ts] ${envValidation.reason}`);
}

describeOrSkip('E2E-1: admin によるクリニック管理', () => {
  let testClinicId: string | null = null;
  const testClinicName = `E2E Test Clinic ${generateTestId()}`;

  afterAll(async () => {
    // テストで作成したクリニックをクリーンアップ（無効化）
    if (testClinicId) {
      const result = await createAdminClient();
      if (result) {
        await result.client
          .from('clinics')
          .update({ is_active: false })
          .eq('id', testClinicId);
      }
    }
  });

  describe('クリニック作成', () => {
    it('adminユーザーは新規クリニックを作成できる', async () => {
      const result = await createAdminClient();

      if (!result) {
        console.warn('adminユーザーでの認証に失敗 - テストユーザーが設定されていない可能性があります');
        return;
      }

      const { client } = result;

      // クリニック作成
      const { data, error } = await client
        .from('clinics')
        .insert({
          name: testClinicName,
          address: 'E2Eテスト住所',
          phone_number: '03-1234-5678',
          is_active: true,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.name).toBe(testClinicName);
      expect(data?.is_active).toBe(true);

      testClinicId = data?.id ?? null;
    });

    it('作成したクリニックが一覧に反映される', async () => {
      if (!testClinicId) {
        console.warn('前のテストでクリニックが作成されていません');
        return;
      }

      const result = await createAdminClient();
      if (!result) return;

      const { client } = result;

      // クリニック一覧取得
      const { data, error } = await client
        .from('clinics')
        .select('id, name, is_active')
        .eq('id', testClinicId)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.name).toBe(testClinicName);
    });
  });

  describe('クリニック更新', () => {
    it('adminユーザーはクリニックを更新できる', async () => {
      if (!testClinicId) {
        console.warn('クリニックが作成されていません');
        return;
      }

      const result = await createAdminClient();
      if (!result) return;

      const { client } = result;
      const updatedName = `${testClinicName} (Updated)`;

      // クリニック更新
      const { data, error } = await client
        .from('clinics')
        .update({
          name: updatedName,
          address: 'E2Eテスト住所（更新後）',
        })
        .eq('id', testClinicId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.name).toBe(updatedName);
    });
  });

  describe('クリニック無効化', () => {
    it('adminユーザーはクリニックを無効化できる', async () => {
      if (!testClinicId) {
        console.warn('クリニックが作成されていません');
        return;
      }

      const result = await createAdminClient();
      if (!result) return;

      const { client } = result;

      // クリニック無効化
      const { data, error } = await client
        .from('clinics')
        .update({ is_active: false })
        .eq('id', testClinicId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.is_active).toBe(false);
    });

    it('adminユーザーはクリニックを有効化できる', async () => {
      if (!testClinicId) {
        console.warn('クリニックが作成されていません');
        return;
      }

      const result = await createAdminClient();
      if (!result) return;

      const { client } = result;

      // クリニック有効化
      const { data, error } = await client
        .from('clinics')
        .update({ is_active: true })
        .eq('id', testClinicId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.is_active).toBe(true);
    });
  });

  describe('非adminユーザーの制限', () => {
    it('therapistユーザーはクリニックを作成できない', async () => {
      const result = await createTherapistClient();

      if (!result) {
        console.warn('therapistユーザーでの認証に失敗 - テストユーザーが設定されていない可能性があります');
        return;
      }

      const { client } = result;

      // クリニック作成を試みる
      const { data, error } = await client
        .from('clinics')
        .insert({
          name: `Unauthorized Clinic ${generateTestId()}`,
          is_active: true,
        })
        .select()
        .single();

      // RLSにより拒否されることを確認
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('therapistユーザーはクリニックを更新できない', async () => {
      if (!testClinicId) {
        console.warn('クリニックが作成されていません');
        return;
      }

      const result = await createTherapistClient();
      if (!result) return;

      const { client } = result;

      // クリニック更新を試みる
      const { error } = await client
        .from('clinics')
        .update({ name: 'Unauthorized Update' })
        .eq('id', testClinicId);

      // RLSにより拒否されるか、更新が反映されないことを確認
      // Supabaseは更新対象がない場合もエラーを返さないことがあるため、
      // 実際に更新されていないことを確認
      const adminResult = await createAdminClient();
      if (adminResult) {
        const { data } = await adminResult.client
          .from('clinics')
          .select('name')
          .eq('id', testClinicId)
          .single();

        expect(data?.name).not.toBe('Unauthorized Update');
      }
    });
  });
});
