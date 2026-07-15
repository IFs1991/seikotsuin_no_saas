import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockRedirect = jest.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const mockCookieDelete = jest.fn();
const mockCookieGetAll = jest.fn(() => [
  { name: 'sb-project-auth-token.0', value: 'stale' },
  { name: 'unrelated-cookie', value: 'keep' },
]);

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers()),
  cookies: jest.fn(async () => ({
    getAll: mockCookieGetAll,
    delete: mockCookieDelete,
  })),
}));

function createQueryBuilder(
  mockData: unknown = null,
  mockError: unknown = null
) {
  const result = { data: mockData, error: mockError };
  const builder: Record<string, jest.Mock> & {
    then: (resolve: (value: unknown) => void) => void;
  } = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(),
    then: resolve => resolve(result),
  };

  builder.select.mockReturnValue(builder);
  builder.insert.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue(result);

  return builder;
}

const mockSignInWithPassword = jest.fn();
const mockSignOut = jest.fn();
const mockGetUserAccessContext = jest.fn();

const mockSupabaseClient = {
  auth: {
    signInWithPassword: mockSignInWithPassword,
    signOut: mockSignOut,
  },
  from: jest.fn(),
};

const mockAdminClient = {
  from: jest.fn(),
};

const auditLoggerMocks = {
  logFailedLogin: jest.fn().mockResolvedValue(undefined),
  logLogin: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@/lib/supabase', () => ({
  getServerClient: jest.fn(async () => mockSupabaseClient),
  createAdminClient: jest.fn(() => mockAdminClient),
  getUserAccessContext: (...args: unknown[]) =>
    mockGetUserAccessContext(...args),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: auditLoggerMocks,
  getRequestInfoFromHeaders: jest.fn(() => ({
    ipAddress: '127.0.0.1',
    userAgent: 'jest-test',
  })),
}));

const { login } = require('@/app/(public)/admin/actions');
const { clearRejectedAuthSession } = require('@/lib/auth/session-cleanup');

