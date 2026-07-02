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
type EntitlementRow = {
  clinic_id: string;
  mobile_uiux_enabled: boolean;
  mobile_uiux_real_data_enabled: boolean;
  mobile_uiux_write_enabled: boolean;
  mobile_uiux_reservation_write_enabled: boolean;
  mobile_uiux_daily_report_write_enabled: boolean;
  mobile_uiux_settings_write_enabled: boolean;
  rollout_phase: string;
  updated_at: string;
  updated_by: string | null;
};

type EntitlementBuilder = {
  select: jest.MockedFunction<(columns: string) => EntitlementBuilder>;
  in: jest.MockedFunction<
    (column: string, values: readonly string[]) => EntitlementBuilder
  >;
  returns: jest.MockedFunction<
    () => Promise<{ data: EntitlementRow[]; error: null }>
  >;
};

function buildEntitlementRow(
  clinicId: string,
  overrides: Partial<Omit<EntitlementRow, 'clinic_id'>> = {}
): EntitlementRow {
  return {
    clinic_id: clinicId,
    mobile_uiux_enabled: true,
    mobile_uiux_real_data_enabled: true,
    mobile_uiux_write_enabled: true,
    mobile_uiux_reservation_write_enabled: true,
    mobile_uiux_daily_report_write_enabled: true,
    mobile_uiux_settings_write_enabled: true,
    rollout_phase: 'pilot',
    updated_at: '2026-07-02T00:00:00.000Z',
    updated_by: 'admin-user-id',
    ...overrides,
  };
}

function createEntitlementClient(rows: EntitlementRow[]) {
  let builder: EntitlementBuilder;
  builder = {
    select: jest.fn(() => builder),
    in: jest.fn(() => builder),
    returns: jest.fn(async () => ({ data: rows, error: null })),
  };

  return {
    from: jest.fn((tableName: string) => {
      if (tableName !== 'clinic_feature_flags') {
        throw new Error(`Unexpected table: ${tableName}`);
      }
      return builder;
    }),
    builder,
  };
}

