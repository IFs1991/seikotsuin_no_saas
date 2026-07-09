import { NextRequest } from 'next/server';

import { processApiRequest } from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { createScopedAdminContext } from '@/lib/supabase/scoped-admin';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';

jest.mock('@/lib/api-helpers', () => {
  const actual =
    jest.requireActual<typeof import('@/lib/api-helpers')>('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: jest.fn(),
  },
}));

jest.mock('@/lib/supabase/scoped-admin', () => {
  const actual = jest.requireActual<
    typeof import('@/lib/supabase/scoped-admin')
  >('@/lib/supabase/scoped-admin');
  return {
    ...actual,
    createScopedAdminContext: jest.fn(),
  };
});

jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
  getCurrentUser: jest.fn(),
  getUserAccessContext: jest.fn(),
  resolveScopedClinicIds:
    jest.requireActual('@/lib/supabase').resolveScopedClinicIds,
}));

const processApiRequestMock = jest.mocked(processApiRequest);
const createScopedAdminContextMock = jest.mocked(createScopedAdminContext);
const logAdminActionMock = jest.mocked(AuditLogger.logAdminAction);
const createClientMock = jest.mocked(createClient);
const getCurrentUserMock = jest.mocked(getCurrentUser);
const getUserAccessContextMock = jest.mocked(getUserAccessContext);

const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLINIC_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_USER_ID = '33333333-3333-4333-8333-333333333333';

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

type EntitlementPayload = Omit<EntitlementRow, 'updated_at' | 'updated_by'>;
type EntitlementInsert = EntitlementPayload & { updated_by: string };

type ProcessApiSuccessMock = {
  success: true;
  auth: { id: string; email: string; role: string };
  permissions: {
    role: string;
    clinic_id: string | null;
    clinic_scope_ids: string[];
  };
  supabase: object;
  body?: unknown;
};

function buildEntitlementRow(
  overrides: Partial<EntitlementRow> = {}
): EntitlementRow {
  return {
    clinic_id: CLINIC_ID,
    mobile_uiux_enabled: true,
    mobile_uiux_real_data_enabled: true,
    mobile_uiux_write_enabled: false,
    mobile_uiux_reservation_write_enabled: false,
    mobile_uiux_daily_report_write_enabled: false,
    mobile_uiux_settings_write_enabled: false,
    rollout_phase: 'pilot',
    updated_at: '2026-07-03T00:00:00.000Z',
    updated_by: null,
    ...overrides,
  };
}

function buildUpsertPayload(
  overrides: Partial<EntitlementPayload> = {}
): EntitlementPayload {
  return {
    clinic_id: CLINIC_ID,
    mobile_uiux_enabled: true,
    mobile_uiux_real_data_enabled: true,
    mobile_uiux_write_enabled: true,
    mobile_uiux_reservation_write_enabled: true,
    mobile_uiux_daily_report_write_enabled: false,
    mobile_uiux_settings_write_enabled: false,
    rollout_phase: 'pilot',
    ...overrides,
  };
}

function toProcessApiSuccess(
  params: { role?: string; body?: unknown } = {}
): ProcessApiSuccessMock {
  const role = params.role ?? 'admin';
  return {
    success: true,
    auth: {
      id: ADMIN_USER_ID,
      email: 'admin@example.com',
      role,
    },
    permissions: {
      role,
      clinic_id: CLINIC_ID,
      clinic_scope_ids: [CLINIC_ID],
    },
    supabase: {},
    body: params.body,
  };
}

function mockProcessSuccess(params: { role?: string; body?: unknown } = {}) {
  processApiRequestMock.mockResolvedValue(toProcessApiSuccess(params));
}

function createAdminClientFixture(rows: Map<string, EntitlementRow>) {
  const maybeSingle = jest.fn(async () => {
    const row = rows.get(CLINIC_ID) ?? null;
    return { data: row, error: null };
  });
  const returns = jest.fn(() => ({ maybeSingle }));
  const eq = jest.fn(() => ({ returns }));
  const selectForGet = jest.fn(() => ({ eq }));
  const upsert = jest.fn(async (payload: EntitlementInsert) => {
    const row = buildEntitlementRow({
      ...payload,
      updated_at: '2026-07-03T01:00:00.000Z',
    });
    rows.set(payload.clinic_id, row);
    return { error: null };
  });
  const from = jest.fn((tableName: string) => {
    if (tableName !== 'clinic_feature_flags') {
      throw new Error(`Unexpected table: ${tableName}`);
    }
    return {
      select: selectForGet,
      upsert,
    };
  });

  return {
    client: { from },
    assertions: {
      from,
      selectForGet,
      eq,
      upsert,
      returns,
      maybeSingle,
    },
  };
}

