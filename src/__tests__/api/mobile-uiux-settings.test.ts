import { NextRequest } from 'next/server';

import { processApiRequest } from '@/lib/api-helpers';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
  };
});

const processApiRequestMock = jest.mocked(processApiRequest);

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
