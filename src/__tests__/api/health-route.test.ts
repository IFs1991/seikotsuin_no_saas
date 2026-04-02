import { createAdminClient } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => {
  const actual = jest.requireActual('@/lib/supabase');
  return {
    ...actual,
    createAdminClient: jest.fn(),
  };
});

const createAdminClientMock = createAdminClient as jest.Mock;

type QueryResult = {
  data: unknown;
  error: unknown;
};

function createHealthQuery(result: Promise<QueryResult> | QueryResult) {
  const query = {
    select: jest.fn().mockReturnThis(),
    limit: jest.fn(),
  };

  query.limit.mockImplementation(() => Promise.resolve(result));

  return query;
}

describe('GET /api/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('returns 200 with connected database when Supabase is healthy', async () => {
    const query = createHealthQuery({
      data: [{ id: 'clinic-1' }],
      error: null,
    });

    createAdminClientMock.mockReturnValue({
      from: jest.fn().mockReturnValue(query),
    });

    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const body = await response.json();

    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.database).toBe('connected');
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it('returns 503 with disconnected database when Supabase returns an error', async () => {
    const query = createHealthQuery({
      data: null,
      error: { message: 'connection failed' },
    });

    createAdminClientMock.mockReturnValue({
      from: jest.fn().mockReturnValue(query),
    });

    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.database).toBe('disconnected');
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it('returns 503 with disconnected database when the query exceeds 5 seconds', async () => {
    const setTimeoutSpy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((callback: TimerHandler) => {
        if (typeof callback === 'function') {
          callback();
        }
        return 0 as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout);

    const delayedResult = new Promise<QueryResult>(() => {});

    const query = createHealthQuery(delayedResult);

    createAdminClientMock.mockReturnValue({
      from: jest.fn().mockReturnValue(query),
    });

    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    const body = await response.json();

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.database).toBe('disconnected');
    expect(body.timestamp).toEqual(expect.any(String));

    setTimeoutSpy.mockRestore();
  });
});
