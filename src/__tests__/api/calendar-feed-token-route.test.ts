import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { resolveManagerAssignedClinicsWithinScope } from '@/lib/auth/manager-scope';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
import { createAdminClient } from '@/lib/supabase';

jest.mock('@/lib/api-helpers', () => ({
  createErrorResponse: (error: string, status = 500) =>
    Response.json({ success: false, error }, { status }),
  createSuccessResponse: <T>(data: T, status = 200) =>
    Response.json({ success: true, data }, { status }),
  logError: jest.fn(),
  processApiRequest: jest.fn(),
}));

jest.mock('@/lib/auth/manager-scope', () => ({
  resolveManagerAssignedClinicsWithinScope: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: jest.fn(),
}));

const processApiRequestMock = jest.mocked(processApiRequest);
const resolveManagerAssignedClinicsWithinScopeMock = jest.mocked(
  resolveManagerAssignedClinicsWithinScope
);
const createAdminClientMock = jest.mocked(createAdminClient);

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';
const staffProfileA = '33333333-3333-4333-8333-333333333333';

type TokenInsertPayload = {
  clinic_id: string | null;
  staff_profile_id: string | null;
  feed_type: 'staff' | 'clinic';
  token_hash: string;
  label: string | null;
  created_by: string;
};

class CalendarFeedTokenQueryMock {
  inserted: TokenInsertPayload | null = null;

  insert(payload: TokenInsertPayload) {
    this.inserted = payload;
    return this;
  }

  select() {
    return this;
  }

  single<T>() {
    return Promise.resolve({
      data: {
        id: 'token-row',
        clinic_id: this.inserted?.clinic_id ?? null,
        staff_profile_id: this.inserted?.staff_profile_id ?? null,
        feed_type: this.inserted?.feed_type ?? 'clinic',
        token_hash: this.inserted?.token_hash ?? 'hash',
        label: this.inserted?.label ?? null,
        is_active: true,
        created_by: this.inserted?.created_by ?? 'manager-user',
        created_at: '2026-06-26T00:00:00.000Z',
        revoked_at: null,
      } as T,
      error: null,
    });
  }
}

class StaffProfileQueryMock {
  private row: {
    id: string;
    user_id: string | null;
    is_active: boolean | null;
  } | null;

  constructor(
    row: {
      id: string;
      user_id: string | null;
      is_active: boolean | null;
    } | null
  ) {
    this.row = row;
  }

  select() {
    return this;
  }

  eq(column: string, value: string) {
    if (column === 'id' && this.row?.id !== value) {
      this.row = null;
    }
    return this;
  }

  maybeSingle<T>() {
    return Promise.resolve({
      data: this.row as T | null,
      error: null,
    });
  }
}

class StaffMembershipQueryMock {
  private rows: Array<{
    staff_profile_id: string;
    clinic_id: string;
    membership_type: string;
  }>;

  constructor(
    rows: ReadonlyArray<{
      staff_profile_id: string;
      clinic_id: string;
      membership_type: string;
    }>
  ) {
    this.rows = [...rows];
  }

  select() {
    return this;
  }

  eq(column: string, value: string) {
    if (column === 'staff_profile_id') {
      this.rows = this.rows.filter(row => row.staff_profile_id === value);
    }
    return this;
  }

  neq(column: string, value: string) {
    if (column === 'membership_type') {
      this.rows = this.rows.filter(row => row.membership_type !== value);
    }
    return this;
  }

  returns<T>() {
    return Promise.resolve({
      data: this.rows as T,
      error: null,
    });
  }
}

function mockAuth() {
  processApiRequestMock.mockResolvedValue({
    success: true,
    auth: {
      id: 'manager-user',
      email: 'manager@example.com',
      role: 'manager',
    },
    permissions: {
      role: 'manager',
      clinic_id: null,
      clinic_scope_ids: [clinicA],
    },
    supabase: { from: jest.fn() },
  });
}

