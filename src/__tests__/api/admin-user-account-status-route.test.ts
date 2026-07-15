import { NextRequest } from 'next/server';
import { AuditLogger } from '@/lib/audit-logger';
import { createAdminClient } from '@/lib/supabase';
import { logError, processApiRequest } from '@/lib/api-helpers';
import { ERROR_CODES } from '@/lib/error-handler';

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

jest.mock('@/lib/supabase', () => {
  const actual = jest.requireActual('@/lib/supabase');
  return {
    ...actual,
    createAdminClient: jest.fn(),
  };
});

const processApiRequestMock = jest.mocked(processApiRequest);
const createAdminClientMock = jest.mocked(createAdminClient);
const logErrorMock = jest.mocked(logError);
const logAdminActionMock = jest.mocked(AuditLogger.logAdminAction);

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const CLINIC_ID = '33333333-3333-4333-8333-333333333333';

type ProfileStatus = {
  user_id: string;
  is_active: boolean;
  clinic_id?: string;
};

type QueryResult = {
  data: ProfileStatus | null;
  error: { message: string } | null;
};

type ProfileQueryMock = {
  select: jest.Mock;
  update: jest.Mock;
  eq: jest.Mock;
  maybeSingle: jest.Mock;
};

type AdminClientMock = {
  auth: {
    admin: {
      updateUserById: jest.Mock;
    };
  };
  from: jest.Mock;
};

