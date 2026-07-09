import { NextRequest } from 'next/server';

import { processApiRequest } from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
  };
});

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: jest.fn(),
  },
}));

const processApiRequestMock = jest.mocked(processApiRequest);
const logAdminActionMock = jest.mocked(AuditLogger.logAdminAction);

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const menuId = '123e4567-e89b-12d3-a456-426614174001';
const resourceId = '123e4567-e89b-12d3-a456-426614174002';

type QueryResult = { data: unknown; error: null };

function createSettingsClient(result: QueryResult) {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };

  return {
    client: { from: jest.fn().mockReturnValue(query) },
    query,
  };
}

function createSettingsWriteClient(readSettings: Record<string, unknown>) {
  const query = {
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: {
        settings: readSettings,
        updated_at: '2026-07-01T09:00:00.000Z',
        updated_by: 'user-1',
      },
      error: null,
    }),
  };
  const table = {
    upsert: jest.fn().mockResolvedValue({ error: null }),
    select: jest.fn().mockReturnValue(query),
  };

  return {
    client: { from: jest.fn().mockReturnValue(table) },
    table,
    query,
  };
}

function createSettingsDetailClient() {
  const clinicsQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: {
        id: clinicId,
        name: '中央整骨院',
        address: '東京都千代田区',
        phone: '03-0000-0000',
      },
      error: null,
    }),
  };
  const menusQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({
      data: [
        {
          id: menuId,
          clinic_id: clinicId,
          name: '整体',
          duration_minutes: 30,
          price: 5000,
          description: null,
          category: 'body',
          is_insurance_applicable: false,
          is_active: true,
          options: null,
        },
      ],
      error: null,
    }),
  };
  const resourcesQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({
      data: [
        {
          id: resourceId,
          name: '施術ベッド1',
          type: 'room',
          working_hours: null,
          supported_menus: null,
          max_concurrent: null,
          nomination_fee: null,
          is_active: true,
          is_bookable: true,
        },
      ],
      error: null,
    }),
  };
  const from = jest.fn((table: string) => {
    if (table === 'clinics') return clinicsQuery;
    if (table === 'menus') return menusQuery;
    return resourcesQuery;
  });

  return {
    client: { from },
    clinicsQuery,
    menusQuery,
    resourcesQuery,
  };
}

function buildSettingsRequest(search: string) {
  return new NextRequest(`http://localhost/api/mobile-uiux/settings${search}`);
}

function buildSettingsDetailRequest(search: string) {
  return new NextRequest(
    `http://localhost/api/mobile-uiux/settings-detail${search}`
  );
}

