/**
 * 認証フローの統合テスト
 * Server Actionsとセキュリティ強化機能を統合的にテスト
 */

import {
  describe,
  test,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';

const createProfileQueryBuilder = () => {
  const builder = {
    select: jest.fn(),
    update: jest.fn(),
    eq: jest.fn(),
    single: jest.fn(),
  };

  builder.select.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);

  return builder;
};

const createMockSupabaseClient = () => ({
  auth: {
    signInWithPassword: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    getUser: jest.fn(),
  },
  from: jest.fn(),
  channel: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn(),
    send: jest.fn().mockResolvedValue({}),
  })),
  rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  functions: {
    invoke: jest.fn().mockResolvedValue({ data: null, error: null }),
  },
});

let mockSupabaseClient = createMockSupabaseClient();
const getUserPermissionsMock = jest.fn();
const getUserAccessContextMock = jest.fn();

jest.mock('@/lib/supabase', () => ({
  getServerClient: () => mockSupabaseClient,
  createClient: () => mockSupabaseClient,
  createAdminClient: () => mockSupabaseClient,
  getUserPermissions: (...args: unknown[]) => getUserPermissionsMock(...args),
  getUserAccessContext: (...args: unknown[]) =>
    getUserAccessContextMock(...args),
}));

const auditLoggerMocks = {
  logDataAccess: jest.fn().mockResolvedValue(undefined),
  logSecurityEvent: jest.fn().mockResolvedValue(undefined),
  logFailedLogin: jest.fn().mockResolvedValue(undefined),
  logLogin: jest.fn().mockResolvedValue(undefined),
  logLogout: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: auditLoggerMocks,
  getRequestInfo: jest.fn(() => ({
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  })),
  getRequestInfoFromHeaders: jest.fn(() => ({
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  })),
}));

let profileQueryBuilder = createProfileQueryBuilder();

const { clinicLogin } = require('@/app/(public)/login/actions');
const { signup } = require('@/app/(public)/admin/actions');

// Mock Next.js functions
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

