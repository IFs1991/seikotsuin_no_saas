import { ScopeAccessError } from '@/lib/auth/manager-scope';
import {
  createScopedAdminChatSession,
  resolveScopedAdminChatSessionId,
  resolveScopedChatSessionId,
} from '@/lib/chat/scoped-session';

const CLINIC_A = '11111111-1111-4111-8111-111111111111';
const CLINIC_B = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

type SessionClient = Parameters<typeof resolveScopedChatSessionId>[0]['client'];

type SessionRow = {
  id: string;
  user_id: string | null;
  clinic_id: string | null;
  is_admin_session: boolean | null;
  context_data: unknown;
};

type SessionResult = {
  data: SessionRow | null;
  error: Error | null;
};

function normalSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: SESSION_ID,
    user_id: USER_ID,
    clinic_id: CLINIC_A,
    is_admin_session: false,
    context_data: null,
    ...overrides,
  };
}

function clinicAdminSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: SESSION_ID,
    user_id: USER_ID,
    clinic_id: CLINIC_A,
    is_admin_session: true,
    context_data: {
      mode: 'clinic',
      clinic_id: CLINIC_A,
      scoped_clinic_ids: [CLINIC_A],
      period_days: 30,
    },
    ...overrides,
  };
}

function multiClinicAdminSession(
  overrides: Partial<SessionRow> = {}
): SessionRow {
  return {
    id: SESSION_ID,
    user_id: USER_ID,
    clinic_id: null,
    is_admin_session: true,
    context_data: {
      mode: 'multi_clinic',
      clinic_id: null,
      scoped_clinic_ids: [CLINIC_A, CLINIC_B],
      period_days: 30,
    },
    ...overrides,
  };
}

function createSessionClient(result: SessionResult) {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
  const client = {
    from: jest.fn(() => query),
  } as SessionClient;

  return { client, query };
}

function createAdminContext(result: SessionResult, clinicIds: string[]) {
  const { client, query } = createSessionClient(result);
  const assertClinicInScope = jest.fn((clinicId: string) => {
    if (!clinicIds.includes(clinicId)) {
      throw new ScopeAccessError();
    }
  });

  return {
    context: {
      client,
      scopedClinicIds: clinicIds,
      assertClinicInScope,
    },
    query,
    assertClinicInScope,
  };
}

describe('resolveScopedChatSessionId', () => {
  const permissions = {
    role: 'staff',
    clinic_id: CLINIC_A,
    clinic_scope_ids: [CLINIC_A],
  };

  it('returns an owned non-admin session inside the actor clinic scope', async () => {
    const { client, query } = createSessionClient({
      data: normalSession(),
      error: null,
    });

    await expect(
      resolveScopedChatSessionId({
        client,
        permissions,
        sessionId: SESSION_ID,
        clinicId: CLINIC_A,
        userId: USER_ID,
      })
    ).resolves.toBe(SESSION_ID);

    expect(query.eq).toHaveBeenCalledWith('id', SESSION_ID);
  });

  it('rejects an admin session on the normal chat route', async () => {
    const { client } = createSessionClient({
      data: normalSession({ is_admin_session: true }),
      error: null,
    });

    await expect(
      resolveScopedChatSessionId({
        client,
        permissions,
        sessionId: SESSION_ID,
        clinicId: CLINIC_A,
        userId: USER_ID,
      })
    ).rejects.toBeInstanceOf(ScopeAccessError);
  });

  it('rejects an owner mismatch', async () => {
    const { client } = createSessionClient({
      data: normalSession({ user_id: 'other-user' }),
      error: null,
    });

    await expect(
      resolveScopedChatSessionId({
        client,
        permissions,
        sessionId: SESSION_ID,
        clinicId: CLINIC_A,
        userId: USER_ID,
      })
    ).rejects.toBeInstanceOf(ScopeAccessError);
  });

  it('rejects before querying when the requested clinic is outside actor scope', async () => {
    const { client } = createSessionClient({
      data: normalSession({ clinic_id: CLINIC_B }),
      error: null,
    });

    await expect(
      resolveScopedChatSessionId({
        client,
        permissions,
        sessionId: SESSION_ID,
        clinicId: CLINIC_B,
        userId: USER_ID,
      })
    ).rejects.toBeInstanceOf(ScopeAccessError);
    expect(client.from).not.toHaveBeenCalled();
  });

  it.each([
    ['database error', { data: null, error: new Error('query failed') }],
    ['null row', { data: null, error: null }],
  ])('fails closed for %s', async (_label, result) => {
    const { client } = createSessionClient(result);

    await expect(
      resolveScopedChatSessionId({
        client,
        permissions,
        sessionId: SESSION_ID,
        clinicId: CLINIC_A,
        userId: USER_ID,
      })
    ).rejects.toBeInstanceOf(ScopeAccessError);
  });
});