function createContextClientFixture(rows: Map<string, EntitlementRow>) {
  let requestedClinicIds: readonly string[] = [];
  const returns = jest.fn(async () => ({
    data: requestedClinicIds
      .map(clinicId => rows.get(clinicId))
      .filter((row): row is EntitlementRow => row !== undefined),
    error: null,
  }));
  const inFilter = jest.fn((_column: string, clinicIds: readonly string[]) => {
    requestedClinicIds = clinicIds;
    return { returns };
  });
  const select = jest.fn(() => ({ in: inFilter }));
  const from = jest.fn((tableName: string) => {
    if (tableName !== 'clinic_feature_flags') {
      throw new Error(`Unexpected table: ${tableName}`);
    }
    return { select };
  });

  return { from };
}

function mockScopedAdminContext(rows: Map<string, EntitlementRow>) {
  const fixture = createAdminClientFixture(rows);
  const assertClinicInScope = jest.fn((clinicId: string) => {
    if (clinicId !== CLINIC_ID) {
      throw new Error('対象クリニックへのアクセス権がありません');
    }
  });
  createScopedAdminContextMock.mockReturnValue({
    client: fixture.client,
    scopedClinicIds: [CLINIC_ID],
    assertClinicInScope,
  });
  return { ...fixture, assertClinicInScope };
}

function buildRequest(method: 'GET' | 'PUT', url: string) {
  return new NextRequest(url, { method });
}

