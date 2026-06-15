import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockRedirect = jest.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers()),
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
  });

  test('profiles 行が欠けていても inactive 扱いせず /onboarding に進める', async () => {
    mockGetUserAccessContext.mockResolvedValue({
      permissions: null,
      role: null,
      normalizedRole: null,
      clinicId: null,
      isActive: true,
      isAdmin: false,
    });

    const profileLookupBuilder = createQueryBuilder(null);
    const profileInsertBuilder = createQueryBuilder({ id: 'profile-1' });
    const profileBuilders = [profileLookupBuilder, profileInsertBuilder];

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return profileBuilders.shift() ?? createQueryBuilder({});
      }

      return createQueryBuilder({});
    });

    const formData = new FormData();
    formData.append('email', 'owner@example.com');
    formData.append('password', 'ValidPassword123!');

    await expect(login(null, formData)).rejects.toThrow('REDIRECT:/onboarding');
    expect(profileInsertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        email: 'owner@example.com',
      })
    );
    expect(mockSignOut).not.toHaveBeenCalled();
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

    const profileLookupBuilder = createQueryBuilder({ id: 'profile-1' });
    const profileSyncBuilder = createQueryBuilder({});
    const profileBuilders = [profileLookupBuilder, profileSyncBuilder];

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return profileBuilders.shift() ?? createQueryBuilder({});
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

  test('admin 権限なら clinic_id が null でも admin dashboard に進める', async () => {
    mockGetUserAccessContext.mockResolvedValue({
      permissions: { role: 'admin', clinic_id: null },
      role: 'admin',
      normalizedRole: 'admin',
      clinicId: null,
      isActive: true,
      isAdmin: true,
    });

    const profileLookupBuilder = createQueryBuilder({ id: 'profile-1' });
    const profileSyncBuilder = createQueryBuilder({});
    const profileBuilders = [profileLookupBuilder, profileSyncBuilder];

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return profileBuilders.shift() ?? createQueryBuilder({});
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
      })
    );
  });

  test('manager は clinic_id が null でも onboarding ではなく manager home に進める', async () => {
    mockGetUserAccessContext.mockResolvedValue({
      permissions: { role: 'manager', clinic_id: null },
      role: 'manager',
      normalizedRole: 'manager',
      clinicId: null,
      isActive: true,
      isAdmin: false,
    });

    const profileLookupBuilder = createQueryBuilder({ id: 'profile-1' });
    const profileSyncBuilder = createQueryBuilder({});
    const profileBuilders = [profileLookupBuilder, profileSyncBuilder];

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return profileBuilders.shift() ?? createQueryBuilder({});
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

    const profileLookupBuilder = createQueryBuilder({ id: 'profile-1' });
    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return profileLookupBuilder;
      }

      return createQueryBuilder({});
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
});
