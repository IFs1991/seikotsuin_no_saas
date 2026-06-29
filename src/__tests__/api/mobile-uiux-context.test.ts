import { NextRequest } from 'next/server';

import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
  getCurrentUser: jest.fn(),
  getUserAccessContext: jest.fn(),
  resolveScopedClinicIds:
    jest.requireActual('@/lib/supabase').resolveScopedClinicIds,
}));

const createClientMock = createClient as jest.Mock;
const getCurrentUserMock = getCurrentUser as jest.Mock;
const getUserAccessContextMock = getUserAccessContext as jest.Mock;

const user = { id: 'user-1', email: 'patient@example.com' };
const supabase = { client: 'supabase' };

function buildRequest(cookieHeader?: string, search = '') {
  return new NextRequest(`http://localhost/api/mobile-uiux/context${search}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

describe('GET /api/mobile-uiux/context', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'true',
      MOBILE_UIUX_ALLOWED_CLINIC_IDS: 'clinic-1,clinic-2',
    };
    delete process.env.MOBILE_UIUX_REAL_DATA_ENABLED;
    delete process.env.MOBILE_UIUX_WRITE_ENABLED;
    delete process.env.MOBILE_UIUX_RESERVATION_WRITE_ENABLED;
    delete process.env.MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED;
    delete process.env.MOBILE_UIUX_SETTINGS_WRITE_ENABLED;
    delete process.env.MOBILE_UIUX_ALLOWED_ROLES;

    createClientMock.mockResolvedValue(supabase);
    getCurrentUserMock.mockResolvedValue(user);
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'clinic_manager',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1', 'clinic-2'],
      },
      role: 'clinic_manager',
      normalizedRole: 'clinic_admin',
      clinicId: 'clinic-1',
      isActive: true,
      isAdmin: true,
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns 401 when unauthenticated', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const { GET } = await import('@/app/api/mobile-uiux/context/route');
    const response = await GET(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '認証が必要です',
      },
    });
    expect(getUserAccessContextMock).not.toHaveBeenCalled();
  });

  it('returns 403 when role is denied', async () => {
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'customer',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1'],
      },
      role: 'customer',
      normalizedRole: 'customer',
      clinicId: 'clinic-1',
      isActive: true,
      isAdmin: false,
    });

    const { GET } = await import('@/app/api/mobile-uiux/context/route');
    const response = await GET(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('returns 403 when clinic scope is empty', async () => {
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'clinic_admin',
        clinic_id: null,
        clinic_scope_ids: [],
      },
      role: 'clinic_admin',
      normalizedRole: 'clinic_admin',
      clinicId: null,
      isActive: true,
      isAdmin: true,
    });

    const { GET } = await import('@/app/api/mobile-uiux/context/route');
    const response = await GET(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN' },
    });
  });

  it('returns canonical context from getUserAccessContext without user PII', async () => {
    process.env.MOBILE_UIUX_REAL_DATA_ENABLED = 'true';
    process.env.MOBILE_UIUX_WRITE_ENABLED = 'true';
    process.env.MOBILE_UIUX_RESERVATION_WRITE_ENABLED = 'true';

    const { GET } = await import('@/app/api/mobile-uiux/context/route');
    const response = await GET(buildRequest('mobile_uiux_display_mode=mobile'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getUserAccessContextMock).toHaveBeenCalledWith('user-1', supabase, {
      user,
    });
    expect(body).toEqual({
      success: true,
      data: {
        role: {
          canonical: 'clinic_admin',
          label: '店舗管理者',
        },
        defaultClinicId: 'clinic-1',
        accessibleClinicIds: ['clinic-1', 'clinic-2'],
        displayMode: 'mobile',
        flags: {
          enabled: true,
          realDataEnabled: true,
          writeEnabled: true,
          reservationWriteEnabled: true,
          dailyReportWriteEnabled: false,
          settingsWriteEnabled: false,
        },
      },
      generatedAt: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      ),
    });
    expect(JSON.stringify(body)).not.toContain('patient@example.com');
    expect(JSON.stringify(body)).not.toContain('user-1');
  });

  it('falls back to system for unknown display mode cookie values', async () => {
    const { GET } = await import('@/app/api/mobile-uiux/context/route');
    const response = await GET(buildRequest('mobile_uiux_display_mode=broken'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.displayMode).toBe('system');
  });

  it('ignores client supplied role switch values', async () => {
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'staff',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1'],
      },
      role: 'staff',
      normalizedRole: 'staff',
      clinicId: 'clinic-1',
      isActive: true,
      isAdmin: false,
    });

    const { GET } = await import('@/app/api/mobile-uiux/context/route');
    const response = await GET(buildRequest(undefined, '?role=admin'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.role.canonical).toBe('staff');
  });
});
