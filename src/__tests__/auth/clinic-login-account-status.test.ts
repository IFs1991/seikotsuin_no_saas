import { AuditLogger } from '@/lib/audit-logger';
import { getServerClient, getUserPermissions } from '@/lib/supabase';

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers()),
}));

jest.mock('@/lib/supabase', () => ({
  getServerClient: jest.fn(),
  getUserPermissions: jest.fn(),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logFailedLogin: jest.fn(),
    logLogin: jest.fn(),
  },
  getRequestInfoFromHeaders: jest.fn(() => ({
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  })),
}));

const getServerClientMock = jest.mocked(getServerClient);
const getUserPermissionsMock = jest.mocked(getUserPermissions);
const logLoginMock = jest.mocked(AuditLogger.logLogin);

function createProfileQuery(result: {
  data: { is_active: boolean } | null;
  error: { message: string } | null;
}) {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    single: jest.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function createLoginFormData() {
  const formData = new FormData();
  formData.append('email', 'staff@example.com');
  formData.append('password', 'ValidPassword123!');
  return formData;
}

describe('clinicLogin account status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getUserPermissionsMock.mockResolvedValue({
      role: 'staff',
      clinic_id: 'clinic-1',
    });
    logLoginMock.mockResolvedValue(undefined);
  });

  it.each([
    {
      name: 'profile lookup fails',
      result: { data: null, error: { message: 'database unavailable' } },
    },
    {
      name: 'profile row is missing',
      result: { data: null, error: null },
    },
  ])('fails closed when $name', async ({ result }) => {
    const signOut = jest.fn().mockResolvedValue({ error: null });
    const profileQuery = createProfileQuery(result);
    const supabase = {
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: {
            user: { id: 'user-1', email: 'staff@example.com' },
          },
          error: null,
        }),
        signOut,
      },
      from: jest.fn(() => profileQuery),
    };
    getServerClientMock.mockResolvedValue(supabase);

    const { clinicLogin } = await import('@/app/(public)/login/actions');
    const response = await clinicLogin(
      { success: false, errors: {} },
      createLoginFormData()
    );

    expect(response).toEqual({
      success: false,
      errors: {
        password: [
          'アカウントが無効化されています。管理者にお問い合わせください',
        ],
        _form: ['アカウントが無効化されています。管理者にお問い合わせください'],
      },
    });
    expect(signOut).toHaveBeenCalled();
    expect(logLoginMock).not.toHaveBeenCalled();
  });
});