function createRequest(body: unknown) {
  return new NextRequest('http://localhost/api/admin/users/accounts', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function createAdminProcessResult(body: unknown) {
  return {
    success: true as const,
    auth: {
      id: ADMIN_ID,
      email: 'admin@example.com',
      role: 'admin',
    },
    permissions: {
      role: 'admin',
      clinic_id: CLINIC_ID,
      clinic_scope_ids: [CLINIC_ID],
    },
    supabase: {},
    body,
  };
}

function createAdminClientMockValue({
  queryResults,
  authErrors = [],
}: {
  queryResults: QueryResult[];
  authErrors?: Array<{ message: string } | null>;
}) {
  const profileQuery: ProfileQueryMock = {
    select: jest.fn(),
    update: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(),
  };
  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.update.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);
  for (const queryResult of queryResults) {
    profileQuery.maybeSingle.mockResolvedValueOnce(queryResult);
  }

  const updateUserById = jest.fn();
  const effectiveAuthErrors = authErrors.length > 0 ? authErrors : [null];
  for (const error of effectiveAuthErrors) {
    updateUserById.mockResolvedValueOnce({ data: null, error });
  }

  const adminClient: AdminClientMock = {
    auth: {
      admin: {
        updateUserById,
      },
    },
    from: jest.fn((table: string) => {
      if (table === 'profiles') {
        return profileQuery;
      }
      if (table === 'user_permissions') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { role: 'staff', clinic_id: CLINIC_ID },
            error: null,
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { adminClient, profileQuery, updateUserById };
}

describe('PATCH /api/admin/users/accounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    logAdminActionMock.mockResolvedValue(undefined);
  });

  it('deactivates the profile before applying the Supabase Auth ban', async () => {
    const body = { user_id: TARGET_ID, is_active: false };
    processApiRequestMock.mockResolvedValue(createAdminProcessResult(body));
    const { adminClient, profileQuery, updateUserById } =
      createAdminClientMockValue({
        queryResults: [
          {
            data: {
              user_id: TARGET_ID,
              is_active: true,
              clinic_id: CLINIC_ID,
            },
            error: null,
          },
          {
            data: {
              user_id: TARGET_ID,
              is_active: false,
              clinic_id: CLINIC_ID,
            },
            error: null,
          },
        ],
      });
    createAdminClientMock.mockReturnValue(adminClient);

    const { PATCH } = await import('@/app/api/admin/users/accounts/route');
    const response = await PATCH(createRequest(body));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(profileQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false })
    );
    expect(updateUserById).toHaveBeenCalledWith(TARGET_ID, {
      ban_duration: '876000h',
    });
    expect(profileQuery.update.mock.invocationCallOrder[0]).toBeLessThan(
      updateUserById.mock.invocationCallOrder[0]
    );
    expect(payload.data).toEqual({
      user_id: TARGET_ID,
      is_active: false,
      auth_ban_applied: true,
    });
    expect(logAdminActionMock).toHaveBeenCalledWith(
      ADMIN_ID,
      'admin@example.com',
      'account_deactivate',
      TARGET_ID,
      {
        user_id: TARGET_ID,
        previous_is_active: true,
        is_active: false,
      }
    );
  });

  it('unbans Supabase Auth before reactivating the profile', async () => {
    const body = { user_id: TARGET_ID, is_active: true };
    processApiRequestMock.mockResolvedValue(createAdminProcessResult(body));
    const { adminClient, profileQuery, updateUserById } =
      createAdminClientMockValue({
        queryResults: [
          {
            data: {
              user_id: TARGET_ID,
              is_active: false,
              clinic_id: CLINIC_ID,
            },
            error: null,
          },
          { data: { user_id: TARGET_ID, is_active: true }, error: null },
        ],
      });
    createAdminClientMock.mockReturnValue(adminClient);

    const { PATCH } = await import('@/app/api/admin/users/accounts/route');
    const response = await PATCH(createRequest(body));

    expect(response.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith(TARGET_ID, {
      ban_duration: 'none',
    });
    expect(updateUserById.mock.invocationCallOrder[0]).toBeLessThan(
      profileQuery.update.mock.invocationCallOrder[0]
    );
    expect(logAdminActionMock).toHaveBeenCalledWith(
      ADMIN_ID,
      'admin@example.com',
      'account_reactivate',
      TARGET_ID,
      expect.objectContaining({ is_active: true })
    );
  });

  it('keeps the profile inactive when the Supabase Auth ban fails', async () => {
    const body = { user_id: TARGET_ID, is_active: false };
    processApiRequestMock.mockResolvedValue(createAdminProcessResult(body));
    const { adminClient } = createAdminClientMockValue({
      queryResults: [
        {
          data: {
            user_id: TARGET_ID,
            is_active: true,
            clinic_id: CLINIC_ID,
          },
          error: null,
        },
        {
          data: {
            user_id: TARGET_ID,
            is_active: false,
            clinic_id: CLINIC_ID,
          },
          error: null,
        },
      ],
      authErrors: [{ message: 'auth unavailable' }],
    });
    createAdminClientMock.mockReturnValue(adminClient);

    const { PATCH } = await import('@/app/api/admin/users/accounts/route');
    const response = await PATCH(createRequest(body));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.code).toBe(ERROR_CODES.EXTERNAL_SERVICE_ERROR);
    expect(logAdminActionMock).not.toHaveBeenCalled();
    expect(logErrorMock).toHaveBeenCalledWith(
      { message: 'auth unavailable' },
      expect.objectContaining({
        params: expect.objectContaining({ profile_is_active: false }),
      })
    );
  });

  it('re-bans Auth when profile reactivation fails', async () => {
    const body = { user_id: TARGET_ID, is_active: true };
    processApiRequestMock.mockResolvedValue(createAdminProcessResult(body));
    const { adminClient, updateUserById } = createAdminClientMockValue({
      queryResults: [
        {
          data: {
            user_id: TARGET_ID,
            is_active: false,
            clinic_id: CLINIC_ID,
          },
          error: null,
        },
        { data: null, error: { message: 'profile write failed' } },
      ],
      authErrors: [null, null],
    });
    createAdminClientMock.mockReturnValue(adminClient);

    const { PATCH } = await import('@/app/api/admin/users/accounts/route');
    const response = await PATCH(createRequest(body));

    expect(response.status).toBe(500);
    expect(updateUserById).toHaveBeenNthCalledWith(1, TARGET_ID, {
      ban_duration: 'none',
    });
    expect(updateUserById).toHaveBeenNthCalledWith(2, TARGET_ID, {
      ban_duration: '876000h',
    });
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });

  it('rejects self-deactivation before creating the service-role client', async () => {
    const body = { user_id: ADMIN_ID, is_active: false };
    processApiRequestMock.mockResolvedValue(createAdminProcessResult(body));

    const { PATCH } = await import('@/app/api/admin/users/accounts/route');
    const response = await PATCH(createRequest(body));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('rejects an account whose clinic authority extends outside the actor scope', async () => {
    const body = { user_id: TARGET_ID, is_active: false };
    processApiRequestMock.mockResolvedValue(createAdminProcessResult(body));
    const { adminClient, updateUserById } = createAdminClientMockValue({
      queryResults: [
        {
          data: {
            user_id: TARGET_ID,
            is_active: true,
            clinic_id: '44444444-4444-4444-8444-444444444444',
          },
          error: null,
        },
      ],
    });
    createAdminClientMock.mockReturnValue(adminClient);

    const { PATCH } = await import('@/app/api/admin/users/accounts/route');
    const response = await PATCH(createRequest(body));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('対象クリニックへのアクセス権がありません');
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