async function postToken(body: object) {
  const { POST } = await import('@/app/api/calendar/feed-tokens/route');
  return await POST(
    new NextRequest('http://localhost/api/calendar/feed-tokens', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

async function deleteToken(tokenId: string) {
  const { DELETE } = await import('@/app/api/calendar/feed-tokens/route');
  return await DELETE(
    new NextRequest(
      `http://localhost/api/calendar/feed-tokens?token_id=${tokenId}`,
      { method: 'DELETE' }
    )
  );
}

describe('POST /api/calendar/feed-tokens', () => {
  let tokenQuery: CalendarFeedTokenQueryMock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth();
    tokenQuery = new CalendarFeedTokenQueryMock();
    resolveManagerAssignedClinicsWithinScopeMock.mockResolvedValue([
      {
        id: 'assignment-a',
        manager_user_id: 'manager-user',
        clinic_id: clinicA,
        clinic_name: '池袋院',
        assigned_at: '2026-06-01T00:00:00.000Z',
        revoked_at: null,
      },
    ]);
    createAdminClientMock.mockReturnValue({
      from: (table: string) => {
        if (table === 'calendar_feed_tokens') {
          return tokenQuery;
        }
        if (table === 'staff_profiles') {
          return new StaffProfileQueryMock({
            id: staffProfileA,
            user_id: 'staff-user',
            is_active: true,
          });
        }
        if (table === 'staff_clinic_memberships') {
          return new StaffMembershipQueryMock([
            {
              staff_profile_id: staffProfileA,
              clinic_id: clinicA,
              membership_type: 'home',
            },
          ]);
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    });
  });

  it('issues a clinic feed token and stores only the hash', async () => {
    const response = await postToken({
      feed_type: 'clinic',
      clinic_id: clinicA,
      label: '池袋院ロスター',
    });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.token).toEqual(expect.any(String));
    expect(tokenQuery.inserted?.token_hash).toEqual(expect.any(String));
    expect(tokenQuery.inserted?.token_hash).not.toBe(json.data.token);
    expect(tokenQuery.inserted).toMatchObject({
      clinic_id: clinicA,
      staff_profile_id: null,
      feed_type: 'clinic',
      label: '池袋院ロスター',
    });
    expect(resolveManagerAssignedClinicsWithinScopeMock).toHaveBeenCalledWith(
      expect.any(Object),
      'manager-user',
      [clinicA]
    );
  });

  it('rejects an admin clinic feed outside canonical scope before creating a service client', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'admin-user',
        email: 'admin@example.com',
        role: 'admin',
      },
      permissions: {
        role: 'admin',
        clinic_id: clinicA,
        clinic_scope_ids: [clinicA],
      },
      supabase: { from: jest.fn() },
    });

    const response = await postToken({
      feed_type: 'clinic',
      clinic_id: clinicB,
    });

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(tokenQuery.inserted).toBeNull();
  });

  it.each(['therapist', 'staff'] as const)(
    'denies a %s clinic feed before creating a service client',
    async role => {
      processApiRequestMock.mockResolvedValue({
        success: true,
        auth: {
          id: `${role}-user`,
          email: `${role}@example.com`,
          role,
        },
        permissions: {
          role,
          clinic_id: clinicA,
          clinic_scope_ids: [clinicA],
        },
        supabase: { from: jest.fn() },
      });

      const response = await postToken({
        feed_type: 'clinic',
        clinic_id: clinicA,
      });

      expect(response.status).toBe(403);
      expect(createAdminClientMock).not.toHaveBeenCalled();
      expect(tokenQuery.inserted).toBeNull();
    }
  );

  it('requires clinic_id for staff feed tokens', async () => {
    const response = await postToken({
      feed_type: 'staff',
      staff_profile_id: staffProfileA,
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(tokenQuery.inserted).toBeNull();
  });

  it('issues staff feed tokens scoped to the requested clinic', async () => {
    const response = await postToken({
      feed_type: 'staff',
      staff_profile_id: staffProfileA,
      clinic_id: clinicA,
      label: '池袋院 個人シフト',
    });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(tokenQuery.inserted).toMatchObject({
      clinic_id: clinicA,
      staff_profile_id: staffProfileA,
      feed_type: 'staff',
      label: '池袋院 個人シフト',
    });
    expect(json.data.clinic_id).toBe(clinicA);
  });

  it('allows a therapist to issue only their own staff feed', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'staff-user',
        email: 'therapist@example.com',
        role: 'therapist',
      },
      permissions: {
        role: 'therapist',
        clinic_id: clinicA,
        clinic_scope_ids: [clinicA],
      },
      supabase: { from: jest.fn() },
    });

    const response = await postToken({
      feed_type: 'staff',
      staff_profile_id: staffProfileA,
      clinic_id: clinicA,
    });

    expect(response.status).toBe(201);
    expect(tokenQuery.inserted).toMatchObject({
      clinic_id: clinicA,
      staff_profile_id: staffProfileA,
      feed_type: 'staff',
      created_by: 'staff-user',
    });
  });

  it.each(['therapist', 'staff', 'clinic_admin'] as const)(
    'denies a %s feed for a different staff profile',
    async role => {
      processApiRequestMock.mockResolvedValue({
        success: true,
        auth: {
          id: `${role}-other-user`,
          email: `${role}@example.com`,
          role,
        },
        permissions: {
          role,
          clinic_id: clinicA,
          clinic_scope_ids: [clinicA],
        },
        supabase: { from: jest.fn() },
      });

      const response = await postToken({
        feed_type: 'staff',
        staff_profile_id: staffProfileA,
        clinic_id: clinicA,
      });

      expect(response.status).toBe(403);
      expect(tokenQuery.inserted).toBeNull();
    }
  );

  it('fails closed when the target staff active state is unknown', async () => {
    createAdminClientMock.mockReturnValue({
      from: (table: string) => {
        if (table === 'staff_profiles') {
          return new StaffProfileQueryMock({
            id: staffProfileA,
            user_id: 'staff-user',
            is_active: null,
          });
        }
        if (table === 'calendar_feed_tokens') {
          return tokenQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    });

    const response = await postToken({
      feed_type: 'staff',
      staff_profile_id: staffProfileA,
      clinic_id: clinicA,
    });

    expect(response.status).toBe(403);
    expect(tokenQuery.inserted).toBeNull();
  });

  it('denies staff feed tokens for clinics outside manager assignment', async () => {
    createAdminClientMock.mockReturnValue({
      from: (table: string) => {
        if (table === 'staff_profiles') {
          return new StaffProfileQueryMock({
            id: staffProfileA,
            user_id: 'staff-user',
            is_active: true,
          });
        }
        if (table === 'staff_clinic_memberships') {
          return new StaffMembershipQueryMock([
            {
              staff_profile_id: staffProfileA,
              clinic_id: clinicB,
              membership_type: 'help',
            },
          ]);
        }
        if (table === 'calendar_feed_tokens') {
          return tokenQuery;
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    });

    const response = await postToken({
      feed_type: 'staff',
      staff_profile_id: staffProfileA,
      clinic_id: clinicB,
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.success).toBe(false);
    expect(tokenQuery.inserted).toBeNull();
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns an information-free 503 when manager assignment authority is unavailable', async () => {
    resolveManagerAssignedClinicsWithinScopeMock.mockRejectedValue(
      new AppError(
        ERROR_CODES.MANAGER_SCOPE_AUTHORITY_UNAVAILABLE,
        undefined,
        503
      )
    );

    const response = await postToken({
      feed_type: 'clinic',
      clinic_id: clinicA,
    });
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({
      success: false,
      error: '認証情報を確認できません。時間をおいて再度お試しください',
    });
    expect(tokenQuery.inserted).toBeNull();
  });
});

describe('DELETE /api/calendar/feed-tokens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth();
  });

  it('revokes only the token created by the authenticated user', async () => {
    const tokenId = '44444444-4444-4444-8444-444444444444';
    const createdByEq = jest.fn().mockResolvedValue({ error: null });
    const idEq = jest.fn().mockReturnValue({ eq: createdByEq });
    const update = jest.fn().mockReturnValue({ eq: idEq });
    const from = jest.fn().mockReturnValue({ update });
    createAdminClientMock.mockReturnValue({ from });

    const response = await deleteToken(tokenId);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, data: { revoked: true } });
    expect(from).toHaveBeenCalledWith('calendar_feed_tokens');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false })
    );
    expect(idEq).toHaveBeenCalledWith('id', tokenId);
    expect(createdByEq).toHaveBeenCalledWith('created_by', 'manager-user');
  });

  it('does not create a service-role client when authentication fails', async () => {
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    });

    const response = await deleteToken('44444444-4444-4444-8444-444444444444');

    expect(response.status).toBe(401);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });
});
