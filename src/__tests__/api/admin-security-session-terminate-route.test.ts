import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { createScopedAdminContext } from '@/lib/supabase/scoped-admin';

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

jest.mock('@/lib/supabase/scoped-admin', () => {
  const actual = jest.requireActual('@/lib/supabase/scoped-admin');
  return {
    ...actual,
    createScopedAdminContext: jest.fn(),
  };
});

const processApiRequestMock = jest.mocked(processApiRequest);
const createScopedAdminContextMock = jest.mocked(createScopedAdminContext);
const logAdminActionMock = jest.mocked(AuditLogger.logAdminAction);

const sessionId = '11111111-1111-4111-8111-111111111111';
const clinicId = '22222222-2222-4222-8222-222222222222';

describe('POST /api/admin/security/sessions/terminate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    logAdminActionMock.mockResolvedValue(undefined);
  });

  it('binds the session update to the clinic verified from the loaded row', async () => {
    const selectQuery = {
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: sessionId,
          user_id: '33333333-3333-4333-8333-333333333333',
          clinic_id: clinicId,
          is_active: true,
        },
        error: null,
      }),
    };
    const updateQuery = {
      eq: jest.fn(),
      select: jest.fn(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: sessionId },
        error: null,
      }),
    };
    updateQuery.eq.mockReturnValue(updateQuery);
    updateQuery.select.mockReturnValue(updateQuery);
    const userSessionsTable = {
      select: jest.fn(() => selectQuery),
      update: jest.fn(() => updateQuery),
    };
    const securityEventsTable = {
      insert: jest.fn().mockResolvedValue({ error: null }),
    };
    const from = jest.fn((table: string) =>
      table === 'user_sessions' ? userSessionsTable : securityEventsTable
    );
    const client = {
      from,
    } as ReturnType<typeof createScopedAdminContext>['client'];
    const assertClinicInScope = jest.fn();

    createScopedAdminContextMock.mockReturnValue({
      client,
      scopedClinicIds: [clinicId],
      assertClinicInScope,
    });
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: '44444444-4444-4444-8444-444444444444',
        email: 'admin@example.com',
        role: 'admin',
      },
      permissions: {
        role: 'admin',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      body: { sessionId, reason: 'security review' },
      supabase: client,
    });

    const { POST } =
      await import('@/app/api/admin/security/sessions/terminate/route');
    const response = await POST(
      new NextRequest(
        'http://localhost/api/admin/security/sessions/terminate',
        { method: 'POST' }
      )
    );

    expect(response.status).toBe(200);
    expect(assertClinicInScope).toHaveBeenCalledWith(clinicId);
    expect(updateQuery.eq).toHaveBeenNthCalledWith(1, 'id', sessionId);
    expect(updateQuery.eq).toHaveBeenNthCalledWith(2, 'clinic_id', clinicId);
    expect(updateQuery.eq).toHaveBeenNthCalledWith(3, 'is_active', true);
    expect(updateQuery.select).toHaveBeenCalledWith('id');
    expect(logAdminActionMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed without an audit event when the scoped update affects no row', async () => {
    const selectQuery = {
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: sessionId,
          user_id: '33333333-3333-4333-8333-333333333333',
          clinic_id: clinicId,
          is_active: true,
        },
        error: null,
      }),
    };
    const updateQuery = {
      eq: jest.fn(),
      select: jest.fn(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    updateQuery.eq.mockReturnValue(updateQuery);
    updateQuery.select.mockReturnValue(updateQuery);
    const userSessionsTable = {
      select: jest.fn(() => selectQuery),
      update: jest.fn(() => updateQuery),
    };
    const securityEventsTable = { insert: jest.fn() };
    const from = jest.fn((table: string) =>
      table === 'user_sessions' ? userSessionsTable : securityEventsTable
    );
    const client = { from } as ReturnType<
      typeof createScopedAdminContext
    >['client'];

    createScopedAdminContextMock.mockReturnValue({
      client,
      scopedClinicIds: [clinicId],
      assertClinicInScope: jest.fn(),
    });
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: '44444444-4444-4444-8444-444444444444',
        email: 'admin@example.com',
        role: 'admin',
      },
      permissions: {
        role: 'admin',
        clinic_id: clinicId,
        clinic_scope_ids: [clinicId],
      },
      body: { sessionId, reason: 'security review' },
      supabase: client,
    });

    const { POST } =
      await import('@/app/api/admin/security/sessions/terminate/route');
    const response = await POST(
      new NextRequest(
        'http://localhost/api/admin/security/sessions/terminate',
        { method: 'POST' }
      )
    );

    expect(response.status).toBe(500);
    expect(securityEventsTable.insert).not.toHaveBeenCalled();
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });
});
