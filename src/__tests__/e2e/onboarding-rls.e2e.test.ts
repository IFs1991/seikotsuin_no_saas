/**
 * オンボーディングテーブルのRLSポリシーテスト
 *
 * TDDサイクル:
 * 1. RED: テーブル作成前にテスト作成（失敗）
 * 2. GREEN: マイグレーション適用後にテスト成功
 * 3. REFACTOR: 必要に応じてポリシー調整
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
  console.log(`[onboarding-rls.e2e.test.ts] ${envValidation.reason}`);
}

describeOrSkip('Onboarding RLS Policies', () => {
  // テスト用データ
  let adminUserId: string | null = null;
  let therapistUserId: string | null = null;
  let testClinicId: string | null = null;

  beforeAll(async () => {
    // adminクライアントでテスト用クリニックを作成
    const adminResult = await createAdminClient();
    if (adminResult) {
      adminUserId = adminResult.userId;

      // テスト用クリニック作成
      const { data: clinic } = await adminResult.client
        .from('clinics')
        .insert({
          name: `Onboarding Test Clinic ${generateTestId()}`,
          is_active: true,
        })
        .select()
        .single();

      testClinicId = clinic?.id ?? null;
    }

    const therapistResult = await createTherapistClient();
    if (therapistResult) {
      therapistUserId = therapistResult.userId;
    }
  });

  afterAll(async () => {
    // クリーンアップ
    if (testClinicId) {
      const adminResult = await createAdminClient();
      if (adminResult) {
        await adminResult.client
          .from('clinics')
          .update({ is_active: false })
          .eq('id', testClinicId);
      }
    }
  });

  describe('onboarding_states テーブル', () => {
    it('ユーザーは自分のオンボーディング状態を作成できる', async () => {
      const adminResult = await createAdminClient();
      if (!adminResult) {
        console.warn('adminユーザーでの認証に失敗');
        return;
      }

      const { data, error } = await adminResult.client
        .from('onboarding_states')
        .insert({
          user_id: adminResult.userId,
          current_step: 'profile',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.user_id).toBe(adminResult.userId);
      expect(data?.current_step).toBe('profile');

      // クリーンアップ
      if (data?.id) {
        await adminResult.client
          .from('onboarding_states')
          .delete()
          .eq('id', data.id);
      }
    });

    it('ユーザーは自分のオンボーディング状態のみ取得できる', async () => {
      const adminResult = await createAdminClient();
      if (!adminResult) {
        console.warn('adminユーザーでの認証に失敗');
        return;
      }

      // 自分のデータを作成
      const { data: inserted } = await adminResult.client
        .from('onboarding_states')
        .insert({
          user_id: adminResult.userId,
          current_step: 'clinic',
        })
        .select()
        .single();

      // 自分のデータを取得
      const { data, error } = await adminResult.client
        .from('onboarding_states')
        .select('*')
        .eq('user_id', adminResult.userId);

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.length).toBeGreaterThan(0);
      expect(data?.every((row) => row.user_id === adminResult.userId)).toBe(true);

      // クリーンアップ
      if (inserted?.id) {
        await adminResult.client
          .from('onboarding_states')
          .delete()
          .eq('id', inserted.id);
      }
    });

    it('他のユーザーのオンボーディング状態は取得できない', async () => {
      const adminResult = await createAdminClient();
      const therapistResult = await createTherapistClient();

      if (!adminResult || !therapistResult) {
        console.warn('テストユーザーでの認証に失敗');
        return;
      }

      // adminがデータを作成
      const { data: inserted } = await adminResult.client
        .from('onboarding_states')
        .insert({
          user_id: adminResult.userId,
          current_step: 'invites',
        })
        .select()
        .single();

      // therapistがadminのデータを取得しようとする
      const { data, error } = await therapistResult.client
        .from('onboarding_states')
        .select('*')
        .eq('user_id', adminResult.userId);

      // RLSにより空の結果が返る（エラーではない）
      expect(error).toBeNull();
      expect(data?.length).toBe(0);

      // クリーンアップ
      if (inserted?.id) {
        await adminResult.client
          .from('onboarding_states')
          .delete()
          .eq('id', inserted.id);
      }
    });

    it('ユーザーは自分のオンボーディング状態を更新できる', async () => {
      const adminResult = await createAdminClient();
      if (!adminResult) {
        console.warn('adminユーザーでの認証に失敗');
        return;
      }

      // データ作成
      const { data: inserted } = await adminResult.client
        .from('onboarding_states')
        .insert({
          user_id: adminResult.userId,
          current_step: 'profile',
        })
        .select()
        .single();

      // 更新
      const { data, error } = await adminResult.client
        .from('onboarding_states')
        .update({ current_step: 'clinic' })
        .eq('id', inserted?.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.current_step).toBe('clinic');

      // クリーンアップ
      if (inserted?.id) {
        await adminResult.client
          .from('onboarding_states')
          .delete()
          .eq('id', inserted.id);
      }
    });
  });

  describe('staff_invites テーブル', () => {
    it('招待者は招待を作成できる', async () => {
      const adminResult = await createAdminClient();
      if (!adminResult || !testClinicId) {
        console.warn('テスト環境の準備に失敗');
        return;
      }

      const testEmail = `invite-test-${generateTestId()}@example.com`;

      const { data, error } = await adminResult.client
        .from('staff_invites')
        .insert({
          clinic_id: testClinicId,
          email: testEmail,
          role: 'staff',
          created_by: adminResult.userId,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.email).toBe(testEmail);
      expect(data?.created_by).toBe(adminResult.userId);

      // クリーンアップ
      if (data?.id) {
        await adminResult.client
          .from('staff_invites')
          .delete()
          .eq('id', data.id);
      }
    });

    it('招待者以外は招待を削除できない', async () => {
      const adminResult = await createAdminClient();
      const therapistResult = await createTherapistClient();

      if (!adminResult || !therapistResult || !testClinicId) {
        console.warn('テスト環境の準備に失敗');
        return;
      }

      const testEmail = `invite-test-${generateTestId()}@example.com`;

      // adminが招待を作成
      const { data: inserted } = await adminResult.client
        .from('staff_invites')
        .insert({
          clinic_id: testClinicId,
          email: testEmail,
          role: 'staff',
          created_by: adminResult.userId,
        })
        .select()
        .single();

      // therapistが削除しようとする
      const { error } = await therapistResult.client
        .from('staff_invites')
        .delete()
        .eq('id', inserted?.id);

      // RLSにより削除が拒否される（またはaffected rows = 0）
      // エラーが返るか、削除されていないことを確認
      const { data: stillExists } = await adminResult.client
        .from('staff_invites')
        .select('*')
        .eq('id', inserted?.id)
        .single();

      expect(stillExists).not.toBeNull();

      // クリーンアップ
      if (inserted?.id) {
        await adminResult.client
          .from('staff_invites')
          .delete()
          .eq('id', inserted.id);
      }
    });

    it('誰でも招待トークンで招待を確認できる', async () => {
      const adminResult = await createAdminClient();
      const therapistResult = await createTherapistClient();

      if (!adminResult || !therapistResult || !testClinicId) {
        console.warn('テスト環境の準備に失敗');
        return;
      }

      const testEmail = `invite-test-${generateTestId()}@example.com`;

      // adminが招待を作成
      const { data: inserted } = await adminResult.client
        .from('staff_invites')
        .insert({
          clinic_id: testClinicId,
          email: testEmail,
          role: 'staff',
          created_by: adminResult.userId,
        })
        .select()
        .single();

      // therapistがトークンで招待を確認
      const { data, error } = await therapistResult.client
        .from('staff_invites')
        .select('id, email, role, clinic_id')
        .eq('token', inserted?.token)
        .single();

      expect(error).toBeNull();
      expect(data?.email).toBe(testEmail);

      // クリーンアップ
      if (inserted?.id) {
        await adminResult.client
          .from('staff_invites')
          .delete()
          .eq('id', inserted.id);
      }
    });
  });
});
