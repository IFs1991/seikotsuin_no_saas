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
const mockMaybeSingle = jest.fn();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));

jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
    from: jest.fn(() => ({
      select: mockSelect,
    })),
  })),
}));

describe('/admin/callback reset-password contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('next=/reset-password/admin を安全に通す', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: null,
      data: { user: { id: 'user-1', email: 'admin@clinic.com' } },
    });
    mockMaybeSingle.mockResolvedValue({
      data: { role: 'admin', clinic_id: 'clinic-1' },
      error: null,
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
  });

  test('clinic_id が null の admin でも reset-password/admin を優先する', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: null,
      data: { user: { id: 'user-1', email: 'admin@clinic.com' } },
    });
    mockMaybeSingle.mockResolvedValue({
      data: { role: 'admin', clinic_id: null },
      error: null,
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
    mockMaybeSingle.mockResolvedValue({
      data: { role: 'staff', clinic_id: 'clinic-1' },
      error: null,
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
    mockMaybeSingle.mockResolvedValue({
      data: { role: 'staff', clinic_id: 'clinic-1' },
      error: null,
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
});
