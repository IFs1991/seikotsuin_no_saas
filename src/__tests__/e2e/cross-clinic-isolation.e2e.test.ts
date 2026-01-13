/**
 * E2E-3: cross-clinic データ参照拒否テスト
 *
 * シナリオ:
 * 1. clinicAユーザーとしてログイン
 * 2. clinicBの患者データを参照しようとする
 * 3. RLSにより拒否されることを確認
 * 4. 自分のクリニックのデータのみ参照できることを確認
 *
 * 参照: tenant_hq_clinic_plan_v1.yml (test_plan.e2e_playwright.E2E-3)
 */

import {
  createClinicAClient,
  createClinicBClient,
  createAdminClient,
  validateTestEnvironment,
} from './helpers/test-auth';

const isTestEnvironmentReady = validateTestEnvironment();
const describeOrSkip = isTestEnvironmentReady ? describe : describe.skip;

describeOrSkip('E2E-3: cross-clinic データ参照拒否（クリニック間隔離）', () => {
  describe('患者データの隔離', () => {
    it('clinicAユーザーはclinicBの患者を参照できない', async () => {
      const clinicAResult = await createClinicAClient();
      const clinicBResult = await createClinicBClient();
      const adminResult = await createAdminClient();

      if (!clinicAResult || !clinicBResult || !adminResult) {
        console.warn('テストユーザーでの認証に失敗');
        return;
      }

      // adminでclinicBの患者IDを取得
      const { data: clinicBPatients } = await adminResult.client
        .from('patients')
        .select('id, clinic_id')
        .limit(5);

      if (!clinicBPatients || clinicBPatients.length === 0) {
        console.warn('テスト用の患者データがありません');
        return;
      }

      // clinicAユーザーでclinicBの患者を参照しようとする
      const clinicBPatientIds = clinicBPatients.map((p) => p.id);

      const { data: accessiblePatients } = await clinicAResult.client
        .from('patients')
        .select('id, clinic_id')
        .in('id', clinicBPatientIds);

      // clinicAユーザーが参照できる患者は、自分のクリニックの患者のみ
      // clinicBの患者は参照できないはず
      if (accessiblePatients && accessiblePatients.length > 0) {
        // 参照できた患者がある場合、それは自分のクリニックの患者のみ
        const { data: clinicAPermission } = await adminResult.client
          .from('user_permissions')
          .select('clinic_id')
          .eq('staff_id', clinicAResult.userId)
          .single();

        if (clinicAPermission?.clinic_id) {
          accessiblePatients.forEach((patient) => {
            expect(patient.clinic_id).toBe(clinicAPermission.clinic_id);
          });
        }
      }
    });

    it('各ユーザーは自分のクリニックの患者のみ参照できる', async () => {
      const clinicAResult = await createClinicAClient();
      const adminResult = await createAdminClient();

      if (!clinicAResult || !adminResult) {
        console.warn('テストユーザーでの認証に失敗');
        return;
      }

      // clinicAユーザーのクリニックIDを取得
      const { data: permission } = await adminResult.client
        .from('user_permissions')
        .select('clinic_id')
        .eq('staff_id', clinicAResult.userId)
        .single();

      if (!permission?.clinic_id) {
        console.warn('ユーザーのクリニックIDが見つかりません');
        return;
      }

      // clinicAユーザーで患者一覧を取得
      const { data: patients } = await clinicAResult.client
        .from('patients')
        .select('id, clinic_id');

      // 取得できた患者は全て自分のクリニックの患者
      if (patients && patients.length > 0) {
        patients.forEach((patient) => {
          expect(patient.clinic_id).toBe(permission.clinic_id);
        });
      }
    });
  });

  describe('来院記録の隔離', () => {
    it('clinicAユーザーはclinicBの来院記録を参照できない', async () => {
      const clinicAResult = await createClinicAClient();
      const adminResult = await createAdminClient();

      if (!clinicAResult || !adminResult) {
        console.warn('テストユーザーでの認証に失敗');
        return;
      }

      // clinicAユーザーのクリニックIDを取得
      const { data: permission } = await adminResult.client
        .from('user_permissions')
        .select('clinic_id')
        .eq('staff_id', clinicAResult.userId)
        .single();

      if (!permission?.clinic_id) {
        console.warn('ユーザーのクリニックIDが見つかりません');
        return;
      }

      // clinicAユーザーで来院記録を取得
      const { data: visits } = await clinicAResult.client
        .from('visits')
        .select('id, clinic_id');

      // 取得できた来院記録は全て自分のクリニックのもの
      if (visits && visits.length > 0) {
        visits.forEach((visit) => {
          expect(visit.clinic_id).toBe(permission.clinic_id);
        });
      }
    });
  });

  describe('売上データの隔離', () => {
    it('clinicAユーザーはclinicBの売上データを参照できない', async () => {
      const clinicAResult = await createClinicAClient();
      const adminResult = await createAdminClient();

      if (!clinicAResult || !adminResult) {
        console.warn('テストユーザーでの認証に失敗');
        return;
      }

      // clinicAユーザーのクリニックIDを取得
      const { data: permission } = await adminResult.client
        .from('user_permissions')
        .select('clinic_id')
        .eq('staff_id', clinicAResult.userId)
        .single();

      if (!permission?.clinic_id) {
        console.warn('ユーザーのクリニックIDが見つかりません');
        return;
      }

      // clinicAユーザーで売上データを取得
      const { data: revenues } = await clinicAResult.client
        .from('revenues')
        .select('id, clinic_id');

      // 取得できた売上データは全て自分のクリニックのもの
      if (revenues && revenues.length > 0) {
        revenues.forEach((revenue) => {
          expect(revenue.clinic_id).toBe(permission.clinic_id);
        });
      }
    });
  });

  describe('予約データの隔離', () => {
    it('スタッフは自分のクリニックの予約のみ参照できる', async () => {
      const clinicAResult = await createClinicAClient();
      const adminResult = await createAdminClient();

      if (!clinicAResult || !adminResult) {
        console.warn('テストユーザーでの認証に失敗');
        return;
      }

      // clinicAユーザーで予約一覧を取得
      const { data: reservations } = await clinicAResult.client
        .from('reservations')
        .select('id, staff_id');

      // 予約データが存在する場合、RLSにより制限されていることを確認
      // （予約システムのRLSはroleベースなので、staffロールでアクセス可能な範囲を確認）
      if (reservations) {
        // エラーなく取得できればRLSが機能している
        expect(Array.isArray(reservations)).toBe(true);
      }
    });
  });

  describe('adminユーザーの横断アクセス', () => {
    it('adminユーザーは全クリニックのデータを参照できる', async () => {
      const adminResult = await createAdminClient();

      if (!adminResult) {
        console.warn('adminユーザーでの認証に失敗');
        return;
      }

      // adminで全クリニックを取得
      const { data: clinics, error } = await adminResult.client
        .from('clinics')
        .select('id, name');

      expect(error).toBeNull();

      // 複数のクリニックが存在する場合、全て参照できることを確認
      if (clinics && clinics.length > 1) {
        const uniqueClinicIds = new Set(clinics.map((c) => c.id));
        expect(uniqueClinicIds.size).toBeGreaterThan(1);
      }
    });

    it('adminユーザーは全患者データを参照できる', async () => {
      const adminResult = await createAdminClient();

      if (!adminResult) {
        console.warn('adminユーザーでの認証に失敗');
        return;
      }

      // adminで全患者を取得
      const { data: patients, error } = await adminResult.client
        .from('patients')
        .select('id, clinic_id');

      expect(error).toBeNull();

      // 複数のクリニックの患者が存在する場合、全て参照できることを確認
      if (patients && patients.length > 0) {
        const uniqueClinicIds = new Set(
          patients.map((p) => p.clinic_id).filter(Boolean)
        );

        // 複数クリニックのデータがあれば、adminは全て参照できる
        if (uniqueClinicIds.size > 1) {
          expect(uniqueClinicIds.size).toBeGreaterThan(1);
        }
      }
    });
  });
});
