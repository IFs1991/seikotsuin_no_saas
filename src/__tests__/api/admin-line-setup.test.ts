import { NextRequest } from 'next/server';

import { createErrorResponse, processApiRequest } from '@/lib/api-helpers';
import {
  completeVerifiedLineSetup,
  getLineSetupState,
  prepareLineSetup,
  revokeLineSetup,
  updateLineFeatureSettings,
  verifyPreparedLineSetup,
} from '@/lib/line/setup-admin-service';
import {
  createScopedAdminContext,
  ScopeAccessError,
} from '@/lib/supabase/scoped-admin';

jest.mock('@/lib/api-helpers', () => {
  const actual =
    jest.requireActual<typeof import('@/lib/api-helpers')>('@/lib/api-helpers');
  return { ...actual, logError: jest.fn(), processApiRequest: jest.fn() };
});
jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: { logAdminAction: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/lib/supabase/scoped-admin', () => {
  const actual = jest.requireActual<
    typeof import('@/lib/supabase/scoped-admin')
  >('@/lib/supabase/scoped-admin');
  return { ...actual, createScopedAdminContext: jest.fn() };
});
jest.mock('@/lib/line/setup-admin-service', () => {
  const actual = jest.requireActual<
    typeof import('@/lib/line/setup-admin-service')
  >('@/lib/line/setup-admin-service');
  return {
    ...actual,
    completeVerifiedLineSetup: jest.fn(),
    getLineSetupState: jest.fn(),
    prepareLineSetup: jest.fn(),
    revokeLineSetup: jest.fn(),
    updateLineFeatureSettings: jest.fn(),
    verifyPreparedLineSetup: jest.fn(),
  };
});

const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const processMock = jest.mocked(processApiRequest);
const contextMock = jest.mocked(createScopedAdminContext);
const getStateMock = jest.mocked(getLineSetupState);
const prepareMock = jest.mocked(prepareLineSetup);
const revokeMock = jest.mocked(revokeLineSetup);
const verifyMock = jest.mocked(verifyPreparedLineSetup);
const completeMock = jest.mocked(completeVerifiedLineSetup);
const updateFeaturesMock = jest.mocked(updateLineFeatureSettings);

const setupState = {
  credentials: null,
  encryption_ready: true,
  features: {
    line_booking_enabled: false,
    line_chat_enabled: false,
    line_notification_enabled: false,
  },
  setup: null,
};

function mockAuth(body?: unknown) {
  processMock.mockResolvedValue({
    auth: { email: 'clinic@example.test', id: USER_ID, role: 'clinic_admin' },
    body,
    permissions: {
      clinic_id: CLINIC_ID,
      clinic_scope_ids: [CLINIC_ID],
      role: 'clinic_admin',
    },
    success: true,
    supabase: {},
  });
  contextMock.mockReturnValue({
    assertClinicInScope: jest.fn(),
    client: {},
    scopedClinicIds: [CLINIC_ID],
  });
}

function request(path: string, method = 'GET') {
  return new NextRequest(`http://localhost${path}`, {
    headers: { origin: 'http://localhost' },
    method,
  });
}