describe('admin/actions login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.from.mockReset();
    mockAdminClient.from.mockReset();
    mockSignInWithPassword.mockResolvedValue({
      error: null,
      data: {
        user: {
          id: 'user-1',
          email: 'owner@example.com',
          user_metadata: {},
        },
      },
    });
    mockSignOut.mockResolvedValue({ error: null });
  });

  test('rejected session cleanup は signOut error 時も auth cookie を削除する', async () => {
    mockSignOut.mockResolvedValue({ error: { message: 'signout failed' } });

    const result = await clearRejectedAuthSession(
      mockSupabaseClient,
      async () => ({
        getAll: mockCookieGetAll,
        delete: mockCookieDelete,
      })
    );

    expect(result).toEqual({
      complete: true,
      signOutError: { message: 'signout failed' },
      cookieCleanupError: null,
    });
    expect(mockCookieGetAll).toHaveBeenCalledTimes(1);
    expect(mockCookieDelete).toHaveBeenCalledWith('sb-project-auth-token.0');
  });

  test('profiles 行が欠けている場合は自動作成せずログインを拒否する', async () => {
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

    const formData = new FormData();
    formData.append('email', 'owner@example.com');
    formData.append('password', 'ValidPassword123!');

    const result = await login(null, formData);

    expect(result.success).toBe(false);
    expect(mockAdminClient.from).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
  });

  test('permission 行が欠けている場合は stale session を残さず拒否する', async () => {
    mockGetUserAccessContext.mockResolvedValue({
      permissions: null,
      role: null,
      normalizedRole: null,
      clinicId: null,
      isActive: true,
      isAdmin: false,
    });

    const formData = new FormData();
    formData.append('email', 'owner@example.com');
    formData.append('password', 'ValidPassword123!');

    const result = await login(null, formData);

    expect(result.success).toBe(false);
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockAdminClient.from).not.toHaveBeenCalled();
  });

  test('authority lookup error は session を破棄して generic failure にする', async () => {
    mockGetUserAccessContext.mockRejectedValue(
      new Error('permission database unavailable')
    );

    const formData = new FormData();
    formData.append('email', 'owner@example.com');
    formData.append('password', 'ValidPassword123!');

    const result = await login(null, formData);

    expect(result.success).toBe(false);
    expect(result.errors?._form).toBeDefined();
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockAdminClient.from).not.toHaveBeenCalled();
  });

  test('admin 権限と clinic_id があれば admin dashboard に進める', async () => {
    mockGetUserAccessContext.mockResolvedValue({
      permissions: { role: 'admin', clinic_id: 'clinic-1' },
      role: 'admin',
      normalizedRole: 'admin',
      clinicId: 'clinic-1',
      isActive: true,
      isAdmin: true,
    });

    const profileSyncBuilder = createQueryBuilder({});

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return profileSyncBuilder;
      }

      return createQueryBuilder({});
    });

    const formData = new FormData();
    formData.append('email', 'owner@example.com');
    formData.append('password', 'ValidPassword123!');

    await expect(login(null, formData)).rejects.toThrow('REDIRECT:/admin');
    expect(profileSyncBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'owner@example.com',
        role: 'admin',
        clinic_id: 'clinic-1',
      })
    );
  });

  test('JWT subset で表示先が狭まっても DB primary clinic を profile mirror に保持する', async () => {
    mockGetUserAccessContext.mockResolvedValue({
      permissions: {
        role: 'admin',
        clinic_id: 'clinic-primary',
        clinic_scope_ids: ['clinic-subset'],
      },
      role: 'admin',
      normalizedRole: 'admin',
      clinicId: 'clinic-subset',
      isActive: true,
      isAdmin: true,
    });

    const profileSyncBuilder = createQueryBuilder({});

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return profileSyncBuilder;
      }

      return createQueryBuilder({});
    });

    const formData = new FormData();
    formData.append('email', 'owner@example.com');
    formData.append('password', 'ValidPassword123!');

    await expect(login(null, formData)).rejects.toThrow('REDIRECT:/admin');
    expect(profileSyncBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'owner@example.com',
        role: 'admin',
        clinic_id: 'clinic-primary',
      })
    );
    expect(profileSyncBuilder.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ clinic_id: 'clinic-subset' })
    );
  });

  test('admin の canonical scope が空なら session を破棄して拒否する', async () => {
    mockGetUserAccessContext.mockResolvedValue({
      permissions: null,
      role: null,
      normalizedRole: null,
      clinicId: null,
      isActive: true,
      isAdmin: false,
    });

    const profileSyncBuilder = createQueryBuilder({});

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return profileSyncBuilder;
      }

      return createQueryBuilder({});
    });

    const formData = new FormData();
    formData.append('email', 'owner@example.com');
    formData.append('password', 'ValidPassword123!');

    const result = await login(null, formData);

    expect(result.success).toBe(false);
    expect(result.errors?._form).toBeDefined();
    expect(mockSignOut).toHaveBeenCalled();
    expect(profileSyncBuilder.update).not.toHaveBeenCalled();
  });

  test('manager は primary clinic が null でも canonical assignment があれば manager home に進める', async () => {
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

    const profileSyncBuilder = createQueryBuilder({});

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return profileSyncBuilder;
      }

      return createQueryBuilder({});
    });

    const formData = new FormData();
    formData.append('email', 'manager@example.com');
    formData.append('password', 'ValidPassword123!');

    await expect(login(null, formData)).rejects.toThrow('REDIRECT:/manager');
    expect(profileSyncBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'manager@example.com',
        role: 'manager',
      })
    );
  });

  test('inactive なユーザーは従来どおりログイン拒否する', async () => {
    mockGetUserAccessContext.mockResolvedValue({
      permissions: { role: 'admin', clinic_id: 'clinic-1' },
      role: 'admin',
      normalizedRole: 'admin',
      clinicId: 'clinic-1',
      isActive: false,
      isAdmin: true,
    });

    const formData = new FormData();
    formData.append('email', 'owner@example.com');
    formData.append('password', 'ValidPassword123!');

    const result = await login(null, formData);

    expect(result.success).toBe(false);
    expect(result.errors?._form).toContain(
      'アカウントが無効化されています。管理者にお問い合わせください'
    );
    expect(mockSignOut).toHaveBeenCalled();
  });

  test('signOut が error を返しても Supabase auth cookie を強制失効する', async () => {
    mockGetUserAccessContext.mockResolvedValue({
      permissions: null,
      role: null,
      normalizedRole: null,
      clinicId: null,
      isActive: true,
      isAdmin: false,
    });
    mockSignOut.mockResolvedValue({
      error: { message: 'logout backend unavailable' },
    });

    const formData = new FormData();
    formData.append('email', 'owner@example.com');
    formData.append('password', 'ValidPassword123!');

    const result = await login(null, formData);

    expect(result.success).toBe(false);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
