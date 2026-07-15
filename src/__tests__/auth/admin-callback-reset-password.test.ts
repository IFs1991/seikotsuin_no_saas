import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockResponseCookiesSet = jest.fn();
const mockRedirect = jest.fn((url: string) => ({
  status: 307,
  headers: {
    get: (name: string) => (name.toLowerCase() === 'location' ? url : null),
  },
  cookies: {
    set: mockResponseCookiesSet,
  },
}));

jest.mock('next/server', () => ({
  NextResponse: {
    redirect: (...args: unknown[]) => mockRedirect(...args),
  },
}));

jest.mock('@/lib/auth/password-recovery-intent', () => ({
  createPasswordRecoveryIntent: jest.fn(() => 'signed-recovery-token'),
  getPasswordRecoveryIntentCookieOptions: jest.fn(() => ({
    httpOnly: true,
    path: '/reset-password',
    maxAge: 600,
  })),
  PASSWORD_RECOVERY_INTENT_COOKIE: 'password_recovery_intent',
}));

const mockExchangeCodeForSession = jest.fn();
const mockGetUserAccessContext = jest.fn();
const mockClearRejectedAuthSession = jest.fn();

jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  })),
  getUserAccessContext: (...args: unknown[]) =>
    mockGetUserAccessContext(...args),
}));

jest.mock('@/lib/auth/session-cleanup', () => ({
  clearRejectedAuthSession: (...args: unknown[]) =>
    mockClearRejectedAuthSession(...args),
}));

