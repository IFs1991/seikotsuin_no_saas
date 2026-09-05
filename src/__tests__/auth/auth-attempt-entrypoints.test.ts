import { clinicLogin } from '@/app/(public)/login/actions';
import { login } from '@/app/(public)/admin/actions';
import { loginAndAcceptInvite } from '@/app/(public)/invite/actions';
import { headers } from 'next/headers';

const mockGuard = jest.fn();
const mockSignIn = jest.fn();
const mockFailedLogin = jest.fn();
const mockHeaders = new Headers({ 'x-forwarded-for': '192.0.2.1' });
jest.mock('@/lib/auth/auth-attempt-guard', () => ({
  checkAuthAttempt: (...args: unknown[]) => mockGuard(...args),
}));
jest.mock('next/headers', () => ({ headers: async () => mockHeaders }));
jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logFailedLogin: (...args: unknown[]) => mockFailedLogin(...args),
  },
  getRequestInfoFromHeaders: () => ({
    ipAddress: '192.0.2.1',
    userAgent: 'test',
  }),
}));
jest.mock('@/lib/supabase', () => ({
  getServerClient: async () => ({ auth: { signInWithPassword: mockSignIn } }),
  createAdminClient: () => {
    const query = {
      select: () => query,
      eq: () => query,
      gt: () => query,
      is: () => query,
      maybeSingle: async () => ({
        data: {
          id: '22222222-2222-4222-8222-222222222222',
          clinic_id: '11111111-1111-4111-8111-111111111111',
          token: '550e8400-e29b-41d4-a716-446655440000',
          email: 'staff@clinic.example',
          role: 'staff',
          expires_at: '2099-01-01T00:00:00Z',
          accepted_at: null,
          accepted_by: null,
        },
        error: null,
      }),
    };
    return { from: () => query };
  },
}));

describe.each([
  ['clinic', clinicLogin],
  ['admin', login],
  ['invite', loginAndAcceptInvite],
] as const)('TASK-01 %s password entrypoint', (_name, action) => {
  const form = () => {
    const data = new FormData();
    data.set('email', 'Staff@Clinic.Example');
    data.set('password', 'Test-password-1!');
    data.set('token', '550e8400-e29b-41d4-a716-446655440000');
    data.set('user_id', 'forged-user');
    return data;
  };
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignIn.mockResolvedValue({
      data: { user: null },
      error: { status: 400, message: 'Invalid credentials' },
    });
  });
  it.each(['AUTH_RATE_LIMITED', 'AUTH_UNAVAILABLE'])(
    'returns typed %s before authentication and failed-login audit',
    async code => {
      const denied = {
        success: false,
        code,
        retryAfterSeconds: 60,
        errors: { _form: ['再試行してください'] },
      };
      mockGuard.mockResolvedValue(denied);
      expect(await action({ success: true }, form())).toEqual(denied);
      expect(mockGuard).toHaveBeenCalledWith(
        'staff@clinic.example',
        await headers()
      );
      expect(mockSignIn).not.toHaveBeenCalled();
      expect(mockFailedLogin).not.toHaveBeenCalled();
    }
  );
  it('counts valid credential submissions immediately before password authentication', async () => {
    mockGuard.mockResolvedValue(null);
    await action({ success: true }, form());
    expect(mockGuard).toHaveBeenCalledTimes(1);
    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'staff@clinic.example',
      password: 'Test-password-1!',
    });
    expect(mockGuard.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignIn.mock.invocationCallOrder[0]
    );
  });
});