describe('clinic-scoped LINE setup APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the scoped clinic setup state', async () => {
    mockAuth();
    getStateMock.mockResolvedValue(setupState);
    const { GET } = await import('@/app/api/admin/line-setup/route');
    const response = await GET(
      request(`/api/admin/line-setup?clinic_id=${CLINIC_ID}`)
    );

    expect(response.status).toBe(200);
    expect(getStateMock).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: CLINIC_ID })
    );
  });

  it('prepares a setup session only after scope validation', async () => {
    mockAuth({ clinic_id: CLINIC_ID });
    prepareMock.mockResolvedValue(setupState);
    const { POST } = await import('@/app/api/admin/line-setup/route');
    const response = await POST(request('/api/admin/line-setup', 'POST'));

    expect(response.status).toBe(201);
    expect(prepareMock).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: CLINIC_ID, userId: USER_ID })
    );
  });

  it('validates the provider-bound verification input', async () => {
    mockAuth({
      app_endpoint_id: 'endpoint',
      app_type: 'mini_app',
      channel_secret: 'secret',
      clinic_id: CLINIC_ID,
      liff_id: '2000000000-AbCdEfGh',
      login_channel_id: 'login',
      messaging_channel_id: 'messaging',
      provider_configuration_confirmed: true,
      public_key_kid: 'kid',
      setup_session_id: SESSION_ID,
      test_id_token: null,
      test_line_user_id: null,
    });
    verifyMock.mockResolvedValue({ pushTestSent: false, state: setupState });
    const { POST } = await import('@/app/api/admin/line-setup/verify/route');
    const response = await POST(
      request('/api/admin/line-setup/verify', 'POST')
    );

    expect(response.status).toBe(200);
    expect(verifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: CLINIC_ID,
        setupSessionId: SESSION_ID,
      })
    );
    expect(await response.text()).not.toContain('secret');
  });

  it('requires an execution LIFF ID for the recommended MINI App flow', async () => {
    mockAuth({
      app_endpoint_id: 'endpoint',
      app_type: 'mini_app',
      channel_secret: 'secret',
      clinic_id: CLINIC_ID,
      liff_id: null,
      login_channel_id: 'login',
      messaging_channel_id: 'messaging',
      provider_configuration_confirmed: true,
      public_key_kid: 'kid',
      setup_session_id: SESSION_ID,
      test_id_token: null,
      test_line_user_id: null,
    });
    const { POST } = await import('@/app/api/admin/line-setup/verify/route');
    const response = await POST(
      request('/api/admin/line-setup/verify', 'POST')
    );

    expect(response.status).toBe(400);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('completes setup with explicit feature choices', async () => {
    mockAuth({
      clinic_id: CLINIC_ID,
      enable_booking: true,
      enable_notifications: false,
      setup_session_id: SESSION_ID,
    });
    completeMock.mockResolvedValue(setupState);
    const { POST } = await import('@/app/api/admin/line-setup/complete/route');
    const response = await POST(
      request('/api/admin/line-setup/complete', 'POST')
    );

    expect(response.status).toBe(200);
    expect(completeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enableBooking: true,
        enableNotifications: false,
      })
    );
  });

  it('does not enter setup services when authentication rejects the role', async () => {
    processMock.mockResolvedValue({
      error: createErrorResponse('この操作を実行する権限がありません', 403),
      success: false,
    });
    const { POST } = await import('@/app/api/admin/line-setup/route');
    const response = await POST(request('/api/admin/line-setup', 'POST'));

    expect(response.status).toBe(403);
    expect(contextMock).not.toHaveBeenCalled();
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it('uses the admin, clinic_admin, and manager role boundary', async () => {
    mockAuth();
    getStateMock.mockResolvedValue(setupState);
    const { GET } = await import('@/app/api/admin/line-setup/route');
    await GET(request(`/api/admin/line-setup?clinic_id=${CLINIC_ID}`));

    expect(processMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        allowedRoles: expect.arrayContaining([
          'admin',
          'clinic_admin',
          'manager',
        ]),
      })
    );
    const options = processMock.mock.calls[0]?.[1];
    expect(options?.allowedRoles).not.toContain('staff');
    expect(options?.allowedRoles).not.toContain('therapist');
  });

  it('rejects another clinic before calling the setup service', async () => {
    mockAuth({ clinic_id: CLINIC_ID });
    contextMock.mockReturnValue({
      assertClinicInScope: jest.fn(() => {
        throw new ScopeAccessError();
      }),
      client: {},
      scopedClinicIds: [CLINIC_ID],
    });
    const { POST } = await import('@/app/api/admin/line-setup/route');
    const response = await POST(request('/api/admin/line-setup', 'POST'));

    expect(response.status).toBe(403);
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it('updates clinic feature choices through the verified DB contract', async () => {
    mockAuth({
      clinic_id: CLINIC_ID,
      enable_booking: false,
      enable_notifications: true,
    });
    updateFeaturesMock.mockResolvedValue(setupState);
    const { PATCH } = await import('@/app/api/admin/line-setup/route');
    const response = await PATCH(request('/api/admin/line-setup', 'PATCH'));

    expect(response.status).toBe(200);
    expect(updateFeaturesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: CLINIC_ID,
        enableBooking: false,
        enableNotifications: true,
      })
    );
  });

  it('revokes a scoped setup session so verification can restart safely', async () => {
    mockAuth({ clinic_id: CLINIC_ID, setup_session_id: SESSION_ID });
    revokeMock.mockResolvedValue(setupState);
    const { DELETE } = await import('@/app/api/admin/line-setup/route');
    const response = await DELETE(request('/api/admin/line-setup', 'DELETE'));

    expect(response.status).toBe(200);
    expect(revokeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: CLINIC_ID,
        setupSessionId: SESSION_ID,
      })
    );
  });

  it('maps unverified webhook chat activation to a conflict', async () => {
    mockAuth({
      auto_reply_enabled: true,
      auto_reply_message: '受付しました',
      clinic_id: CLINIC_ID,
      line_chat_enabled: true,
      retention_days: 90,
    });
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'LINE_CHAT_WEBHOOK_NOT_VERIFIED' },
    });
    contextMock.mockReturnValue({
      assertClinicInScope: jest.fn(),
      client: { rpc },
      scopedClinicIds: [CLINIC_ID],
    });
    const { PATCH } = await import('@/app/api/admin/line-chat/settings/route');
    const response = await PATCH(
      request('/api/admin/line-chat/settings', 'PATCH')
    );

    expect(response.status).toBe(409);
    expect(rpc).toHaveBeenCalledWith(
      'update_line_chat_settings',
      expect.objectContaining({ p_clinic_id: CLINIC_ID })
    );
  });
});
