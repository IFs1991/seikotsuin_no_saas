import { NextRequest } from 'next/server';
import { middleware } from '../../../middleware';
import { createServerClient } from '@supabase/ssr';

// ---------- mocks ----------

const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

jest.mock('@/lib/security/csp-config', () => ({
  CSPConfig: {
    generateNonce: jest.fn().mockReturnValue('test-nonce'),
    getGradualRolloutCSP: jest.fn().mockReturnValue({
      csp: 'default-src self',
      cspReportOnly: null,
    }),
  },
}));

jest.mock('@/lib/rate-limiting/middleware', () => ({
  applyRateLimits: jest.fn().mockResolvedValue(null),
  getPathRateLimit: jest.fn().mockReturnValue([]),
}));

// ---------- helpers ----------

function createMockRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${pathname}`), {
    method: 'GET',
  });
}

/** Build the chained query mock: from().select().eq().maybeSingle() */
function buildQueryChain(data: unknown) {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
        single: jest.fn().mockResolvedValue({ data, error: null }),
      }),
    }),
  };
}

function setupUnauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  mockFrom.mockReturnValue(buildQueryChain(null));
}

function setupAuthenticatedStaff() {
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: 'user-staff-1',
        app_metadata: { role: 'staff' },
      },
    },
    error: null,
  });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'user_permissions') {
      return buildQueryChain({ role: 'staff', clinic_id: 'clinic-1' });
    }
    if (table === 'profiles') {
      return buildQueryChain({ is_active: true });
    }
    return buildQueryChain(null);
  });
}

function setupAuthenticatedAdmin() {
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: 'user-admin-1',
        app_metadata: { role: 'admin' },
      },
    },
    error: null,
  });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'user_permissions') {
      return buildQueryChain({ role: 'admin', clinic_id: null });
    }
    if (table === 'profiles') {
      return buildQueryChain({ is_active: true });
    }
    return buildQueryChain(null);
  });
}

// ---------- tests ----------

describe('Middleware Boundary: public/app route separation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-establish createServerClient implementation after clearAllMocks
    (createServerClient as jest.Mock).mockImplementation(() => ({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    }));
  });

  // --- Unauthenticated ---

  it('unauthenticated + /dashboard -> redirect to /login?redirectTo=/dashboard', async () => {
    setupUnauthenticated();
    const res = await middleware(createMockRequest('/dashboard'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location')!;
    expect(location).toContain('/login');
    expect(location).toContain('redirectTo=%2Fdashboard');
  });

  it('unauthenticated + /admin -> redirect to /admin/login?redirectTo=/admin', async () => {
    setupUnauthenticated();
    const res = await middleware(createMockRequest('/admin'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location')!;
    expect(location).toContain('/admin/login');
    expect(location).toContain('redirectTo=%2Fadmin');
  });

  it('unauthenticated + /login -> no redirect (pass through)', async () => {
    setupUnauthenticated();
    const res = await middleware(createMockRequest('/login'));
    expect(res.status).not.toBe(307);
  });

  it('unauthenticated + / -> no redirect (pass through)', async () => {
    setupUnauthenticated();
    const res = await middleware(createMockRequest('/'));
    expect(res.status).not.toBe(307);
  });

  // --- Authenticated staff ---

  it('authenticated staff + / -> redirect to /dashboard', async () => {
    setupAuthenticatedStaff();
    const res = await middleware(createMockRequest('/'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/dashboard');
  });

  it('authenticated staff + /login -> redirect to /dashboard', async () => {
    setupAuthenticatedStaff();
    const res = await middleware(createMockRequest('/login'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/dashboard');
  });

  // --- Authenticated admin ---

  it('authenticated admin + / -> redirect to /admin', async () => {
    setupAuthenticatedAdmin();
    const res = await middleware(createMockRequest('/'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/admin');
  });

  it('authenticated admin + /admin/login -> redirect to /admin', async () => {
    setupAuthenticatedAdmin();
    const res = await middleware(createMockRequest('/admin/login'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/admin');
  });

  // --- Authenticated users should stay on certain public pages ---

  it('authenticated staff + /invite -> no redirect (stay)', async () => {
    setupAuthenticatedStaff();
    const res = await middleware(createMockRequest('/invite'));
    expect(res.status).not.toBe(307);
  });

  it('authenticated staff + /terms -> no redirect (stay)', async () => {
    setupAuthenticatedStaff();
    const res = await middleware(createMockRequest('/terms'));
    expect(res.status).not.toBe(307);
  });

  it('authenticated staff + /privacy -> no redirect (stay)', async () => {
    setupAuthenticatedStaff();
    const res = await middleware(createMockRequest('/privacy'));
    expect(res.status).not.toBe(307);
  });

  it('authenticated staff + /unauthorized -> no redirect (stay)', async () => {
    setupAuthenticatedStaff();
    const res = await middleware(createMockRequest('/unauthorized'));
    expect(res.status).not.toBe(307);
  });
});
