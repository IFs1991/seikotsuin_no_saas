import { NextRequest, NextResponse } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import { rateLimiter } from '@/lib/rate-limiting/rate-limiter';

jest.mock('@/lib/api-helpers', () => ({
  processApiRequest: jest.fn(),
}));

jest.mock('@/lib/rate-limiting/rate-limiter', () => ({
  rateLimiter: {
    addToWhitelist: jest.fn(),
    isWhitelisted: jest.fn(),
    resetRateLimit: jest.fn(),
    getRateLimitStats: jest.fn(),
  },
}));

const processApiRequestMock = jest.mocked(processApiRequest);
const rateLimiterMock = jest.mocked(rateLimiter);

const authFailureResponse = NextResponse.json(
  { error: 'forbidden' },
  { status: 403 }
);

describe('rate-limit admin API access control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    processApiRequestMock.mockResolvedValue({
      success: false,
      error: authFailureResponse,
    });
  });

  it('POST /api/admin/rate-limit/whitelist is restricted to HQ admin', async () => {
    const { POST } = await import(
      '@/app/api/admin/rate-limit/whitelist/route'
    );
    const request = new NextRequest(
      'http://localhost/api/admin/rate-limit/whitelist',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'api_calls',
          identifier: 'user-1',
        }),
      }
    );

    await POST(request);

    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      requireBody: true,
      allowedRoles: ['admin'],
      requireClinicMatch: false,
    });
    expect(rateLimiterMock.addToWhitelist).not.toHaveBeenCalled();
  });

  it('GET /api/admin/rate-limit/whitelist is restricted to HQ admin', async () => {
    const { GET } = await import('@/app/api/admin/rate-limit/whitelist/route');
    const request = new NextRequest(
      'http://localhost/api/admin/rate-limit/whitelist?type=api_calls&identifier=user-1'
    );

    await GET(request);

    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      allowedRoles: ['admin'],
      requireClinicMatch: false,
    });
    expect(rateLimiterMock.isWhitelisted).not.toHaveBeenCalled();
  });

  it('POST /api/admin/rate-limit/reset is restricted to HQ admin', async () => {
    const { POST } = await import('@/app/api/admin/rate-limit/reset/route');
    const request = new NextRequest(
      'http://localhost/api/admin/rate-limit/reset',
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'api_calls',
          identifier: 'user-1',
        }),
      }
    );

    await POST(request);

    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      requireBody: true,
      allowedRoles: ['admin'],
      requireClinicMatch: false,
    });
    expect(rateLimiterMock.resetRateLimit).not.toHaveBeenCalled();
  });

  it('GET /api/admin/rate-limit/stats is restricted to HQ admin', async () => {
    const { GET } = await import('@/app/api/admin/rate-limit/stats/route');
    const request = new NextRequest(
      'http://localhost/api/admin/rate-limit/stats?type=api_calls&identifier=user-1'
    );

    await GET(request);

    expect(processApiRequestMock).toHaveBeenCalledWith(request, {
      allowedRoles: ['admin'],
      requireClinicMatch: false,
    });
    expect(rateLimiterMock.getRateLimitStats).not.toHaveBeenCalled();
  });
});
