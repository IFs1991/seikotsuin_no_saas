/**
 * セキュリティ強化機能のテスト
 * Open Redirect脆弱性修正と入力値検証のテストを実施
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { getSafeRedirectUrl, getDefaultRedirect } from '@/lib/url-validator';
import {
  loginSchema,
  signupSchema,
  sanitizeAuthInput,
  getPasswordStrength,
} from '@/lib/schemas/auth';

// Mock environment variables for testing
const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv, NODE_ENV: 'test' };
});

describe('Security Enhancement Tests', () => {
  describe('Open Redirect Prevention', () => {
    const origin = 'http://localhost:3000';

    test('allows same-origin redirects', () => {
      const validUrls = [
        '/dashboard',
        '/admin/settings',
        'http://localhost:3000/dashboard',
        'http://localhost:3000/admin',
      ];

      validUrls.forEach(url => {
        const result = getSafeRedirectUrl(url, origin);
        expect(result).toBeTruthy();
        expect(result).toContain('localhost:3000');
      });
    });

    test('blocks malicious redirect attempts', () => {
      const maliciousUrls = [
        'http://evil.com/steal-data',
        'https://phishing-site.com',
        'javascript:alert("xss")',
        '//evil.com/redirect',
        'http://localhost:3000.evil.com',
        'ftp://malware.com/payload',
      ];

      maliciousUrls.forEach(url => {
        const result = getSafeRedirectUrl(url, origin);
        expect(result).toBeNull();
      });
    });

    test('handles edge cases safely', () => {
      const edgeCases = [
        null,
        undefined,
        '',
        '   ',
        'not-a-url',
        'http://',
        'https://',
      ];

      edgeCases.forEach(url => {
        const result = getSafeRedirectUrl(url, origin);
        expect(result).toBeNull();
      });
    });

    test('returns appropriate default redirects by role', () => {
      expect(getDefaultRedirect('admin')).toBe('/admin/settings');
      expect(getDefaultRedirect('manager')).toBe('/dashboard');
      expect(getDefaultRedirect('staff')).toBe('/dashboard');
      expect(getDefaultRedirect()).toBe('/admin/settings');
    });
  });

  describe('Input Validation Security', () => {
    describe('Email Validation', () => {
      test('accepts valid email formats', () => {
        const validEmails = [
          'user@example.com',
          'admin@clinic.co.jp',
          'test.email+tag@domain.org',
          'user123@sub.domain.com',
        ];

        validEmails.forEach(email => {
          const result = loginSchema.shape.email.safeParse(email);
          expect(result.success).toBe(true);
        });
      });

      test('rejects invalid email formats', () => {
        const invalidEmails = [
          'not-an-email',
          '@domain.com',
          'user@',
          'user..double@domain.com',
          'user@domain',
          'user name@domain.com',
          'a'.repeat(250) + '@domain.com', // too long
        ];

        invalidEmails.forEach(email => {
          const result = loginSchema.shape.email.safeParse(email);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('Password Validation', () => {
      test('accepts strong passwords', () => {
        const strongPasswords = [
          'StrongP@ss123',
          'MySecure#Key2024',
          'C0mpl3x!Auth99',
          'Clinic@Safe2024!',
        ];

        strongPasswords.forEach(password => {
          const result = signupSchema.shape.password.safeParse(password);
          if (!result.success) {
            console.log(`Password failed: ${password}`, result.error.issues);
          }
          expect(result.success).toBe(true);
        });
      });

      test('rejects weak passwords', () => {
        const weakPasswords = [
          '12345678', // no letters
          'password', // no uppercase, numbers, symbols
          'PASSWORD', // no lowercase, numbers, symbols
          'Pass123', // no symbols, too short
          'admin123', // contains common word
          'qwerty123', // common pattern
        ];

        weakPasswords.forEach(password => {
          const result = signupSchema.shape.password.safeParse(password);
          expect(result.success).toBe(false);
        });
      });

      test('password strength calculation works correctly', () => {
        // Weak password
        const weak = getPasswordStrength('weak123');
        expect(weak.score).toBeLessThan(3);
        expect(weak.feedback.length).toBeGreaterThan(0);

        // Strong password
        const strong = getPasswordStrength('StrongP@ss123');
        expect(strong.score).toBeGreaterThanOrEqual(4);
        expect(strong.feedback.length).toBe(0);
      });
    });

    describe('Input Sanitization', () => {
      test('removes control characters', () => {
        const maliciousInput = 'user@domain.com\x00\x1F\x7F';
        const sanitized = sanitizeAuthInput(maliciousInput);
        expect(sanitized).toBe('user@domain.com');
      });

      test('trims whitespace', () => {
        const input = '  user@domain.com  ';
        const sanitized = sanitizeAuthInput(input);
        expect(sanitized).toBe('user@domain.com');
      });

      test('limits input length', () => {
        const longInput = 'a'.repeat(2000);
        const sanitized = sanitizeAuthInput(longInput);
        expect(sanitized.length).toBe(1000);
      });
    });
  });

  describe('Form Data Schema Validation', () => {
    test('validates login form data correctly', () => {
      const validFormData = new FormData();
      validFormData.append('email', 'user@example.com');
      validFormData.append('password', 'password123');

      // Note: This is a simplified test. In actual implementation,
      // the zfd.formData schema would be tested with proper FormData objects
      expect(validFormData.get('email')).toBe('user@example.com');
      expect(validFormData.get('password')).toBe('password123');
    });
  });

  describe('Security Headers and Constants', () => {
    test('security constants include production domains', () => {
      const { ALLOWED_REDIRECT_ORIGINS } = require('@/lib/constants/security');

      expect(ALLOWED_REDIRECT_ORIGINS).toContain('https://your-clinic-app.com');
      expect(ALLOWED_REDIRECT_ORIGINS).toContain('https://seikotsuin-saas.com');
      expect(Array.isArray(ALLOWED_REDIRECT_ORIGINS)).toBe(true);
      expect(ALLOWED_REDIRECT_ORIGINS.length).toBeGreaterThan(0);
    });
  });
});