// Mock console methods to avoid noise in tests
const consoleMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('Authentication Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient = createMockSupabaseClient();
    profileQueryBuilder = createProfileQueryBuilder();
    mockSupabaseClient.from.mockImplementation(() => profileQueryBuilder);
    getUserPermissionsMock.mockResolvedValue({
      role: 'staff',
      clinic_id: 'clinic-1',
    });
    getUserAccessContextMock.mockResolvedValue({
      permissions: { role: 'staff', clinic_id: 'clinic-1' },
      role: 'staff',
      normalizedRole: 'staff',
      clinicId: 'clinic-1',
      isActive: true,
      isAdmin: false,
    });
    // Replace console methods with mocks
    global.console = { ...global.console, ...consoleMock };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Server Action Security', () => {
    test('login action validates input and sanitizes data', async () => {
      // Mock successful authentication
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        error: null,
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });

      mockSupabaseClient
        .from()
        .select()
        .eq()
        .single.mockResolvedValue({
          data: { role: 'staff', is_active: true },
        });

      // Test with valid FormData
      const formData = new FormData();
      formData.append('email', '  USER@EXAMPLE.COM  '); // Test trimming and lowercase
      formData.append('password', 'ValidPassword123!');

      await expect(clinicLogin(null, formData)).rejects.toThrow(
        'REDIRECT:/dashboard'
      );

      // Should redirect (throws redirect error in test environment)
      expect(mockSupabaseClient.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'user@example.com', // Should be sanitized
        password: 'ValidPassword123!',
      });
    });

    test('manager login redirects to manager home even when clinic_id is null', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        error: null,
        data: { user: { id: 'manager-123', email: 'manager@example.com' } },
      });
      getUserPermissionsMock.mockResolvedValue({
        role: 'manager',
        clinic_id: null,
      });
      getUserAccessContextMock.mockResolvedValue({
        permissions: { role: 'manager', clinic_id: null },
        role: 'manager',
        normalizedRole: 'manager',
        clinicId: null,
        isActive: true,
        isAdmin: false,
      });
      mockSupabaseClient
        .from()
        .select()
        .eq()
        .single.mockResolvedValue({
          data: { role: 'manager', is_active: true },
        });

      const formData = new FormData();
      formData.append('email', 'manager@example.com');
      formData.append('password', 'ValidPassword123!');

      await expect(clinicLogin(null, formData)).rejects.toThrow(
        'REDIRECT:/manager'
      );
    });

    test('therapist login redirects to reservations after clinic assignment is confirmed', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        error: null,
        data: { user: { id: 'therapist-123', email: 'therapist@example.com' } },
      });
      getUserPermissionsMock.mockResolvedValue({
        role: 'therapist',
        clinic_id: 'clinic-1',
      });
      getUserAccessContextMock.mockResolvedValue({
        permissions: { role: 'therapist', clinic_id: 'clinic-1' },
        role: 'therapist',
        normalizedRole: 'therapist',
        clinicId: 'clinic-1',
        isActive: true,
        isAdmin: false,
      });
      mockSupabaseClient
        .from()
        .select()
        .eq()
        .single.mockResolvedValue({
          data: { role: 'therapist', is_active: true },
        });

      const formData = new FormData();
      formData.append('email', 'therapist@example.com');
      formData.append('password', 'ValidPassword123!');

      await expect(clinicLogin(null, formData)).rejects.toThrow(
        'REDIRECT:/reservations'
      );
    });

    test('clinic_admin and staff login redirects remain dashboard', async () => {
      const formData = new FormData();
      formData.append('email', 'user@example.com');
      formData.append('password', 'ValidPassword123!');

      for (const role of ['clinic_admin', 'staff'] as const) {
        jest.clearAllMocks();
        mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
          error: null,
          data: { user: { id: `${role}-123`, email: 'user@example.com' } },
        });
        getUserPermissionsMock.mockResolvedValue({
          role,
          clinic_id: 'clinic-1',
        });
        getUserAccessContextMock.mockResolvedValue({
          permissions: { role, clinic_id: 'clinic-1' },
          role,
          normalizedRole: role,
          clinicId: 'clinic-1',
          isActive: true,
          isAdmin: role === 'clinic_admin',
        });
        mockSupabaseClient
          .from()
          .select()
          .eq()
          .single.mockResolvedValue({
            data: { role, is_active: true },
          });

        await expect(clinicLogin(null, formData)).rejects.toThrow(
          'REDIRECT:/dashboard'
        );
      }
    });

    test('login action rejects invalid input', async () => {
      // Test with invalid email
      const formData = new FormData();
      formData.append('email', 'invalid-email');
      formData.append('password', 'password');

      const result = await clinicLogin(null, formData);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(mockSupabaseClient.auth.signInWithPassword).not.toHaveBeenCalled();
    });

    test('signup action enforces strong password policy', async () => {
      // Test with weak password
      const formData = new FormData();
      formData.append('email', 'user@example.com');
      formData.append('password', 'weak'); // Doesn't meet requirements

      const result = await signup(null, formData);

      expect(result.success).toBe(false);
      expect(result.errors.password).toBeDefined();
      expect(mockSupabaseClient.auth.signUp).not.toHaveBeenCalled();
    });

    test('authentication handles inactive users securely', async () => {
      // Mock successful auth but inactive user
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        error: null,
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });

      mockSupabaseClient
        .from()
        .select()
        .eq()
        .single.mockResolvedValue({
          data: { role: 'staff', is_active: false },
        });

      mockSupabaseClient.auth.signOut.mockResolvedValue({ error: null });
      getUserAccessContextMock.mockResolvedValue({
        permissions: null,
        role: null,
        normalizedRole: null,
        clinicId: null,
        isActive: false,
        isAdmin: false,
      });

      const formData = new FormData();
      formData.append('email', 'inactive@example.com');
      formData.append('password', 'ValidPassword123!');

      const result = await clinicLogin(null, formData);

      expect(result.success).toBe(false);
      expect(result.errors._form).toContain(
        'アカウントが無効化されています。管理者にお問い合わせください'
      );
      expect(mockSupabaseClient.auth.signOut).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Logging', () => {
    test('records failed login audits without console PII output', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        error: { message: 'Invalid credentials', status: 400 },
        data: null,
      });

      const formData = new FormData();
      formData.append('email', 'user@example.com');
      formData.append('password', 'wrongpassword');

      const result = await clinicLogin(null, formData);

      expect(result.success).toBe(false);
      expect(auditLoggerMocks.logFailedLogin).toHaveBeenCalledWith(
        'user@example.com',
        '127.0.0.1',
        'jest',
        'メールアドレスまたはパスワードが正しくありません'
      );
      expect(consoleMock.warn).not.toHaveBeenCalled();
      expect(result.errors._form).toContain(
        'メールアドレスまたはパスワードが正しくありません'
      );
    });

    test('maps 403 authentication errors to inactive message', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        error: { message: 'User inactive', status: 403 },
        data: null,
      });

      const formData = new FormData();
      formData.append('email', 'user@example.com');
      formData.append('password', 'ValidPassword123!');

      const result = await clinicLogin(null, formData);

      expect(result.success).toBe(false);
      expect(result.errors._form).toContain(
        'アカウントが無効化されています。管理者にお問い合わせください'
      );
      expect(auditLoggerMocks.logFailedLogin).toHaveBeenCalledWith(
        'user@example.com',
        '127.0.0.1',
        'jest',
        'アカウントが無効化されています。管理者にお問い合わせください'
      );
      expect(consoleMock.warn).not.toHaveBeenCalled();
    });

    test('handles system errors gracefully', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockRejectedValue(
        new Error('Database connection failed')
      );

      const formData = new FormData();
      formData.append('email', 'user@example.com');
      formData.append('password', 'ValidPassword123!');

      const result = await clinicLogin(null, formData);

      expect(result.success).toBe(false);
      expect(result.errors._form).toContain('システムエラーが発生しました');
      expect(consoleMock.error).not.toHaveBeenCalled();
    });
  });

  describe('Callback Route Security', () => {
    test('callback route validates redirect URLs', () => {
      // This would require more complex mocking of Next.js Request/Response
      // For now, we test the URL validation logic directly
      const { getSafeRedirectUrl } = require('@/lib/url-validator');

      const origin = 'http://localhost:3000';

      // Safe redirects
      expect(getSafeRedirectUrl('/dashboard', origin)).toBeTruthy();
      expect(
        getSafeRedirectUrl('http://localhost:3000/admin', origin)
      ).toBeTruthy();

      // Unsafe redirects
      expect(getSafeRedirectUrl('http://evil.com', origin)).toBeNull();
      expect(getSafeRedirectUrl('//evil.com', origin)).toBeNull();
    });
  });

  describe('Client-Side Validation Integration', () => {
    test('password strength calculation works as expected', () => {
      const { getPasswordStrength } = require('@/lib/schemas/auth');

      // Test various password strengths
      const testCases = [
        { password: 'weak', expectedScore: 1, shouldHaveFeedback: true },
        { password: 'Medium1', expectedScore: 3, shouldHaveFeedback: true },
        { password: 'Strong1!', expectedScore: 4, shouldHaveFeedback: false },
        {
          password: 'VeryStrong123!',
          expectedScore: 4,
          shouldHaveFeedback: false,
        },
      ];

      testCases.forEach(({ password, expectedScore, shouldHaveFeedback }) => {
        const result = getPasswordStrength(password);
        expect(result.score).toBeGreaterThanOrEqual(expectedScore - 1);
        expect(result.score).toBeLessThanOrEqual(expectedScore + 1);

        if (shouldHaveFeedback) {
          expect(result.feedback.length).toBeGreaterThan(0);
        } else {
          expect(result.feedback.length).toBe(0);
        }
      });
    });
  });
});
