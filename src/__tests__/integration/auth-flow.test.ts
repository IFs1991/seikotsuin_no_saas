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

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    signInWithPassword: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    getUser: jest.fn(),
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
      })),
    })),
  })),
};

// Mock the Supabase server client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}));

// Mock Next.js functions
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
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

      const { login } = require('@/app/admin/actions');

      // Test with valid FormData
      const formData = new FormData();
      formData.append('email', '  USER@EXAMPLE.COM  '); // Test trimming and lowercase
      formData.append('password', 'ValidPassword123!');

      await login(null, formData);

      // Should redirect (throws redirect error in test environment)
      expect(mockSupabaseClient.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'user@example.com', // Should be sanitized
        password: 'ValidPassword123!',
      });
    });

    test('login action rejects invalid input', async () => {
      const { login } = require('@/app/admin/actions');

      // Test with invalid email
      const formData = new FormData();
      formData.append('email', 'invalid-email');
      formData.append('password', 'password');

      const result = await login(null, formData);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(mockSupabaseClient.auth.signInWithPassword).not.toHaveBeenCalled();
    });

    test('signup action enforces strong password policy', async () => {
      const { signup } = require('@/app/admin/actions');

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

      const { login } = require('@/app/admin/actions');

      const formData = new FormData();
      formData.append('email', 'inactive@example.com');
      formData.append('password', 'ValidPassword123!');

      const result = await login(null, formData);

      expect(result.success).toBe(false);
      expect(result.errors._form).toContain(
        'アカウントが無効化されています。管理者にお問い合わせください'
      );
      expect(mockSupabaseClient.auth.signOut).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Logging', () => {
    test('logs security events appropriately', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
        error: { message: 'Invalid credentials' },
        data: null,
      });

      const { login } = require('@/app/admin/actions');

      const formData = new FormData();
      formData.append('email', 'user@example.com');
      formData.append('password', 'wrongpassword');

      const result = await login(null, formData);

      expect(result.success).toBe(false);
      expect(consoleMock.warn).toHaveBeenCalledWith(
        '[Security] Login attempt failed:',
        expect.objectContaining({
          email: 'user@example.com',
          error: 'Invalid credentials',
        })
      );
    });

    test('handles system errors gracefully', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockRejectedValue(
        new Error('Database connection failed')
      );

      const { login } = require('@/app/admin/actions');

      const formData = new FormData();
      formData.append('email', 'user@example.com');
      formData.append('password', 'ValidPassword123!');

      const result = await login(null, formData);

      expect(result.success).toBe(false);
      expect(result.errors._form).toContain('システムエラーが発生しました');
      expect(consoleMock.error).toHaveBeenCalled();
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