describe('resolveScopedAdminChatSessionId', () => {
  it('accepts a clinic-specific session only when its stored context matches', async () => {
    const { context, assertClinicInScope } = createAdminContext(
      { data: clinicAdminSession(), error: null },
      [CLINIC_A, CLINIC_B]
    );

    await expect(
      resolveScopedAdminChatSessionId({
        context,
        sessionId: SESSION_ID,
        userId: USER_ID,
        requestedClinicId: CLINIC_A,
      })
    ).resolves.toBe(SESSION_ID);
    expect(assertClinicInScope).toHaveBeenCalledWith(CLINIC_A);
  });

  it('accepts a non-empty multi-clinic context that is a subset of actor scope', async () => {
    const { context, assertClinicInScope } = createAdminContext(
      { data: multiClinicAdminSession(), error: null },
      [CLINIC_A, CLINIC_B]
    );

    await expect(
      resolveScopedAdminChatSessionId({
        context,
        sessionId: SESSION_ID,
        userId: USER_ID,
        requestedClinicId: null,
      })
    ).resolves.toBe(SESSION_ID);
    expect(assertClinicInScope).toHaveBeenCalledWith(CLINIC_A);
    expect(assertClinicInScope).toHaveBeenCalledWith(CLINIC_B);
  });

  it('rejects an owner mismatch', async () => {
    const { context } = createAdminContext(
      {
        data: multiClinicAdminSession({ user_id: 'other-user' }),
        error: null,
      },
      [CLINIC_A, CLINIC_B]
    );

    await expect(
      resolveScopedAdminChatSessionId({
        context,
        sessionId: SESSION_ID,
        userId: USER_ID,
        requestedClinicId: null,
      })
    ).rejects.toBeInstanceOf(ScopeAccessError);
  });

  it('rejects a stored clinic outside the actor scope', async () => {
    const { context } = createAdminContext(
      { data: multiClinicAdminSession(), error: null },
      [CLINIC_A]
    );

    await expect(
      resolveScopedAdminChatSessionId({
        context,
        sessionId: SESSION_ID,
        userId: USER_ID,
        requestedClinicId: null,
      })
    ).rejects.toBeInstanceOf(ScopeAccessError);
  });

  it.each([
    ['null context', null],
    [
      'empty scoped clinic ids',
      {
        mode: 'multi_clinic',
        clinic_id: null,
        scoped_clinic_ids: [],
      },
    ],
  ])('fails closed for %s', async (_label, contextData) => {
    const { context } = createAdminContext(
      {
        data: multiClinicAdminSession({ context_data: contextData }),
        error: null,
      },
      [CLINIC_A, CLINIC_B]
    );

    await expect(
      resolveScopedAdminChatSessionId({
        context,
        sessionId: SESSION_ID,
        userId: USER_ID,
        requestedClinicId: null,
      })
    ).rejects.toBeInstanceOf(ScopeAccessError);
  });

  it('rejects clinic-specific context whose clinic list does not match', async () => {
    const { context } = createAdminContext(
      {
        data: clinicAdminSession({
          context_data: {
            mode: 'clinic',
            clinic_id: CLINIC_A,
            scoped_clinic_ids: [CLINIC_A, CLINIC_B],
          },
        }),
        error: null,
      },
      [CLINIC_A, CLINIC_B]
    );

    await expect(
      resolveScopedAdminChatSessionId({
        context,
        sessionId: SESSION_ID,
        userId: USER_ID,
        requestedClinicId: CLINIC_A,
      })
    ).rejects.toBeInstanceOf(ScopeAccessError);
  });

  it.each([
    ['database error', { data: null, error: new Error('query failed') }],
    ['null row', { data: null, error: null }],
  ])('fails closed for %s', async (_label, result) => {
    const { context } = createAdminContext(result, [CLINIC_A, CLINIC_B]);

    await expect(
      resolveScopedAdminChatSessionId({
        context,
        sessionId: SESSION_ID,
        userId: USER_ID,
        requestedClinicId: null,
      })
    ).rejects.toBeInstanceOf(ScopeAccessError);
  });
});

describe('createScopedAdminChatSession', () => {
  it('rejects an empty multi-clinic context before inserting', async () => {
    const { context } = createAdminContext({ data: null, error: null }, [
      CLINIC_A,
    ]);

    await expect(
      createScopedAdminChatSession({
        context,
        userId: USER_ID,
        clinicId: null,
        contextData: {
          mode: 'multi_clinic',
          clinic_id: null,
          scoped_clinic_ids: [],
          period_days: 30,
        },
      })
    ).rejects.toBeInstanceOf(ScopeAccessError);
    expect(context.client.from).not.toHaveBeenCalled();
  });
});