describe('GET /api/mobile-uiux/settings', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'true',
      MOBILE_UIUX_REAL_DATA_ENABLED: 'true',
      MOBILE_UIUX_SETTINGS_WRITE_ENABLED: 'false',
      MOBILE_UIUX_ALLOWED_CLINIC_IDS: clinicId,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses PC settings category access and redacts communication secrets', async () => {
    const { client, query } = createSettingsClient({
      data: {
        settings: {
          channels: { emailEnabled: true },
          smtpSettings: {
            host: 'smtp.example.com',
            port: 587,
            user: 'legacy-user',
            password: 'super-secret',
          },
          templates: [],
        },
        updated_at: '2026-06-12T09:00:00.000Z',
        updated_by: 'user-1',
      },
      error: null,
    });
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'manager@example.com', role: 'manager' },
      permissions: {
        role: 'manager',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: client,
    });

    const { GET } = await import('@/app/api/mobile-uiux/settings/route');
    const request = buildSettingsRequest(
      `?clinic_id=${clinicId}&category=communication`
    );
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      allowedRoles: ['admin', 'clinic_admin', 'manager', 'therapist', 'staff'],
      clinicId,
      requireClinicMatch: true,
    });
    expect(client.from).toHaveBeenCalledWith('clinic_settings');
    expect(query.eq).toHaveBeenCalledWith('clinic_id', clinicId);
    expect(query.eq).toHaveBeenCalledWith('category', 'communication');
    expect(payload.data.settings.smtpSettings).toEqual({
      host: 'smtp.example.com',
      port: 587,
      username: 'legacy-user',
      secure: true,
    });
    expect(JSON.stringify(payload)).not.toContain('super-secret');
  });

  it('returns 403 when PC category access denies the role', async () => {
    const { client } = createSettingsClient({ data: null, error: null });
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'manager@example.com', role: 'manager' },
      permissions: {
        role: 'manager',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: client,
    });

    const { GET } = await import('@/app/api/mobile-uiux/settings/route');
    const response = await GET(
      buildSettingsRequest(`?clinic_id=${clinicId}&category=system_security`)
    );

    expect(response.status).toBe(403);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('returns 403 for mobile settings writes while write flags are off', async () => {
    const { PUT } = await import('@/app/api/mobile-uiux/settings/route');

    const response = await PUT(
      new NextRequest('http://localhost/api/mobile-uiux/settings', {
        method: 'PUT',
      })
    );

    expect(response.status).toBe(403);
  });

  it('updates an allowed settings category and logs through the shared audit logger without secrets', async () => {
    process.env.MOBILE_UIUX_WRITE_ENABLED = 'true';
    process.env.MOBILE_UIUX_SETTINGS_WRITE_ENABLED = 'true';
    const requestBody = {
      clinic_id: clinicId,
      category: 'communication',
      settings: {
        channels: { emailEnabled: true },
        smtpSettings: {
          host: 'smtp.example.com',
          port: 587,
          username: 'mail-user',
          password: 'smtp-password-secret',
          token: 'token-secret',
        },
        templates: [],
      },
    };
    const readSettings = {
      channels: {
        emailEnabled: true,
        smsEnabled: false,
        lineEnabled: false,
        pushEnabled: false,
      },
      smtpSettings: {
        host: 'smtp.example.com',
        port: 587,
        username: 'mail-user',
        secure: true,
      },
      templates: [],
    };
    const { client, table, query } = createSettingsWriteClient(readSettings);
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'manager@example.com', role: 'manager' },
      permissions: {
        role: 'manager',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: client,
      body: requestBody,
    });
    const { PUT } = await import('@/app/api/mobile-uiux/settings/route');

    const response = await PUT(
      new NextRequest('http://localhost/api/mobile-uiux/settings', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
        headers: { 'content-type': 'application/json' },
      })
    );
    const payload = await response.json();
    const responseText = JSON.stringify(payload);
    const upsertText = JSON.stringify(table.upsert.mock.calls);
    const auditText = JSON.stringify(logAdminActionMock.mock.calls);

    expect(response.status).toBe(200);
    expect(table.upsert).toHaveBeenCalledWith(
      {
        clinic_id: clinicId,
        category: 'communication',
        settings: readSettings,
        updated_by: 'user-1',
      },
      { onConflict: 'clinic_id,category' }
    );
    expect(query.eq).toHaveBeenCalledWith('clinic_id', clinicId);
    expect(query.eq).toHaveBeenCalledWith('category', 'communication');
    expect(logAdminActionMock).toHaveBeenCalledWith(
      'user-1',
      'manager@example.com',
      'manager_settings_update',
      undefined,
      {
        actor_role: 'manager',
        category: 'communication',
        clinic_id: clinicId,
        settingsUpdated: true,
      }
    );
    expect(payload).toMatchObject({
      success: true,
      data: {
        clinicId,
        category: 'communication',
        settings: readSettings,
      },
    });
    expect(responseText).not.toContain('smtp-password-secret');
    expect(responseText).not.toContain('token-secret');
    expect(upsertText).not.toContain('smtp-password-secret');
    expect(upsertText).not.toContain('token-secret');
    expect(auditText).not.toContain('smtp-password-secret');
    expect(auditText).not.toContain('token-secret');
  });

  it('returns 403 for disallowed settings categories in the mobile rollout', async () => {
    process.env.MOBILE_UIUX_WRITE_ENABLED = 'true';
    process.env.MOBILE_UIUX_SETTINGS_WRITE_ENABLED = 'true';
    const requestBody = {
      clinic_id: clinicId,
      category: 'services_pricing',
      settings: { menus: [] },
    };
    const { client, table } = createSettingsWriteClient({});
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'manager@example.com', role: 'manager' },
      permissions: {
        role: 'manager',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: client,
      body: requestBody,
    });
    const { PUT } = await import('@/app/api/mobile-uiux/settings/route');

    const response = await PUT(
      new NextRequest('http://localhost/api/mobile-uiux/settings', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(response.status).toBe(403);
    expect(table.upsert).not.toHaveBeenCalled();
  });

  it('returns 403 when the requested clinic is outside the authenticated scope', async () => {
    process.env.MOBILE_UIUX_WRITE_ENABLED = 'true';
    process.env.MOBILE_UIUX_SETTINGS_WRITE_ENABLED = 'true';
    const requestBody = {
      clinic_id: '123e4567-e89b-12d3-a456-426614174999',
      category: 'clinic_hours',
      settings: { holidays: [] },
    };
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: { status: 403 },
    });
    const { PUT } = await import('@/app/api/mobile-uiux/settings/route');

    const response = await PUT(
      new NextRequest('http://localhost/api/mobile-uiux/settings', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(response.status).toBe(403);
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/mobile-uiux/settings-detail', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'true',
      MOBILE_UIUX_REAL_DATA_ENABLED: 'true',
      MOBILE_UIUX_SETTINGS_WRITE_ENABLED: 'false',
      MOBILE_UIUX_ALLOWED_CLINIC_IDS: clinicId,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('loads clinic, menus, and resources through clinic-scoped PC tables only', async () => {
    const { client, clinicsQuery, menusQuery, resourcesQuery } =
      createSettingsDetailClient();
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions: {
        role: 'staff',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      supabase: client,
    });

    const { GET } = await import('@/app/api/mobile-uiux/settings-detail/route');
    const request = buildSettingsDetailRequest(`?clinic_id=${clinicId}`);
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      allowedRoles: ['admin', 'clinic_admin', 'manager', 'therapist', 'staff'],
      clinicId,
      requireClinicMatch: true,
    });
    expect(client.from).toHaveBeenCalledWith('clinics');
    expect(client.from).toHaveBeenCalledWith('menus');
    expect(client.from).toHaveBeenCalledWith('resources');
    expect(clinicsQuery.eq).toHaveBeenCalledWith('id', clinicId);
    expect(menusQuery.eq).toHaveBeenCalledWith('clinic_id', clinicId);
    expect(resourcesQuery.eq).toHaveBeenCalledWith('clinic_id', clinicId);
    expect(payload.data).toMatchObject({
      clinicId,
      clinic: {
        id: clinicId,
        name: '中央整骨院',
      },
      menus: [
        {
          id: menuId,
          clinicId,
          name: '整体',
          durationMinutes: 30,
          price: 5000,
        },
      ],
      resources: [
        {
          id: resourceId,
          name: '施術ベッド1',
          type: 'room',
          workingHours: {},
          supportedMenus: [],
          maxConcurrent: 1,
        },
      ],
    });
  });
});
