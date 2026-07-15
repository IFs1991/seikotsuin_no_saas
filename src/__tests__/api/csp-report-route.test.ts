import { NextRequest } from 'next/server';
import { CSPRateLimiter } from '@/lib/rate-limiting/csp-rate-limiter';

const insertPayloads: Array<Record<string, unknown>> = [];

const mockBuilder = {
  insert: jest.fn((payload: unknown) => {
    if (Array.isArray(payload)) {
      insertPayloads.push(...(payload as Array<Record<string, unknown>>));
    } else {
      insertPayloads.push(payload as Record<string, unknown>);
    }
    return mockBuilder;
  }),
  select: jest.fn(() =>
    Promise.resolve({
      data: [
        {
          id: 'violation-1',
          document_uri: 'https://example.com',
          violated_directive: 'script-src',
          blocked_uri: 'https://evil.example/script.js',
          client_ip: '203.0.113.10',
          user_agent: 'test-agent',
          severity: 'high',
          threat_score: 55,
          created_at: '2026-07-07T00:00:00.000Z',
        },
      ],
      error: null,
    })
  ),
};

const mockSupabase = {
  from: jest.fn(() => mockBuilder),
};

const mockGetCurrentUser = jest.fn(() => Promise.resolve(null));
const mockGetUserAccessContext = jest.fn();

jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(() => mockSupabase),
  createAdminClient: jest.fn(() => mockSupabase),
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  getUserAccessContext: (...args: unknown[]) =>
    mockGetUserAccessContext(...args),
  resolveScopedClinicIds: jest.fn(
    (permissions: {
      clinic_id: string | null;
      clinic_scope_ids?: string[] | null;
    }) =>
      Array.isArray(permissions.clinic_scope_ids)
        ? permissions.clinic_scope_ids
        : permissions.clinic_id
          ? [permissions.clinic_id]
          : null
  ),
}));

jest.mock('@/lib/security/csp-config', () => ({
  CSPConfig: { handleCSPViolation: jest.fn(() => Promise.resolve()) },
}));

jest.mock('@/lib/rate-limiting/csp-rate-limiter', () => {
  const actual = jest.requireActual('@/lib/rate-limiting/csp-rate-limiter');
  return {
    ...actual,
    cspRateLimiter: {
      checkCSPReportLimit: jest.fn(() =>
        Promise.resolve({
          allowed: true,
          remainingRequests: 99,
          resetTime: 1_756_800_000,
        })
      ),
    },
  };
});