describe('/admin/callback reset-password contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserAccessContext.mockResolvedValue({
      permissions: {
        role: 'staff',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1'],
      },
      role: 'staff',
      normalizedRole: 'staff',
      clinicId: 'clinic-1',
      isActive: true,
      isAdmin: false,
    });
    mockClearRejectedAuthSession.mockResolvedValue({
      complete: true,
      signOutError: null,
      cookieCleanupError: null,
    });
  });

  test('next=/reset-password/admin を安全に通す', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: null,
      data: { user: { id: 'user-1', email: 'admin@clinic.com' } },
    });
    const { GET } = await import('@/app/(public)/admin/callback/route');
    const response = await GET(
      new Request(
        'http://localhost:3000/admin/callback?code=abc123&next=/reset-password/admin'
      )
    );

    expect(mockRedirect).toHaveBeenCalledWith(
      'http://localhost:3000/reset-password/admin'
    );
    expect(mockResponseCookiesSet).toHaveBeenCalledWith(
      'password_recovery_intent',
      'signed-recovery-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/reset-password',
        maxAge: 600,
      })
    );
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/reset-password/admin'
    );
    expect(mockGetUserAccessContext).not.toHaveBeenCalled();
  });

  test('clinic_id が null の admin でも reset-password/admin を優先する', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: null,
      data: { user: { id: 'user-1', email: 'admin@clinic.com' } },
    });
    const { GET } = await import('@/app/(public)/admin/callback/route');
    const response = await GET(
      new Request(
        'http://localhost:3000/admin/callback?code=abc123&next=/reset-password/admin'
      )
    );

    expect(mockRedirect).toHaveBeenCalledWith(
      'http://localhost:3000/reset-password/admin'
    );
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/reset-password/admin'
    );
  });

  test('next=/reset-password/clinic を安全に通す', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: null,
      data: { user: { id: 'user-2', email: 'staff@clinic.com' } },
    });
    const { GET } = await import('@/app/(public)/admin/callback/route');
    const response = await GET(
      new Request(
        'http://localhost:3000/admin/callback?code=def456&next=/reset-password/clinic'
      )
    );

    expect(mockRedirect).toHaveBeenCalledWith(
      'http://localhost:3000/reset-password/clinic'
    );
    expect(mockResponseCookiesSet).toHaveBeenCalledWith(
      'password_recovery_intent',
      'signed-recovery-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/reset-password',
        maxAge: 600,
      })
    );
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/reset-password/clinic'
    );
  });

  test('危険な外部 next は拒否されデフォルト遷移にフォールバックする', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: null,
      data: { user: { id: 'user-3', email: 'staff@clinic.com' } },
    });
    const { GET } = await import('@/app/(public)/admin/callback/route');
    const response = await GET(
      new Request(
        'http://localhost:3000/admin/callback?code=ghi789&next=https://evil.example/reset-password/admin'
      )
    );

    expect(mockRedirect).toHaveBeenCalledWith(
      'http://localhost:3000/dashboard'
    );
    expect(mockResponseCookiesSet).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/dashboard'
    );
  });

  test('招待先のクエリを保持し、clinic 未設定でも受諾画面を優先する', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: null,
      data: { user: { id: 'invited-user', email: 'staff@clinic.com' } },
    });
    const token = '550e8400-e29b-41d4-a716-446655440000';
    const next = encodeURIComponent(`/invite?token=${token}`);
    const { GET } = await import('@/app/(public)/admin/callback/route');
    const response = await GET(
      new Request(
        `http://localhost:3000/admin/callback?code=invite123&next=${next}`
      )
    );

    expect(mockRedirect).toHaveBeenCalledWith(
      `http://localhost:3000/invite?token=${token}`
    );
    expect(mockResponseCookiesSet).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe(
      `http://localhost:3000/invite?token=${token}`
    );
    expect(mockGetUserAccessContext).not.toHaveBeenCalled();
  });

  test('manager は clinic_id が null でも onboarding ではなく manager home に進む', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: null,
      data: { user: { id: 'manager-1', email: 'manager@clinic.com' } },
    });
    mockGetUserAccessContext.mockResolvedValue({
      permissions: {
        role: 'manager',
        clinic_id: null,
        clinic_scope_ids: ['clinic-1'],
      },
      role: 'manager',
      normalizedRole: 'manager',
      clinicId: 'clinic-1',
      isActive: true,
      isAdmin: false,
    });

    const { GET } = await import('@/app/(public)/admin/callback/route');
    const response = await GET(
      new Request('http://localhost:3000/admin/callback?code=manager123')
    );

    expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/manager');
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/manager'
    );
  });

  test('通常callbackは permission missing を拒否して session を破棄する', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: null,
      data: { user: { id: 'missing-user', email: 'missing@clinic.com' } },
    });
    mockGetUserAccessContext.mockResolvedValue({
      permissions: null,
      role: null,
      normalizedRole: null,
      clinicId: null,
      isActive: true,
      isAdmin: false,
    });

    const { GET } = await import('@/app/(public)/admin/callback/route');
    const response = await GET(
      new Request('http://localhost:3000/admin/callback?code=missing123')
    );

    expect(mockClearRejectedAuthSession).toHaveBeenCalledTimes(1);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/admin/login?error=auth_failed'
    );
  });

  test('通常callbackは inactive profile を拒否して session を破棄する', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: null,
      data: { user: { id: 'inactive-user', email: 'inactive@clinic.com' } },
    });
    mockGetUserAccessContext.mockResolvedValue({
      permissions: {
        role: 'admin',
        clinic_id: 'clinic-1',
        clinic_scope_ids: ['clinic-1'],
      },
      role: 'admin',
      normalizedRole: 'admin',
      clinicId: 'clinic-1',
      isActive: false,
      isAdmin: true,
    });

    const { GET } = await import('@/app/(public)/admin/callback/route');
    const response = await GET(
      new Request('http://localhost:3000/admin/callback?code=inactive123')
    );

    expect(mockClearRejectedAuthSession).toHaveBeenCalledTimes(1);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/admin/login?error=auth_failed'
    );
  });

  test('通常callbackは authority lookup error 時も session を破棄する', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: null,
      data: { user: { id: 'error-user', email: 'error@clinic.com' } },
    });
    mockGetUserAccessContext.mockRejectedValue(
      new Error('permission database unavailable')
    );

    const { GET } = await import('@/app/(public)/admin/callback/route');
    const response = await GET(
      new Request('http://localhost:3000/admin/callback?code=error123')
    );

    expect(mockClearRejectedAuthSession).toHaveBeenCalledTimes(1);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/admin/login?error=auth_failed'
    );
  });
});
