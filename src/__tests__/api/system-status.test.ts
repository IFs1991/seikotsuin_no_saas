import { processApiRequest } from '@/lib/api-helpers';
import { createAdminClient } from '@/lib/supabase';
import { NextRequest } from 'next/server';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/supabase', () => {
  const actual = jest.requireActual('@/lib/supabase');
  return {
    ...actual,
    createAdminClient: jest.fn(),
  };
});

const processApiRequestMock = processApiRequest as jest.Mock;
const createAdminClientMock = createAdminClient as jest.Mock;

function createThenableQuery(result: {
  count?: number;
  data?: unknown;
  error: unknown;
}) {
  const query: any = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    then(
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };

  return query;
}

describe('GET /api/system/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC-S01: 認証済みユーザーがシステム統計を取得できる', async () => {
    const clinicsCountQuery = createThenableQuery({ count: 3, error: null });
    const aiQuery = createThenableQuery({ count: 1, error: null });

    const adminClient = {
      from: jest
        .fn()
        .mockReturnValueOnce(clinicsCountQuery)
        .mockReturnValueOnce(aiQuery),
    };

    createAdminClientMock.mockReturnValue(adminClient);
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-1', email: 'u@example.com', role: 'staff' },
      permissions: {
        role: 'staff',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1', 'clinic-2', 'clinic-3'],
      },
      supabase: {},
    });

    const { GET } = await import('@/app/api/system/status/route');
    const response = await GET(
      new NextRequest('http://localhost/api/system/status')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.activeClinicCount).toBe(3);
    expect(body.data.systemStatus).toBe('operational');
    expect(body.data.aiAnalysisStatus).toBe('active');
    expect(clinicsCountQuery.in).toHaveBeenCalledWith('id', [
      'clinic-1',
      'clinic-2',
      'clinic-3',
    ]);
    expect(aiQuery.in).toHaveBeenCalledWith('clinic_id', [
      'clinic-1',
      'clinic-2',
      'clinic-3',
    ]);
  });

  it('TC-S05: ai_comments が当日0件なら aiAnalysisStatus は inactive', async () => {
    const adminClient = {
      from: jest
        .fn()
        .mockReturnValueOnce(createThenableQuery({ count: 1, error: null }))
        .mockReturnValueOnce(createThenableQuery({ count: 0, error: null })),
    };

    createAdminClientMock.mockReturnValue(adminClient);
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-3', email: 'u3@example.com', role: 'staff' },
      permissions: { role: 'staff', clinic_id: 'clinic-5' },
      supabase: {},
    });

    const { GET } = await import('@/app/api/system/status/route');
    const response = await GET(
      new NextRequest('http://localhost/api/system/status')
    );
    const body = await response.json();

    expect(body.data.aiAnalysisStatus).toBe('inactive');
  });

  it('dependency query failure returns a degraded status instead of operational', async () => {
    const adminClient = {
      from: jest
        .fn()
        .mockReturnValueOnce(
          createThenableQuery({ count: 0, error: { message: 'db error' } })
        )
        .mockReturnValueOnce(createThenableQuery({ count: 0, error: null })),
    };

    createAdminClientMock.mockReturnValue(adminClient);
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-5', email: 'u5@example.com', role: 'staff' },
      permissions: { role: 'staff', clinic_id: 'clinic-5' },
      supabase: {},
    });

    const { GET } = await import('@/app/api/system/status/route');
    const response = await GET(
      new NextRequest('http://localhost/api/system/status')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.systemStatus).toBe('degraded');
  });

  it('TC-S06: 未認証リクエストは 401 を返す', async () => {
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401 }
      ),
    });

    const { GET } = await import('@/app/api/system/status/route');
    const response = await GET(
      new Request('http://localhost/api/system/status') as any
    );

    expect(response.status).toBe(401);
  });

  it('TC-S09: clinic_scope_ids と clinic_id が欠落時は 403 (fail-closed)', async () => {
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: { id: 'user-4', email: 'u4@example.com', role: 'staff' },
      permissions: { role: 'staff', clinic_id: null },
      supabase: {},
    });

    createAdminClientMock.mockReturnValue({ from: jest.fn() });

    const { GET } = await import('@/app/api/system/status/route');
    const response = await GET(
      new Request('http://localhost/api/system/status') as any
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });
});
