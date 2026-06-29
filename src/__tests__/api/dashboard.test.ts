import { NextRequest } from 'next/server';

import { GET } from '@/app/api/dashboard/route';
import { ERROR_CODES, AppError } from '@/lib/error-handler';

const ensureClinicAccessMock = jest.fn();
const fetchDashboardReadModelMock = jest.fn();
const createDashboardSupabaseReadModelClientMock = jest.fn();

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: (...args: unknown[]) => ensureClinicAccessMock(...args),
}));

jest.mock('@/lib/dashboard/read-model', () => ({
  createDashboardSupabaseReadModelClient: (...args: unknown[]) =>
    createDashboardSupabaseReadModelClientMock(...args),
  fetchDashboardReadModel: (...args: unknown[]) =>
    fetchDashboardReadModelMock(...args),
}));

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const scopedSupabase = { name: 'scoped-supabase' };
const dashboardReadModelClient = { name: 'dashboard-read-model-client' };
const dashboardData = {
  dailyData: {
    revenue: 100000,
    patients: 12,
    insuranceRevenue: 30000,
    privateRevenue: 70000,
  },
  aiComment: null,
  revenueChartData: [],
  heatmapData: [],
  alerts: [],
};

describe('GET /api/dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureClinicAccessMock.mockResolvedValue({
      supabase: scopedSupabase,
      user: { id: 'user-1', email: 'staff@example.com' },
      permissions: {
        role: 'staff',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
    });
    createDashboardSupabaseReadModelClientMock.mockReturnValue(
      dashboardReadModelClient
    );
    fetchDashboardReadModelMock.mockResolvedValue(dashboardData);
  });

  it('uses the dashboard read model after validating clinic scope and non-customer roles', async () => {
    const request = new NextRequest(
      `http://localhost/api/dashboard?clinic_id=${clinicId}`
    );

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      data: dashboardData,
    });
    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      request,
      '/api/dashboard',
      clinicId,
      {
        allowedRoles: ['admin', 'clinic_admin', 'manager', 'therapist', 'staff'],
      }
    );
    expect(fetchDashboardReadModelMock).toHaveBeenCalledWith({
      supabase: dashboardReadModelClient,
      clinicId,
    });
    expect(createDashboardSupabaseReadModelClientMock).toHaveBeenCalledWith(
      scopedSupabase
    );
  });

  it('returns 403 when clinic scope validation fails', async () => {
    ensureClinicAccessMock.mockRejectedValue(
      new AppError(ERROR_CODES.FORBIDDEN, 'Forbidden clinic access', 403)
    );
    const request = new NextRequest(
      `http://localhost/api/dashboard?clinic_id=${clinicId}`
    );

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(fetchDashboardReadModelMock).not.toHaveBeenCalled();
  });

  it('returns 403 for customer role via the server-side dashboard role boundary', async () => {
    ensureClinicAccessMock.mockRejectedValue(
      new AppError(ERROR_CODES.FORBIDDEN, 'Forbidden role', 403)
    );
    const request = new NextRequest(
      `http://localhost/api/dashboard?clinic_id=${clinicId}`
    );

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      request,
      '/api/dashboard',
      clinicId,
      {
        allowedRoles: ['admin', 'clinic_admin', 'manager', 'therapist', 'staff'],
      }
    );
  });
});
