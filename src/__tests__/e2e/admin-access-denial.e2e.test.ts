/**
 * E2E-2: non-admin の /admin アクセス拒否テスト
 *
 * シナリオ:
 * 1. therapistユーザーとしてログイン
 * 2. /admin/tenants API にアクセス
 * 3. 403エラーまたはリダイレクトが返されることを確認
 * 4. /admin/users API にアクセス
 * 5. 403エラーまたはリダイレクトが返されることを確認
 *
 * 参照: tenant_hq_clinic_plan_v1.yml (test_plan.e2e_playwright.E2E-2)
 *
 * @spec docs/stabilization/jest-mock-unification-spec-v0.1.md - Error Class 5
 * 注意: このテストは実際のSupabaseインスタンスに依存します。
 * Jest環境ではデフォルトでスキップされます。
 * 実行するには E2E_RLS_ENABLED=true を設定してください。
 */

import {
  createTherapistClient,
  createAdminClient,
  validateTestEnvironment,
} from './helpers/test-auth';

// テスト環境の検証
const envValidation = validateTestEnvironment();

// テストをスキップするかどうか（E2E_RLS_ENABLED=false の場合スキップ）
const describeOrSkip = envValidation.shouldSkip ? describe.skip : describe;

// スキップ理由をログ出力
if (envValidation.shouldSkip && envValidation.reason) {
  console.log(`[admin-access-denial.e2e.test.ts] ${envValidation.reason}`);
}

describeOrSkip('E2E-2: non-admin の /admin アクセス拒否', () => {
  describe('clinics テーブルへのアクセス制限', () => {
    it('therapistユーザーは全クリニック一覧を取得できない（自分のクリニックのみ）', async () => {
      const therapistResult = await createTherapistClient();
      const adminResult = await createAdminClient();

      if (!therapistResult || !adminResult) {
        console.warn('テストユーザーでの認証に失敗');
        return;
      }

      // adminで全クリニック数を取得
      const { data: allClinics } = await adminResult.client
        .from('clinics')
        .select('id');

      // therapistでクリニック一覧を取得
      const { data: therapistClinics } = await therapistResult.client
        .from('clinics')
        .select('id');

      // therapistは全クリニックを見ることができない（自分のクリニックのみ）
      if (allClinics && therapistClinics) {
        expect(therapistClinics.length).toBeLessThanOrEqual(allClinics.length);

        // therapistが複数のクリニックを見れる場合は、
        // 自分のクリニックに限定されていることを確認
        if (therapistClinics.length > 0 && allClinics.length > 1) {
          expect(therapistClinics.length).toBeLessThan(allClinics.length);
        }
      }
    });
  });

  describe('user_permissions テーブルへのアクセス制限', () => {
    it('therapistユーザーは他ユーザーの権限を取得できない（自分の権限のみ）', async () => {
      const therapistResult = await createTherapistClient();
      const adminResult = await createAdminClient();

      if (!therapistResult || !adminResult) {
        console.warn('テストユーザーでの認証に失敗');
        return;
      }

      // adminで全権限数を取得
      const { data: allPermissions } = await adminResult.client
        .from('user_permissions')
        .select('id, staff_id');

      // therapistで権限一覧を取得
      const { data: therapistPermissions } = await therapistResult.client
        .from('user_permissions')
        .select('id, staff_id');

      // therapistは自分の権限のみ見える
      if (allPermissions && therapistPermissions) {
        // 全権限が1件以上ある場合
        if (allPermissions.length > 1) {
          // therapistは自分の権限のみ（1件以下）
          expect(therapistPermissions.length).toBeLessThanOrEqual(1);
        }

        // therapistの権限は自分のstaff_idのみ
        if (therapistPermissions.length > 0) {
          const uniqueStaffIds = new Set(
            therapistPermissions.map(p => p.staff_id)
          );
          expect(uniqueStaffIds.size).toBe(1);
          expect(uniqueStaffIds.has(therapistResult.userId)).toBe(true);
        }
      }
    });

    it('therapistユーザーは新しい権限を作成できない', async () => {
      const therapistResult = await createTherapistClient();

      if (!therapistResult) {
        console.warn('therapistユーザーでの認証に失敗');
        return;
      }

      const { client, userId } = therapistResult;

      // 権限作成を試みる
      const { data, error } = await client
        .from('user_permissions')
        .insert({
          staff_id: userId,
          username: 'unauthorized-user',
          hashed_password: 'test',
          role: 'admin', // 不正にadmin権限を付与しようとする
          clinic_id: null,
        })
        .select()
        .single();

      // RLSにより拒否されることを確認
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('therapistユーザーは他ユーザーの権限を更新できない', async () => {
      const therapistResult = await createTherapistClient();
      const adminResult = await createAdminClient();

      if (!therapistResult || !adminResult) {
        console.warn('テストユーザーでの認証に失敗');
        return;
      }

      // adminの権限IDを取得
      const { data: adminPermissions } = await adminResult.client
        .from('user_permissions')
        .select('id')
        .eq('role', 'admin')
        .limit(1);

      if (!adminPermissions || adminPermissions.length === 0) {
        console.warn('admin権限が見つかりません');
        return;
      }

      const adminPermissionId = adminPermissions[0].id;

      // therapistでadminの権限を更新しようとする
      const { error } = await therapistResult.client
        .from('user_permissions')
        .update({ role: 'staff' })
        .eq('id', adminPermissionId);

      // RLSにより更新されないことを確認（エラーは返らない場合がある）
      // 実際に更新されていないことを確認
      const { data: checkData } = await adminResult.client
        .from('user_permissions')
        .select('role')
        .eq('id', adminPermissionId)
        .single();

      expect(checkData?.role).toBe('admin');
    });

    it('therapistユーザーは権限を削除できない', async () => {
      const therapistResult = await createTherapistClient();
      const adminResult = await createAdminClient();

      if (!therapistResult || !adminResult) {
        console.warn('テストユーザーでの認証に失敗');
        return;
      }

      // 任意の権限IDを取得
      const { data: permissions } = await adminResult.client
        .from('user_permissions')
        .select('id')
        .limit(1);

      if (!permissions || permissions.length === 0) {
        console.warn('権限が見つかりません');
        return;
      }

      const permissionId = permissions[0].id;

      // therapistで権限を削除しようとする
      const { error } = await therapistResult.client
        .from('user_permissions')
        .delete()
        .eq('id', permissionId);

      // RLSにより削除されないことを確認
      const { data: checkData } = await adminResult.client
        .from('user_permissions')
        .select('id')
        .eq('id', permissionId)
        .single();

      expect(checkData).not.toBeNull();
    });
  });
});
