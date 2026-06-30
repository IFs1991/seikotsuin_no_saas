import { NextRequest } from 'next/server';

import { processApiRequest } from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
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

const processApiRequestMock = jest.mocked(processApiRequest);
const logAdminActionMock = jest.mocked(AuditLogger.logAdminAction);

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const userId = '123e4567-e89b-12d3-a456-426614174010';

const auth = { id: userId, email: 'manager@example.com', role: 'manager' };
const permissions = {
  role: 'manager',
  clinic_id: clinicId,
  clinic_scope_ids: [clinicId],
};

const clinicHoursPayload = {
  clinic_id: clinicId,
  category: 'clinic_hours',
  settings: {
    hoursByDay: {
      monday: {
        open: '09:00',
        close: '18:00',
      },
    },
    holidays: ['2026-07-20'],
    specialClosures: [],
  },
};

type QueryResult<T> = Promise<{ data: T; error: null }>;

type SelectBuilder<T> = {
  eq: jest.MockedFunction<(field: string, value: unknown) => SelectBuilder<T>>;
  single: jest.MockedFunction<() => QueryResult<T>>;
};

function createSelectBuilder<T>(data: T): SelectBuilder<T> {
  let builder: SelectBuilder<T>;
  const eq: SelectBuilder<T>['eq'] = jest.fn(() => builder);
  const single: SelectBuilder<T>['single'] = jest.fn(async () => ({
    data,
    error: null,
  }));
  builder = {
    eq,
    single,
  };
  return builder;
}

function createSettingsClient(readData: Record<string, unknown>) {
  const selectBuilder = createSelectBuilder({
    settings: readData,
    updated_at: '2026-07-01T09:00:00.000Z',
    updated_by: userId,
  });
  const table = {
    upsert: jest.fn(async () => ({ error: null })),
    select: jest.fn(() => selectBuilder),
  };
  const client = {
    from: jest.fn((tableName: string) => {
      if (tableName !== 'clinic_settings') {
        throw new Error(`Unexpected table: ${tableName}`);
      }
      return table;
    }),
  };

  return { client, table, selectBuilder };
}

function buildMutationRequest(payload: unknown) {
  return new NextRequest('http://localhost/api/mobile-uiux/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
    headers: {
      'content-type': 'application/json',
    },
  });
}

