import { NextRequest } from 'next/server';

import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import {
  buildProfileResponse,
  fetchClinicNameWithClient,
} from '@/lib/auth/profile-read-model';
import { fetchDailyReportsReadModel } from '@/lib/daily-reports/read-model';

jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
  getCurrentUser: jest.fn(),
  getUserAccessContext: jest.fn(),
}));

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

jest.mock('@/lib/auth/profile-read-model', () => ({
  buildProfileResponse: jest.fn(),
  fetchClinicNameWithClient: jest.fn(),
}));

jest.mock('@/lib/daily-reports/read-model', () => ({
  fetchDailyReportsReadModel: jest.fn(),
}));

const createClientMock = createClient as jest.Mock;
const getCurrentUserMock = getCurrentUser as jest.Mock;
const getUserAccessContextMock = getUserAccessContext as jest.Mock;
const ensureClinicAccessMock = ensureClinicAccess as jest.Mock;
const buildProfileResponseMock = buildProfileResponse as jest.Mock;
const fetchClinicNameWithClientMock = fetchClinicNameWithClient as jest.Mock;
const fetchDailyReportsReadModelMock = fetchDailyReportsReadModel as jest.Mock;

const scopedSupabase = { client: 'scoped' };
const fallbackSupabase = { client: 'fallback' };
const user = { id: 'user-1', email: 'staff@example.com' };
const accessContext = {
  permissions: {
    role: 'staff',
    clinic_id: 'clinic-1',
  },
  role: 'staff',
  normalizedRole: 'staff',
  clinicId: 'clinic-1',
  isActive: true,
  isAdmin: false,
};
const profile = {
  id: 'user-1',
  email: 'staff@example.com',
  role: 'staff',
  clinicId: 'clinic-1',
  clinicName: '新宿院',
  isActive: true,
  isAdmin: false,
};
const dailyReports = {
  reports: [],
  summary: {
    totalReports: 0,
    averagePatients: 0,
    averageRevenue: 0,
    totalRevenue: 0,
  },
  monthlyTrends: [],
};

describe('GET /api/dashboard/bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createClientMock.mockResolvedValue(fallbackSupabase);
    getCurrentUserMock.mockResolvedValue(user);
    getUserAccessContextMock.mockResolvedValue(accessContext);
    ensureClinicAccessMock.mockResolvedValue({
      supabase: scopedSupabase,
      user,
      permissions: accessContext.permissions,
    });
    fetchClinicNameWithClientMock.mockResolvedValue('新宿院');
    buildProfileResponseMock.mockReturnValue(profile);
    fetchDailyReportsReadModelMock.mockResolvedValue(dailyReports);
  });

  it('uses requested clinic_id and delegates scope checks to ensureClinicAccess', async () => {
    const { GET } = await import('@/app/api/dashboard/bootstrap/route');
    const request = new NextRequest(
      'http://localhost/api/dashboard/bootstrap?clinic_id=clinic-requested'
    );

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      data: {
        profile,
        dailyReports,
      },
    });
    expect(createClientMock).not.toHaveBeenCalled();
    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      request,
      '/api/dashboard/bootstrap',
      'clinic-requested'
    );
    expect(fetchDailyReportsReadModelMock).toHaveBeenCalledWith({
      supabase: scopedSupabase,
      clinicId: 'clinic-requested',
      startDate: null,
      endDate: null,
    });
    expect(fetchClinicNameWithClientMock).toHaveBeenCalledWith(
      scopedSupabase,
      'clinic-requested'
    );
  });

  it('resolves fallback clinic_id before calling ensureClinicAccess', async () => {
    getUserAccessContextMock
      .mockResolvedValueOnce({
        ...accessContext,
        clinicId: 'clinic-fallback',
      })
      .mockResolvedValueOnce({
        ...accessContext,
        clinicId: 'clinic-fallback',
      });

    const { GET } = await import('@/app/api/dashboard/bootstrap/route');
    const request = new NextRequest('http://localhost/api/dashboard/bootstrap');

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(getUserAccessContextMock).toHaveBeenNthCalledWith(
      1,
      'user-1',
      fallbackSupabase,
      { user }
    );
    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      request,
      '/api/dashboard/bootstrap',
      'clinic-fallback'
    );
  });

  it('fails closed when fallback clinic_id cannot be resolved', async () => {
    getUserAccessContextMock.mockResolvedValueOnce({
      ...accessContext,
      clinicId: null,
    });

    const { GET } = await import('@/app/api/dashboard/bootstrap/route');
    const request = new NextRequest('http://localhost/api/dashboard/bootstrap');

    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: 'clinic_id could not be resolved' });
    expect(ensureClinicAccessMock).not.toHaveBeenCalled();
  });
});
