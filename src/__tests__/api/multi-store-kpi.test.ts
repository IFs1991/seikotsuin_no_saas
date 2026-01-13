/**
 * 多店舗分析API ユニットテスト（TDD）
 *
 * 仕様:
 * - GET /api/admin/tenants を拡張
 * - 返却: revenue, patients, staff_performance_score
 * - 権限: admin/clinic_admin のみ許可
 */

import { NextRequest } from 'next/server';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

// モックの設定
const ensureClinicAccessMock = jest.fn();
const supabaseFromMock = jest.fn();

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: (...args: unknown[]) => ensureClinicAccessMock(...args),
}));

import { GET } from '@/app/api/admin/tenants/route';

// クエリビルダーのモックヘルパー
function createQueryBuilder(finalData: unknown, finalError: unknown = null) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    then: jest.fn((resolve: (value: { data: unknown; error: unknown }) => void) =>
      resolve({ data: finalData, error: finalError })
    ),
  };
  // Promise-like behavior
  Object.defineProperty(builder, 'data', { get: () => finalData });
  Object.defineProperty(builder, 'error', { get: () => finalError });
  return builder;
}

describe('多店舗分析API - GET /api/admin/tenants', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'admin@test.com',
  };

  const mockClinicData = [
    {
      id: 'clinic-1',
      name: 'テストクリニック1',
      address: '東京都渋谷区',
      phone_number: '03-1234-5678',
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'clinic-2',
      name: 'テストクリニック2',
      address: '大阪府大阪市',
      phone_number: '06-1234-5678',
      is_active: true,
      created_at: '2024-01-02T00:00:00Z',
    },
  ];

  const mockRevenueData = [
    { clinic_id: 'clinic-1', total_revenue: 500000 },
    { clinic_id: 'clinic-2', total_revenue: 300000 },
  ];

  const mockPatientData = [
    { clinic_id: 'clinic-1', patient_id: 'patient-1' },
    { clinic_id: 'clinic-1', patient_id: 'patient-2' },
    { clinic_id: 'clinic-1', patient_id: 'patient-3' },
    // 150人分の患者をシミュレート
    ...Array.from({ length: 147 }, (_, i) => ({
      clinic_id: 'clinic-1',
      patient_id: `patient-${i + 4}`,
    })),
    ...Array.from({ length: 100 }, (_, i) => ({
      clinic_id: 'clinic-2',
      patient_id: `patient-c2-${i + 1}`,
    })),
  ];

  const mockStaffPerformanceData = [
    { clinic_id: 'clinic-1', total_revenue_generated: 500000, total_visits: 150 },
    { clinic_id: 'clinic-2', total_revenue_generated: 300000, total_visits: 100 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('権限チェック', () => {
    it('認証されていない場合は401を返す', async () => {
      ensureClinicAccessMock.mockRejectedValue(
        new AppError(ERROR_CODES.UNAUTHORIZED, '認証が必要です', 401)
      );

      const request = new NextRequest('http://localhost/api/admin/tenants');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const payload = await response.json();
      expect(payload.success).toBe(false);
    });

    it('admin以外のロールでは403を返す', async () => {
      supabaseFromMock.mockImplementation(() => createQueryBuilder(mockClinicData));
      ensureClinicAccessMock.mockResolvedValue({
        supabase: { from: supabaseFromMock },
        user: mockUser,
        permissions: { role: 'therapist', clinicId: null },
      });

      const request = new NextRequest('http://localhost/api/admin/tenants');
      const response = await GET(request);

      expect(response.status).toBe(403);
      const payload = await response.json();
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('管理者権限が必要です');
    });

    it('adminロールでアクセス可能', async () => {
      supabaseFromMock.mockImplementation(() => createQueryBuilder(mockClinicData));
      ensureClinicAccessMock.mockResolvedValue({
        supabase: { from: supabaseFromMock },
        user: mockUser,
        permissions: { role: 'admin', clinicId: null },
      });

      const request = new NextRequest('http://localhost/api/admin/tenants');
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('KPIデータ取得（include_kpi=true）', () => {
    beforeEach(() => {
      ensureClinicAccessMock.mockResolvedValue({
        supabase: { from: supabaseFromMock },
        user: mockUser,
        permissions: { role: 'admin', clinicId: null },
      });
    });

    it('include_kpi=true の場合、各クリニックのKPIデータを含む', async () => {
      // KPIデータ取得用のモック設定
      supabaseFromMock.mockImplementation((tableName: string) => {
        if (tableName === 'clinics') {
          return createQueryBuilder(mockClinicData);
        }
        if (tableName === 'daily_revenue_summary') {
          return createQueryBuilder(mockRevenueData);
        }
        if (tableName === 'patient_visit_summary') {
          return createQueryBuilder(mockPatientData);
        }
        if (tableName === 'staff_performance_summary') {
          return createQueryBuilder(mockStaffPerformanceData);
        }
        return createQueryBuilder([]);
      });

      const request = new NextRequest('http://localhost/api/admin/tenants?include_kpi=true');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.success).toBe(true);
      expect(payload.data.items).toBeDefined();

      // KPIデータが含まれていることを確認
      const clinic1 = payload.data.items.find((c: { id: string }) => c.id === 'clinic-1');
      expect(clinic1).toBeDefined();
      expect(clinic1.kpi).toBeDefined();
      expect(clinic1.kpi.revenue).toBe(500000);
      expect(clinic1.kpi.patients).toBe(150);
      expect(clinic1.kpi.staff_performance_score).toBeDefined();
    });

    it('KPIデータがないクリニックは0/nullで返される', async () => {
      // クリニック3のデータがない場合のモック
      const clinicsWithNew = [
        ...mockClinicData,
        {
          id: 'clinic-3',
          name: '新規クリニック',
          address: '福岡県福岡市',
          phone_number: '092-1234-5678',
          is_active: true,
          created_at: '2024-01-03T00:00:00Z',
        },
      ];

      supabaseFromMock.mockImplementation((tableName: string) => {
        if (tableName === 'clinics') {
          return createQueryBuilder(clinicsWithNew);
        }
        if (tableName === 'daily_revenue_summary') {
          return createQueryBuilder(mockRevenueData); // clinic-3のデータなし
        }
        if (tableName === 'patient_visit_summary') {
          return createQueryBuilder(mockPatientData);
        }
        if (tableName === 'staff_performance_summary') {
          return createQueryBuilder(mockStaffPerformanceData);
        }
        return createQueryBuilder([]);
      });

      const request = new NextRequest('http://localhost/api/admin/tenants?include_kpi=true');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const payload = await response.json();

      const clinic3 = payload.data.items.find((c: { id: string }) => c.id === 'clinic-3');
      expect(clinic3).toBeDefined();
      expect(clinic3.kpi.revenue).toBe(0);
      expect(clinic3.kpi.patients).toBe(0);
    });
  });

  describe('既存機能との互換性', () => {
    beforeEach(() => {
      supabaseFromMock.mockImplementation(() => createQueryBuilder(mockClinicData));
      ensureClinicAccessMock.mockResolvedValue({
        supabase: { from: supabaseFromMock },
        user: mockUser,
        permissions: { role: 'admin', clinicId: null },
      });
    });

    it('include_kpi パラメータなしでは従来通りの応答を返す', async () => {
      const request = new NextRequest('http://localhost/api/admin/tenants');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.data.items).toBeDefined();
      // KPIは含まれない
      expect(payload.data.items[0]?.kpi).toBeUndefined();
    });

    it('検索フィルタは引き続き動作する', async () => {
      supabaseFromMock.mockImplementation(() => createQueryBuilder([mockClinicData[0]]));

      const request = new NextRequest('http://localhost/api/admin/tenants?search=テスト');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.data.items.length).toBe(1);
    });
  });
});