jest.mock('@/lib/notifications/security-alerts', () => ({
  securityNotificationManager: {
    shouldNotify: jest.fn(() => Promise.resolve(false)),
    notifyCSPViolation: jest.fn(),
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
  createLogger: jest.fn(() => ({
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  })),
}));

function createRequest(body: string, contentType = 'application/json') {
  return new NextRequest('http://localhost/api/security/csp-report', {
    method: 'POST',
    headers: {
      'content-type': contentType,
      'x-forwarded-for': '203.0.113.10',
      'user-agent': 'test-agent',
    },
    body,
  });
}

describe('POST /api/security/csp-report', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    insertPayloads.length = 0;
    process.env.NODE_ENV = originalNodeEnv;
    mockGetCurrentUser.mockResolvedValue(null);
    mockGetUserAccessContext.mockResolvedValue({
      isActive: false,
      permissions: null,
    });
  });

  it('accepts a valid CSP report and inserts a bounded typed payload', async () => {
    const { POST } = await import('@/app/api/security/csp-report/route');

    const response = await POST(
      createRequest(
        JSON.stringify({
          'csp-report': {
            'document-uri': 'https://example.com/page',
            'violated-directive': 'script-src',
            'effective-directive': 'script-src-elem',
            'blocked-uri': 'https://evil.example/script.js',
            'script-sample': 'console.log(1)',
            ignored: 'not stored',
          },
        }),
        'application/csp-report'
      )
    );

    expect(response.status).toBe(204);
    expect(insertPayloads).toHaveLength(1);
    expect(insertPayloads[0]).toEqual(
      expect.objectContaining({
        document_uri: 'https://example.com/page',
        violated_directive: 'script-src',
        effective_directive: 'script-src-elem',
        blocked_uri: 'https://evil.example/script.js',
        script_sample: 'console.log(1)',
        client_ip: '203.0.113.10',
        user_agent: 'test-agent',
      })
    );
    expect(insertPayloads[0]).not.toHaveProperty('ignored');
  });

  it('uses the canonical JWT subset for an authenticated service-role insert', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
    mockGetUserAccessContext.mockResolvedValue({
      isActive: true,
      permissions: {
        role: 'admin',
        clinic_id: 'clinic-primary',
        clinic_scope_ids: ['clinic-subset'],
      },
    });
    const { POST } = await import('@/app/api/security/csp-report/route');

    const response = await POST(
      createRequest(
        JSON.stringify({
          'csp-report': {
            'document-uri': 'https://example.com/page',
            'violated-directive': 'script-src',
            'blocked-uri': 'https://evil.example/script.js',
          },
        })
      )
    );

    expect(response.status).toBe(204);
    expect(insertPayloads).toHaveLength(1);
    expect(insertPayloads[0]).toEqual(
      expect.objectContaining({ clinic_id: 'clinic-subset' })
    );
    expect(insertPayloads[0]).not.toEqual(
      expect.objectContaining({ clinic_id: 'clinic-primary' })
    );
  });

  it('does not attribute an inactive profile CSP report to a clinic', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'inactive-user' });
    mockGetUserAccessContext.mockResolvedValue({
      isActive: false,
      permissions: {
        role: 'admin',
        clinic_id: 'clinic-primary',
        clinic_scope_ids: ['clinic-primary'],
      },
    });
    const { POST } = await import('@/app/api/security/csp-report/route');

    const response = await POST(
      createRequest(
        JSON.stringify({
          'csp-report': {
            'document-uri': 'https://example.com/page',
            'violated-directive': 'script-src',
            'blocked-uri': 'https://evil.example/script.js',
          },
        })
      )
    );

    expect(response.status).toBe(204);
    expect(insertPayloads[0]).toEqual(
      expect.objectContaining({ clinic_id: null })
    );
  });

  it('rejects invalid JSON before inserting', async () => {
    const { POST } = await import('@/app/api/security/csp-report/route');

    const response = await POST(createRequest('{invalid-json'));

    expect(response.status).toBe(400);
    expect(insertPayloads).toHaveLength(0);
  });

  it('rejects unsupported content type before inserting', async () => {
    const { POST } = await import('@/app/api/security/csp-report/route');

    const response = await POST(createRequest('{}', 'text/plain'));

    expect(response.status).toBe(415);
    expect(insertPayloads).toHaveLength(0);
  });

  it('rejects oversized request bodies before JSON parse', async () => {
    const { POST } = await import('@/app/api/security/csp-report/route');
    const oversizedBody = JSON.stringify({
      'document-uri': 'https://example.com',
      'violated-directive': 'script-src',
      'script-sample': 'x'.repeat(40_000),
    });

    const response = await POST(createRequest(oversizedBody));

    expect(response.status).toBe(413);
    expect(insertPayloads).toHaveLength(0);
  });

  it('rejects oversized stored fields', async () => {
    const { POST } = await import('@/app/api/security/csp-report/route');

    const response = await POST(
      createRequest(
        JSON.stringify({
          'document-uri': 'https://example.com',
          'violated-directive': 'script-src',
          'script-sample': 'x'.repeat(600),
        })
      )
    );

    expect(response.status).toBe(400);
    expect(insertPayloads).toHaveLength(0);
  });

  it('fails closed in production when Redis is missing', async () => {
    const originalUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const originalUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.NODE_ENV = 'production';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const limiter = new CSPRateLimiter();
    const result = await limiter.checkCSPReportLimit('203.0.113.10');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('unavailable');

    if (originalUpstashUrl === undefined) {
      delete process.env.UPSTASH_REDIS_REST_URL;
    } else {
      process.env.UPSTASH_REDIS_REST_URL = originalUpstashUrl;
    }
    if (originalUpstashToken === undefined) {
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    } else {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalUpstashToken;
    }
  });
});
