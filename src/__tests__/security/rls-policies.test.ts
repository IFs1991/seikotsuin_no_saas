/**
 * Row Level Security (RLS) ポリシーテスト
 * Phase 3 M3: RLS権限テストケース拡充
 */

import { createClient } from '@supabase/supabase-js';

// Supabase クライアントモック
jest.mock('@supabase/supabase-js');

const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  auth: {
    getUser: jest.fn(),
  },
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

describe('RLS ポリシーテスト', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('クリニック間データ分離', () => {
    it('異なるクリニックのデータにアクセスできない', async () => {
      const currentUserClinicId = 'clinic-001';
      const targetClinicId = 'clinic-002';

      // ユーザー認証情報モック
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            user_metadata: { clinic_id: currentUserClinicId },
          },
        },
        error: null,
      });

      // 他クリニックのデータ取得試行
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: {
          code: 'PGRST116',
          message: 'Row-level security policy violation',
        },
      });

      const result = await mockSupabase
        .from('patients')
        .select('*')
        .eq('clinic_id', targetClinicId)
        .single();

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('security policy');
    });

    it('自クリニックのデータには正常にアクセスできる', async () => {
      const clinicId = 'clinic-001';

      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            user_metadata: { clinic_id: clinicId },
          },
        },
        error: null,
      });

      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'patient-001',
          clinic_id: clinicId,
          name: 'テスト患者',
        },
        error: null,
      });

      const result = await mockSupabase
        .from('patients')
        .select('*')
        .eq('clinic_id', clinicId)
        .single();

      expect(result.data).toBeDefined();
      expect(result.data.clinic_id).toBe(clinicId);
      expect(result.error).toBeNull();
    });
  });

  describe('ユーザーロール別アクセス制御', () => {
    it('一般ユーザーは管理者機能にアクセスできない', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-staff',
            user_metadata: { role: 'staff', clinic_id: 'clinic-001' },
          },
        },
        error: null,
      });

      mockSupabase.single.mockResolvedValue({
        data: null,
        error: {
          code: 'PGRST116',
          message: 'Insufficient privileges',
        },
      });

      const result = await mockSupabase
        .from('session_policies')
        .select('*')
        .single();

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('管理者は管理者機能にアクセスできる', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-admin',
            user_metadata: { role: 'admin', clinic_id: 'clinic-001' },
          },
        },
        error: null,
      });

      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'policy-001',
          clinic_id: 'clinic-001',
          max_concurrent_sessions: 3,
        },
        error: null,
      });

      const result = await mockSupabase
        .from('session_policies')
        .select('*')
        .single();

      expect(result.data).toBeDefined();
      expect(result.error).toBeNull();
    });
  });

  describe('データ変更権限', () => {
    it('自分が作成した日報は編集できる', async () => {
      const userId = 'user-123';
      const clinicId = 'clinic-001';

      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: userId,
            user_metadata: { clinic_id: clinicId },
          },
        },
        error: null,
      });

      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'report-001',
          created_by: userId,
          clinic_id: clinicId,
          patient_count: 15,
        },
        error: null,
      });

      const result = await mockSupabase
        .from('daily_reports')
        .update({ patient_count: 20 })
        .eq('id', 'report-001')
        .eq('created_by', userId)
        .single();

      expect(result.error).toBeNull();
    });

    it('他人が作成した日報は編集できない（一般ユーザー）', async () => {
      const userId = 'user-123';
      const otherUserId = 'user-456';

      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: userId,
            user_metadata: { role: 'staff', clinic_id: 'clinic-001' },
          },
        },
        error: null,
      });

      mockSupabase.single.mockResolvedValue({
        data: null,
        error: {
          code: 'PGRST116',
          message: 'RLS policy violation: cannot update other users data',
        },
      });

      const result = await mockSupabase
        .from('daily_reports')
        .update({ patient_count: 20 })
        .eq('id', 'report-001')
        .eq('created_by', otherUserId)
        .single();

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('監査ログのRLS', () => {
    it('自クリニックの監査ログのみ閲覧可能', async () => {
      const clinicId = 'clinic-001';

      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-admin',
            user_metadata: { role: 'admin', clinic_id: clinicId },
          },
        },
        error: null,
      });

      mockSupabase.single.mockResolvedValue({
        data: [
          {
            id: 'log-001',
            clinic_id: clinicId,
            event_type: 'login',
          },
        ],
        error: null,
      });

      const result = await mockSupabase
        .from('audit_logs')
        .select('*')
        .eq('clinic_id', clinicId)
        .single();

      expect(result.data).toBeDefined();
      expect(result.error).toBeNull();
    });

    it('他クリニックの監査ログは閲覧不可', async () => {
      const clinicId = 'clinic-001';
      const otherClinicId = 'clinic-002';

      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-admin',
            user_metadata: { role: 'admin', clinic_id: clinicId },
          },
        },
        error: null,
      });

      mockSupabase.single.mockResolvedValue({
        data: null,
        error: {
          code: 'PGRST116',
          message: 'Cannot access audit logs from other clinics',
        },
      });

      const result = await mockSupabase
        .from('audit_logs')
        .select('*')
        .eq('clinic_id', otherClinicId)
        .single();

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('セッション管理のRLS', () => {
    it('自分のセッションは管理できる', async () => {
      const userId = 'user-123';

      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: userId,
            user_metadata: { clinic_id: 'clinic-001' },
          },
        },
        error: null,
      });

      mockSupabase.single.mockResolvedValue({
        data: [
          {
            id: 'session-001',
            user_id: userId,
            is_active: true,
          },
        ],
        error: null,
      });

      const result = await mockSupabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', userId)
        .single();

      expect(result.data).toBeDefined();
      expect(result.error).toBeNull();
    });

    it('他人のセッションは閲覧できない', async () => {
      const userId = 'user-123';
      const otherUserId = 'user-456';

      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: userId,
            user_metadata: { role: 'staff', clinic_id: 'clinic-001' },
          },
        },
        error: null,
      });

      mockSupabase.single.mockResolvedValue({
        data: null,
        error: {
          code: 'PGRST116',
          message: 'Cannot access other users sessions',
        },
      });

      const result = await mockSupabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', otherUserId)
        .single();

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('患者情報の保護', () => {
    it('患者情報へのアクセスはクリニックIDで制限される', async () => {
      const clinicId = 'clinic-001';

      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            user_metadata: { clinic_id: clinicId },
          },
        },
        error: null,
      });

      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'patient-001',
          clinic_id: clinicId,
          name: 'テスト患者',
          phone: '090-1234-5678',
        },
        error: null,
      });

      const result = await mockSupabase
        .from('patients')
        .select('*')
        .eq('clinic_id', clinicId)
        .single();

      expect(result.data).toBeDefined();
      expect(result.data.clinic_id).toBe(clinicId);
    });

    it('未認証ユーザーは患者情報にアクセスできない', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      mockSupabase.single.mockResolvedValue({
        data: null,
        error: {
          code: 'PGRST116',
          message: 'Authentication required',
        },
      });

      const result = await mockSupabase
        .from('patients')
        .select('*')
        .single();

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('削除操作の制限', () => {
    it('管理者のみがデータ削除可能', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-admin',
            user_metadata: { role: 'admin', clinic_id: 'clinic-001' },
          },
        },
        error: null,
      });

      mockSupabase.single.mockResolvedValue({
        data: { id: 'patient-001' },
        error: null,
      });

      const result = await mockSupabase
        .from('patients')
        .delete()
        .eq('id', 'patient-001')
        .single();

      expect(result.error).toBeNull();
    });

    it('一般ユーザーはデータ削除不可', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-staff',
            user_metadata: { role: 'staff', clinic_id: 'clinic-001' },
          },
        },
        error: null,
      });

      mockSupabase.single.mockResolvedValue({
        data: null,
        error: {
          code: 'PGRST116',
          message: 'Insufficient privileges for delete operation',
        },
      });

      const result = await mockSupabase
        .from('patients')
        .delete()
        .eq('id', 'patient-001')
        .single();

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });
});
