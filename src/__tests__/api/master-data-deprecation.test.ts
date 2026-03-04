/**
 * master-data API 廃止テスト
 *
 * 全エンドポイントが 410 Gone を返すことを検証
 */

/** @jest-environment node */

import { describe, test, expect } from '@jest/globals';

// モック設定（route.ts 内で使用されるモジュール）
jest.mock('@/lib/supabase', () => ({
  getServerClient: jest.fn(),
  getCurrentUser: jest.fn(),
  getUserPermissions: jest.fn(),
}));

jest.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
  assertEnv: jest.fn(() => ''),
}));

describe('master-data API deprecation (410 Gone)', () => {
  describe('/api/admin/master-data', () => {
    test('GET returns 410 Gone', async () => {
      const { GET } = await import(
        '@/app/api/admin/master-data/route'
      );
      const response = await GET();
      expect(response.status).toBe(410);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.migration_to).toBe('/api/admin/settings');
    });

    test('POST returns 410 Gone', async () => {
      const { POST } = await import(
        '@/app/api/admin/master-data/route'
      );
      const response = await POST();
      expect(response.status).toBe(410);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.migration_to).toBe('/api/admin/settings');
    });

    test('PUT returns 410 Gone', async () => {
      const { PUT } = await import(
        '@/app/api/admin/master-data/route'
      );
      const response = await PUT();
      expect(response.status).toBe(410);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.migration_to).toBe('/api/admin/settings');
    });

    test('DELETE returns 410 Gone', async () => {
      const mod = await import(
        '@/app/api/admin/master-data/route'
      );
      const DELETE = mod.DELETE;
      const response = await DELETE();
      expect(response.status).toBe(410);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.migration_to).toBe('/api/admin/settings');
    });
  });

  describe('/api/admin/master-data/export', () => {
    test('GET returns 410 Gone', async () => {
      const { GET } = await import(
        '@/app/api/admin/master-data/export/route'
      );
      const response = await GET();
      expect(response.status).toBe(410);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.migration_to).toBe('/api/admin/settings');
    });
  });

  describe('/api/admin/master-data/import', () => {
    test('POST returns 410 Gone', async () => {
      const { POST } = await import(
        '@/app/api/admin/master-data/import/route'
      );
      const response = await POST();
      expect(response.status).toBe(410);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.migration_to).toBe('/api/admin/settings');
    });
  });

  describe('/api/admin/master-data/rollback', () => {
    test('POST returns 410 Gone', async () => {
      const { POST } = await import(
        '@/app/api/admin/master-data/rollback/route'
      );
      const response = await POST();
      expect(response.status).toBe(410);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.migration_to).toBe('/api/admin/settings');
    });
  });
});