function buildRequest(cookieHeader?: string, search = '') {
  return new NextRequest(`http://localhost/api/mobile-uiux/context${search}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

describe('GET /api/mobile-uiux/context', () => {
  const originalEnv = process.env;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'true',
      MOBILE_UIUX_ALLOWED_CLINIC_IDS: 'clinic-1,clinic-2',
    };
    delete process.env.MOBILE_UIUX_USE_DB_ENTITLEMENTS;
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

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns 401 when unauthenticated', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const { GET } = await import('@/app/api/mobile-uiux/context/route');
    const response = await GET(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
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
    expect(warnSpy).toHaveBeenCalledWith(
      '[mobile-uiux] access denied',
      expect.objectContaining({
        reasonCode: 'role_denied',
        role: 'customer',
        allowedClinicCount: 2,
        scopedClinicCount: 1,
        writeTarget: 'context',
        featureFlagEnabled: true,
      })
    );
    const logText = JSON.stringify(warnSpy.mock.calls);
    expect(logText).not.toContain('patient@example.com');
    expect(logText).not.toContain('user-1');
    expect(logText).not.toContain('clinic-1');
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
    expect(warnSpy).toHaveBeenCalledWith(
      '[mobile-uiux] access denied',
      expect.objectContaining({
        reasonCode: 'clinic_scope_empty',
        role: 'clinic_admin',
        allowedClinicCount: 2,
        scopedClinicCount: 0,
        writeTarget: 'context',
        featureFlagEnabled: true,
      })
    );
  });

  it('returns canonical context from getUserAccessContext without user PII', async () => {
    process.env.MOBILE_UIUX_REAL_DATA_ENABLED = 'true';
    process.env.MOBILE_UIUX_WRITE_ENABLED = 'true';
    process.env.MOBILE_UIUX_RESERVATION_WRITE_ENABLED = 'true';

    const { GET } = await import('@/app/api/mobile-uiux/context/route');
    const response = await GET(buildRequest('mobile_uiux_display_mode=mobile'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
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
          useDbEntitlements: false,
          realDataEnabled: true,
          writeEnabled: true,
          reservationWriteEnabled: true,
          dailyReportWriteEnabled: false,
          settingsWriteEnabled: false,
          rolloutPhase: null,
        },
      },
      generatedAt: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      ),
    });
    expect(JSON.stringify(body)).not.toContain('patient@example.com');
    expect(JSON.stringify(body)).not.toContain('user-1');
  });

  it('does not read DB entitlements when MOBILE_UIUX_USE_DB_ENTITLEMENTS is false', async () => {
    const entitlementClient = createEntitlementClient([
      buildEntitlementRow('clinic-1'),
    ]);
    createClientMock.mockResolvedValue(entitlementClient);

    const { GET } = await import('@/app/api/mobile-uiux/context/route');
    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    expect(entitlementClient.from).not.toHaveBeenCalled();
  });

  it('returns 403 when DB entitlements are enabled and clinic entitlement is false', async () => {
    process.env.MOBILE_UIUX_USE_DB_ENTITLEMENTS = 'true';
    const entitlementClient = createEntitlementClient([
      buildEntitlementRow('clinic-1', {
        mobile_uiux_enabled: false,
      }),
    ]);
    createClientMock.mockResolvedValue(entitlementClient);

    const { GET } = await import('@/app/api/mobile-uiux/context/route');
    const response = await GET(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(entitlementClient.from).toHaveBeenCalledWith('clinic_feature_flags');
  });

  it('returns public flags from env and DB entitlements when enabled', async () => {
    process.env.MOBILE_UIUX_USE_DB_ENTITLEMENTS = 'true';
    process.env.MOBILE_UIUX_REAL_DATA_ENABLED = 'true';
    process.env.MOBILE_UIUX_WRITE_ENABLED = 'true';
    process.env.MOBILE_UIUX_RESERVATION_WRITE_ENABLED = 'true';
    process.env.MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED = 'true';
    process.env.MOBILE_UIUX_SETTINGS_WRITE_ENABLED = 'true';
    const entitlementClient = createEntitlementClient([
      buildEntitlementRow('clinic-1', {
        mobile_uiux_settings_write_enabled: false,
      }),
      buildEntitlementRow('clinic-2', {
        mobile_uiux_enabled: false,
      }),
    ]);
    createClientMock.mockResolvedValue(entitlementClient);

    const { GET } = await import('@/app/api/mobile-uiux/context/route');
    const response = await GET(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.accessibleClinicIds).toEqual(['clinic-1']);
    expect(body.data.flags).toEqual({
      enabled: true,
      useDbEntitlements: true,
      realDataEnabled: true,
      writeEnabled: true,
      reservationWriteEnabled: true,
      dailyReportWriteEnabled: true,
      settingsWriteEnabled: false,
      rolloutPhase: 'pilot',
    });
    expect(JSON.stringify(body)).not.toContain('patient@example.com');
    expect(JSON.stringify(body)).not.toContain('user-1');
    expect(JSON.stringify(body)).not.toContain('admin-user-id');
  });

  it('falls back to system for unknown display mode cookie values', async () => {
    const { GET } = await import('@/app/api/mobile-uiux/context/route');
    const response = await GET(buildRequest('mobile_uiux_display_mode=broken'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.displayMode).toBe('system');
  });

  it('does not use display mode as an API authorization condition', async () => {
    const { GET } = await import('@/app/api/mobile-uiux/context/route');
    const response = await GET(
      buildRequest('mobile_uiux_display_mode=desktop')
    );

    expect(response.status).toBe(200);
    expect(getUserAccessContextMock).toHaveBeenCalledWith('user-1', supabase, {
      user,
    });
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
