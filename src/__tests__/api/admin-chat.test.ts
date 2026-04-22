import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { createScopedAdminContext } from '@/lib/supabase/scoped-admin';
import { AnalyticsReadService } from '@/lib/services/analytics-read-service';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/supabase/scoped-admin', () => {
  const actual = jest.requireActual('@/lib/supabase/scoped-admin');
  return {
    ...actual,
    createScopedAdminContext: jest.fn(),
  };
});

jest.mock('@/lib/services/analytics-read-service', () => ({
  AnalyticsReadService: jest.fn(),
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;
const AnalyticsReadServiceMock = AnalyticsReadService as jest.Mock;
const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLINIC_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';

function createListQueryMock(result: unknown[]) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({
      data: result,
      error: null,
    }),
  };
}

function createSingleQueryMock(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: result,
      error: null,
    }),
  };
}

function createInsertQueryMock(result: unknown) {
  return {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: result,
      error: null,
    }),
  };
}

function mockAuth(body?: unknown) {
  processApiRequestMock.mockResolvedValue({
    success: true,
    auth: { id: 'auth-user-1', email: 'admin@example.com', role: 'admin' },
    permissions: {
      role: 'admin',
      clinic_id: null,
      clinic_scope_ids: [CLINIC_ID, OTHER_CLINIC_ID],
    },
    supabase: {},
    body,
  });
}

describe('GET /api/admin/chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses ADMIN_UI_ROLES and returns only current user multi-clinic admin sessions', async () => {
    const listQuery = createListQueryMock([{ id: SESSION_ID }]);
    const client = {
      from: jest.fn().mockReturnValue(listQuery),
    };
    mockAuth();
    createScopedAdminContextMock.mockReturnValue({
      client,
      scopedClinicIds: [CLINIC_ID, OTHER_CLINIC_ID],
      assertClinicInScope: jest.fn(),
    });

    const { GET } = await import('@/app/api/admin/chat/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/chat')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(processApiRequestMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      {
        allowedRoles: Array.from(ADMIN_UI_ROLES),
        requireClinicMatch: false,
      }
    );
    expect(listQuery.eq).toHaveBeenCalledWith('user_id', 'auth-user-1');
    expect(listQuery.eq).toHaveBeenCalledWith('is_admin_session', true);
    expect(listQuery.is).toHaveBeenCalledWith('clinic_id', null);
    expect(body.data).toEqual([{ id: SESSION_ID }]);
  });

  it('asserts clinic scope when clinic_id is specified', async () => {
    const listQuery = createListQueryMock([]);
    const assertClinicInScope = jest.fn();
    mockAuth();
    createScopedAdminContextMock.mockReturnValue({
      client: { from: jest.fn().mockReturnValue(listQuery) },
      scopedClinicIds: [CLINIC_ID],
      assertClinicInScope,
    });

    const { GET } = await import('@/app/api/admin/chat/route');
    await GET(
      new NextRequest(`http://localhost/api/admin/chat?clinic_id=${CLINIC_ID}`)
    );

    expect(assertClinicInScope).toHaveBeenCalledWith(CLINIC_ID);
    expect(listQuery.eq).toHaveBeenCalledWith('clinic_id', CLINIC_ID);
  });
});