describe('/api/admin/mobile-uiux/entitlements', () => {
  const originalEnv = process.env;
  const rows = new Map<string, EntitlementRow>();

  beforeEach(() => {
    jest.clearAllMocks();
    rows.clear();
    rows.set(CLINIC_ID, buildEntitlementRow());
    process.env = { ...originalEnv };
    delete process.env.MOBILE_UIUX_USE_DB_ENTITLEMENTS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns 401 when admin auth fails', async () => {
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: new Response(
        JSON.stringify({ success: false, error: '認証が必要です' }),
        {
          status: 401,
        }
      ),
    });

    const { GET } =
      await import('@/app/api/admin/mobile-uiux/entitlements/route');
    const response = await GET(
      buildRequest(
        'GET',
        `http://localhost/api/admin/mobile-uiux/entitlements?clinic_id=${CLINIC_ID}`
      )
    );

    expect(response.status).toBe(401);
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
  });

  it('returns 403 when a non-admin role tries to upsert', async () => {
    mockProcessSuccess({
      role: 'clinic_admin',
      body: buildUpsertPayload(),
    });

    const { PUT } =
      await import('@/app/api/admin/mobile-uiux/entitlements/route');
    const response = await PUT(
      buildRequest('PUT', 'http://localhost/api/admin/mobile-uiux/entitlements')
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      success: false,
      error: 'この操作はadminのみ実行できます',
    });
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid upsert payloads', async () => {
    mockProcessSuccess({
      body: {
        ...buildUpsertPayload(),
        clinic_id: 'not-a-uuid',
      },
    });

    const { PUT } =
      await import('@/app/api/admin/mobile-uiux/entitlements/route');
    const response = await PUT(
      buildRequest('PUT', 'http://localhost/api/admin/mobile-uiux/entitlements')
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
  });

  it('returns the requested entitlement row', async () => {
    mockProcessSuccess();
    const fixture = mockScopedAdminContext(rows);

    const { GET } =
      await import('@/app/api/admin/mobile-uiux/entitlements/route');
    const response = await GET(
      buildRequest(
        'GET',
        `http://localhost/api/admin/mobile-uiux/entitlements?clinic_id=${CLINIC_ID}`
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        entitlement: buildEntitlementRow(),
      },
    });
    expect(fixture.assertClinicInScope).toHaveBeenCalledWith(CLINIC_ID);
    expect(fixture.assertions.eq).toHaveBeenCalledWith('clinic_id', CLINIC_ID);
  });

  it('upserts an entitlement row with updated_by and writes an audit log', async () => {
    const payload = buildUpsertPayload({
      mobile_uiux_daily_report_write_enabled: true,
      rollout_phase: 'write_pilot',
    });
    mockProcessSuccess({ body: payload });
    const fixture = mockScopedAdminContext(rows);

    const { PUT } =
      await import('@/app/api/admin/mobile-uiux/entitlements/route');
    const response = await PUT(
      buildRequest('PUT', 'http://localhost/api/admin/mobile-uiux/entitlements')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fixture.assertions.upsert).toHaveBeenCalledWith(
      {
        ...payload,
        updated_by: ADMIN_USER_ID,
      },
      { onConflict: 'clinic_id' }
    );
    expect(body.data.entitlement).toMatchObject({
      ...payload,
      updated_by: ADMIN_USER_ID,
    });
    expect(logAdminActionMock).toHaveBeenCalledWith(
      ADMIN_USER_ID,
      'admin@example.com',
      'mobile_uiux_entitlement_upsert',
      CLINIC_ID,
      expect.objectContaining({
        action_target: 'mobile_uiux_entitlement',
        clinic_id: CLINIC_ID,
        rollout_phase: 'write_pilot',
      })
    );
    expect(JSON.stringify(logAdminActionMock.mock.calls)).not.toContain(
      'patient'
    );
  });

  it('reflects an entitlement upsert in GET /api/mobile-uiux/context publicFlags', async () => {
    const payload = buildUpsertPayload({
      mobile_uiux_daily_report_write_enabled: true,
      mobile_uiux_settings_write_enabled: true,
      rollout_phase: 'write_pilot',
    });
    mockProcessSuccess({ body: payload });
    mockScopedAdminContext(rows);

    const { PUT } =
      await import('@/app/api/admin/mobile-uiux/entitlements/route');
    const putResponse = await PUT(
      buildRequest('PUT', 'http://localhost/api/admin/mobile-uiux/entitlements')
    );
    expect(putResponse.status).toBe(200);

    process.env.MOBILE_UIUX_ENABLED = 'true';
    process.env.MOBILE_UIUX_ALLOWED_CLINIC_IDS = `${CLINIC_ID},${OTHER_CLINIC_ID}`;
    process.env.MOBILE_UIUX_USE_DB_ENTITLEMENTS = 'true';
    process.env.MOBILE_UIUX_REAL_DATA_ENABLED = 'true';
    process.env.MOBILE_UIUX_WRITE_ENABLED = 'true';
    process.env.MOBILE_UIUX_RESERVATION_WRITE_ENABLED = 'true';
    process.env.MOBILE_UIUX_DAILY_REPORT_WRITE_ENABLED = 'true';
    process.env.MOBILE_UIUX_SETTINGS_WRITE_ENABLED = 'true';

    const contextClient = createContextClientFixture(rows);
    createClientMock.mockResolvedValue(contextClient);
    getCurrentUserMock.mockResolvedValue({
      id: 'context-user-id',
      email: 'staff@example.com',
    });
    getUserAccessContextMock.mockResolvedValue({
      permissions: {
        role: 'clinic_admin',
        clinic_id: CLINIC_ID,
        clinic_scope_ids: [CLINIC_ID, OTHER_CLINIC_ID],
      },
      role: 'clinic_admin',
      normalizedRole: 'clinic_admin',
      clinicId: CLINIC_ID,
      isActive: true,
      isAdmin: true,
    });

    const { GET } = await import('@/app/api/mobile-uiux/context/route');
    const response = await GET(
      new NextRequest('http://localhost/api/mobile-uiux/context')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.accessibleClinicIds).toEqual([CLINIC_ID]);
    expect(body.data.flags).toEqual({
      enabled: true,
      useDbEntitlements: true,
      realDataEnabled: true,
      writeEnabled: true,
      reservationWriteEnabled: true,
      dailyReportWriteEnabled: true,
      settingsWriteEnabled: true,
      rolloutPhase: 'write_pilot',
    });
  });
});