describe('PUT /api/mobile-uiux/settings write pilot', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MOBILE_UIUX_ENABLED: 'true',
      MOBILE_UIUX_REAL_DATA_ENABLED: 'true',
      MOBILE_UIUX_WRITE_ENABLED: 'true',
      MOBILE_UIUX_SETTINGS_WRITE_ENABLED: 'true',
      MOBILE_UIUX_ALLOWED_CLINIC_IDS: clinicId,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns 403 when the global write flag is off', async () => {
    process.env.MOBILE_UIUX_WRITE_ENABLED = 'false';
    const { PUT } = await import('@/app/api/mobile-uiux/settings/route');

    const response = await PUT(buildMutationRequest(clinicHoursPayload));

    expect(response.status).toBe(403);
    expect(processApiRequestMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the settings write flag is off', async () => {
    process.env.MOBILE_UIUX_SETTINGS_WRITE_ENABLED = 'false';
    const { PUT } = await import('@/app/api/mobile-uiux/settings/route');

    const response = await PUT(buildMutationRequest(clinicHoursPayload));

    expect(response.status).toBe(403);
    expect(processApiRequestMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid category', async () => {
    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      auth,
      permissions,
      supabase: createSettingsClient({}).client,
      body: {
        ...clinicHoursPayload,
        category: 'invalid_category',
      },
    });
    const { PUT } = await import('@/app/api/mobile-uiux/settings/route');

    const response = await PUT(
      buildMutationRequest({
        ...clinicHoursPayload,
        category: 'invalid_category',
      })
    );

    expect(response.status).toBe(400);
  });

  it('returns 403 when the PC read helper denies the category', async () => {
    const { client, table } = createSettingsClient({});
    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      auth,
      permissions,
      supabase: client,
      body: {
        clinic_id: clinicId,
        category: 'system_security',
        settings: {
          twoFactorEnabled: true,
        },
      },
    });
    const { PUT } = await import('@/app/api/mobile-uiux/settings/route');

    const response = await PUT(
      buildMutationRequest({
        clinic_id: clinicId,
        category: 'system_security',
        settings: {
          twoFactorEnabled: true,
        },
      })
    );

    expect(response.status).toBe(403);
    expect(table.upsert).not.toHaveBeenCalled();
  });

  it('returns 403 when the category is not released for the first mobile rollout', async () => {
    const { client, table } = createSettingsClient({});
    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      auth,
      permissions,
      supabase: client,
      body: {
        clinic_id: clinicId,
        category: 'services_pricing',
        settings: {
          menus: [],
        },
      },
    });
    const { PUT } = await import('@/app/api/mobile-uiux/settings/route');

    const response = await PUT(
      buildMutationRequest({
        clinic_id: clinicId,
        category: 'services_pricing',
        settings: {
          menus: [],
        },
      })
    );

    expect(response.status).toBe(403);
    expect(table.upsert).not.toHaveBeenCalled();
  });

  it('redacts communication secrets from persistence, response, and audit details', async () => {
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
    const { client, table } = createSettingsClient(readSettings);
    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      auth,
      permissions,
      supabase: client,
      body: {
        clinic_id: clinicId,
        category: 'communication',
        settings: {
          emailEnabled: true,
          smtpSettings: {
            host: 'smtp.example.com',
            port: 587,
            user: 'mail-user',
            password: 'smtp-password-secret',
            apiKey: 'api-key-secret',
            webhookSecret: 'webhook-secret',
            token: 'token-secret',
            credential: 'credential-secret',
          },
          templates: [],
        },
      },
    });
    const { PUT } = await import('@/app/api/mobile-uiux/settings/route');

    const response = await PUT(
      buildMutationRequest({
        clinic_id: clinicId,
        category: 'communication',
        settings: {
          emailEnabled: true,
          smtpSettings: {
            host: 'smtp.example.com',
            port: 587,
            user: 'mail-user',
            password: 'smtp-password-secret',
            apiKey: 'api-key-secret',
            webhookSecret: 'webhook-secret',
            token: 'token-secret',
            credential: 'credential-secret',
          },
          templates: [],
        },
      })
    );
    const payload = await response.json();
    const responseText = JSON.stringify(payload);
    const upsertText = JSON.stringify(table.upsert.mock.calls);
    const auditText = JSON.stringify(logAdminActionMock.mock.calls);

    expect(response.status).toBe(200);
    expect(upsertText).not.toContain('smtp-password-secret');
    expect(upsertText).not.toContain('api-key-secret');
    expect(upsertText).not.toContain('webhook-secret');
    expect(upsertText).not.toContain('token-secret');
    expect(upsertText).not.toContain('credential-secret');
    expect(responseText).not.toContain('smtp-password-secret');
    expect(responseText).not.toContain('api-key-secret');
    expect(responseText).not.toContain('webhook-secret');
    expect(responseText).not.toContain('token-secret');
    expect(responseText).not.toContain('credential-secret');
    expect(auditText).not.toContain('smtp-password-secret');
    expect(auditText).not.toContain('api-key-secret');
    expect(auditText).not.toContain('webhook-secret');
    expect(auditText).not.toContain('token-secret');
    expect(auditText).not.toContain('credential-secret');
  });

  it('upserts settings, invokes audit log, and verifies the same settings through the PC read path', async () => {
    const { client, table, selectBuilder } = createSettingsClient(
      clinicHoursPayload.settings
    );
    processApiRequestMock.mockResolvedValueOnce({
      success: true,
      auth,
      permissions,
      supabase: client,
      body: clinicHoursPayload,
    });
    const { PUT } = await import('@/app/api/mobile-uiux/settings/route');
    const request = buildMutationRequest(clinicHoursPayload);

    const response = await PUT(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      requireBody: true,
      allowedRoles: ['admin', 'clinic_admin', 'manager'],
      clinicId,
    });
    expect(table.upsert).toHaveBeenCalledWith(
      {
        clinic_id: clinicId,
        category: 'clinic_hours',
        settings: clinicHoursPayload.settings,
        updated_by: userId,
      },
      { onConflict: 'clinic_id,category' }
    );
    expect(selectBuilder.eq).toHaveBeenCalledWith('clinic_id', clinicId);
    expect(selectBuilder.eq).toHaveBeenCalledWith('category', 'clinic_hours');
    expect(logAdminActionMock).toHaveBeenCalledWith(
      userId,
      'manager@example.com',
      'manager_settings_update',
      undefined,
      {
        actor_role: 'manager',
        category: 'clinic_hours',
        clinic_id: clinicId,
        settingsUpdated: true,
      }
    );
    expect(payload).toMatchObject({
      success: true,
      data: {
        clinicId,
        category: 'clinic_hours',
        settings: clinicHoursPayload.settings,
      },
    });
  });
});