describe('POST /api/admin/chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AnalyticsReadServiceMock.mockImplementation(() => ({
      fetchMultiClinicKPI: jest.fn().mockResolvedValue(
        new Map([
          [
            CLINIC_ID,
            {
              revenue: 1200,
              patients: 4,
              staff_performance_score: 3.2,
            },
          ],
        ])
      ),
    }));
  });

  it('rejects invalid body before creating scoped admin context', async () => {
    mockAuth({ message: '', period_days: 400 });

    const { POST } = await import('@/app/api/admin/chat/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/chat', {
        method: 'POST',
        body: JSON.stringify({ message: '', period_days: 400 }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
  });

  it('creates a multi-clinic admin session with auth user id and clinic_id null', async () => {
    const sessionInsertQuery = createInsertQueryMock({
      id: SESSION_ID,
      user_id: 'auth-user-1',
      clinic_id: null,
      is_admin_session: true,
      context_data: {
        scoped_clinic_ids: [CLINIC_ID, OTHER_CLINIC_ID],
      },
    });
    const userMessageInsertQuery = createInsertQueryMock({
      id: 'message-user-1',
      sender: 'user',
    });
    const aiMessageInsertQuery = createInsertQueryMock({
      id: 'message-ai-1',
      sender: 'ai',
    });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(sessionInsertQuery)
        .mockReturnValueOnce(userMessageInsertQuery)
        .mockReturnValueOnce(aiMessageInsertQuery),
    };
    mockAuth({ message: '売上を分析して', clinic_id: null });
    createScopedAdminContextMock.mockReturnValue({
      client,
      scopedClinicIds: [CLINIC_ID, OTHER_CLINIC_ID],
      assertClinicInScope: jest.fn(),
    });

    const { POST } = await import('@/app/api/admin/chat/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/chat', {
        method: 'POST',
        body: JSON.stringify({ message: '売上を分析して', clinic_id: null }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(sessionInsertQuery.insert).toHaveBeenCalledWith({
      user_id: 'auth-user-1',
      clinic_id: null,
      context_data: {
        mode: 'multi_clinic',
        clinic_id: null,
        scoped_clinic_ids: [CLINIC_ID, OTHER_CLINIC_ID],
        period_days: 30,
      },
      is_admin_session: true,
    });
    expect(userMessageInsertQuery.insert).toHaveBeenCalledWith({
      session_id: SESSION_ID,
      sender: 'user',
      message_text: '売上を分析して',
    });
    expect(aiMessageInsertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: SESSION_ID,
        sender: 'ai',
        response_data: expect.objectContaining({
          analysis_type: 'revenue',
          clinic_id: null,
          scoped_clinic_ids: [CLINIC_ID, OTHER_CLINIC_ID],
        }),
      })
    );
    expect(body.data.session_id).toBe(SESSION_ID);
  });

  it('asserts clinic scope and creates clinic-specific admin session', async () => {
    const sessionInsertQuery = createInsertQueryMock({
      id: SESSION_ID,
      user_id: 'auth-user-1',
      clinic_id: CLINIC_ID,
      is_admin_session: true,
    });
    const userMessageInsertQuery = createInsertQueryMock({});
    const aiMessageInsertQuery = createInsertQueryMock({});
    const assertClinicInScope = jest.fn();
    mockAuth({ message: '患者分析', clinic_id: CLINIC_ID });
    createScopedAdminContextMock.mockReturnValue({
      client: {
        from: jest
          .fn()
          .mockReturnValueOnce(sessionInsertQuery)
          .mockReturnValueOnce(userMessageInsertQuery)
          .mockReturnValueOnce(aiMessageInsertQuery),
      },
      scopedClinicIds: [CLINIC_ID, OTHER_CLINIC_ID],
      assertClinicInScope,
    });

    const { POST } = await import('@/app/api/admin/chat/route');
    await POST(
      new NextRequest('http://localhost/api/admin/chat', {
        method: 'POST',
        body: JSON.stringify({ message: '患者分析', clinic_id: CLINIC_ID }),
      })
    );

    expect(assertClinicInScope).toHaveBeenCalledWith(CLINIC_ID);
    expect(sessionInsertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: CLINIC_ID,
        context_data: expect.objectContaining({
          mode: 'clinic',
          scoped_clinic_ids: [CLINIC_ID],
        }),
      })
    );
  });

  it('reuses existing session only when it belongs to the current admin scope', async () => {
    const sessionQuery = createSingleQueryMock({
      id: SESSION_ID,
      user_id: 'auth-user-1',
      clinic_id: null,
      is_admin_session: true,
      context_data: {
        mode: 'multi_clinic',
        clinic_id: null,
        scoped_clinic_ids: [CLINIC_ID],
        period_days: 30,
      },
    });
    const userMessageInsertQuery = createInsertQueryMock({});
    const aiMessageInsertQuery = createInsertQueryMock({});
    mockAuth({ message: '改善提案', session_id: SESSION_ID });
    createScopedAdminContextMock.mockReturnValue({
      client: {
        from: jest
          .fn()
          .mockReturnValueOnce(sessionQuery)
          .mockReturnValueOnce(userMessageInsertQuery)
          .mockReturnValueOnce(aiMessageInsertQuery),
      },
      scopedClinicIds: [CLINIC_ID, OTHER_CLINIC_ID],
      assertClinicInScope: jest.fn(),
    });

    const { POST } = await import('@/app/api/admin/chat/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/chat', {
        method: 'POST',
        body: JSON.stringify({ message: '改善提案', session_id: SESSION_ID }),
      })
    );

    expect(response.status).toBe(200);
    expect(sessionQuery.eq).toHaveBeenCalledWith('id', SESSION_ID);
    expect(userMessageInsertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: SESSION_ID,
      })
    );
  });

  it('rejects existing session owned by another user', async () => {
    const sessionQuery = createSingleQueryMock({
      id: SESSION_ID,
      user_id: 'other-user',
      clinic_id: null,
      is_admin_session: true,
    });
    mockAuth({ message: '改善提案', session_id: SESSION_ID });
    createScopedAdminContextMock.mockReturnValue({
      client: {
        from: jest.fn().mockReturnValueOnce(sessionQuery),
      },
      scopedClinicIds: [CLINIC_ID],
      assertClinicInScope: jest.fn(),
    });

    const { POST } = await import('@/app/api/admin/chat/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/chat', {
        method: 'POST',
        body: JSON.stringify({ message: '改善提案', session_id: SESSION_ID }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });
});
