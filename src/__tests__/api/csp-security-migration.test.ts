/**
 * CSP/セキュリティテーブル migration SSOT テスト
 *
 * マイグレーションファイルの構造検証 + API の clinic_id 対応
 */

/** @jest-environment node */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// ================================================================
// Red 1: マイグレーションファイルの構造検証
// ================================================================
describe('CSP/Security migration SSOT', () => {
  const migrationDir = path.resolve(
    __dirname,
    '../../../supabase/migrations'
  );
  const migrationFile = path.join(
    migrationDir,
    '20260304000100_csp_security_alerts_migration_ssot.sql'
  );
  const rollbackFile = path.join(
    migrationDir,
    '20260304000100_csp_security_alerts_migration_ssot_rollback.sql'
  );

  test('migration ファイルが存在する', () => {
    expect(fs.existsSync(migrationFile)).toBe(true);
  });

  test('rollback ファイルが存在する', () => {
    expect(fs.existsSync(rollbackFile)).toBe(true);
  });

  describe('migration SQL content', () => {
    let sql: string;

    beforeAll(() => {
      sql = fs.readFileSync(migrationFile, 'utf-8');
    });

    test('csp_violations に clinic_id カラムが定義されている', () => {
      expect(sql).toMatch(/csp_violations[\s\S]*?clinic_id/);
    });

    test('security_alerts に clinic_id カラムが定義されている', () => {
      expect(sql).toMatch(/security_alerts[\s\S]*?clinic_id/);
    });

    test('security_alerts type CHECK に system が含まれる', () => {
      // CHECK constraint should include 'system' type
      expect(sql).toMatch(/['"]system['"]/);
    });

    test('RLS が can_access_clinic() パターンを使用する', () => {
      expect(sql).toMatch(/can_access_clinic/);
    });

    test('RLS に clinic_users 参照がない', () => {
      expect(sql).not.toMatch(/clinic_users/);
    });
  });
});

// ================================================================
// Red 2: API が clinic_id を渡す
// ================================================================
describe('CSP APIs clinic_id integration', () => {
  const mockSupabaseClient = {
    from: jest.fn(),
    functions: { invoke: jest.fn() },
    channel: jest.fn(() => ({ send: jest.fn() })),
  };

  jest.mock('@/lib/supabase', () => ({
    // createClient is called both as sync (SecurityNotificationManager constructor)
    // and as async (csp-report route). Return the mock directly for sync usage.
    createClient: jest.fn(() => mockSupabaseClient),
    getServerClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
    getCurrentUser: jest.fn(() =>
      Promise.resolve({ id: 'user-1', email: 'test@example.com' })
    ),
    getUserPermissions: jest.fn(() =>
      Promise.resolve({
        clinic_id: 'clinic-1',
        role: 'clinic_admin',
      })
    ),
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

  jest.mock('@/lib/security/csp-config', () => ({
    CSPConfig: { handleCSPViolation: jest.fn() },
    CSPViolationReport: {},
  }));

  jest.mock('@/lib/rate-limiting/csp-rate-limiter', () => ({
    cspRateLimiter: {
      checkCSPReportLimit: jest.fn(() =>
        Promise.resolve({
          allowed: true,
          remainingRequests: 99,
          resetTime: Date.now() + 300000,
        })
      ),
    },
  }));

  jest.mock('@/lib/logger', () => ({
    logger: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    },
  }));

  jest.mock('@/lib/supabase/guards', () => ({
    ensureClinicAccess: jest.fn(),
  }));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('csp-report route が INSERT に clinic_id を含む', async () => {
    const insertPayloads: Record<string, unknown>[] = [];

    const mockBuilder = {
      insert: jest.fn((payload: unknown) => {
        if (Array.isArray(payload)) {
          insertPayloads.push(...payload);
        } else {
          insertPayloads.push(payload as Record<string, unknown>);
        }
        return mockBuilder;
      }),
      select: jest.fn(() =>
        Promise.resolve({ data: [{ id: 'v-1' }], error: null })
      ),
    };

    mockSupabaseClient.from.mockReturnValue(mockBuilder);

    const { NextRequest } = await import('next/server');
    const { POST } = await import('@/app/api/security/csp-report/route');

    const request = new NextRequest('http://localhost/api/security/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        'document-uri': 'https://example.com',
        'violated-directive': 'script-src',
        'blocked-uri': 'https://evil.com/script.js',
      }),
    });

    await POST(request);

    // Check that at least one insert payload has clinic_id field
    expect(insertPayloads.length).toBeGreaterThan(0);
    expect(insertPayloads[0]).toHaveProperty('clinic_id');
  });

  test('security-alerts が INSERT に clinic_id を含む', async () => {
    const insertPayloads: Record<string, unknown>[] = [];

    const mockBuilder = {
      insert: jest.fn((payload: unknown) => {
        if (Array.isArray(payload)) {
          insertPayloads.push(...payload);
        } else {
          insertPayloads.push(payload as Record<string, unknown>);
        }
        return mockBuilder;
      }),
      select: jest.fn(() =>
        Promise.resolve({ data: null, error: null })
      ),
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null }),
    };

    mockSupabaseClient.from.mockReturnValue(mockBuilder);

    // Import SecurityNotificationManager and test saveToDatabase
    const { SecurityNotificationManager } = await import(
      '@/lib/notifications/security-alerts'
    );
    const manager = new SecurityNotificationManager();

    // Call notifyCSPViolation which internally calls saveToDatabase
    await (manager as any).saveToDatabase({
      type: 'csp_violation',
      severity: 'high',
      title: 'Test alert',
      message: 'Test message',
      details: {},
      clientIP: '1.2.3.4',
      timestamp: new Date().toISOString(),
      source: 'test',
    });

    expect(insertPayloads.length).toBeGreaterThan(0);
    expect(insertPayloads[0]).toHaveProperty('clinic_id');
  });
});

// ================================================================
// Red 3: 管理 API が clinic_id でフィルタ
// ================================================================
describe('CSP admin APIs clinic_id filtering', () => {
  const mockQueryBuilder = {
    select: jest.fn(),
    from: jest.fn(),
    eq: jest.fn(),
    gte: jest.fn(),
    in: jest.fn(),
    ilike: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    range: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
  };

  // Make all methods chainable
  beforeAll(() => {
    for (const key of Object.keys(mockQueryBuilder)) {
      (mockQueryBuilder as any)[key] = jest.fn(() => mockQueryBuilder);
    }
    // select should also support count
    mockQueryBuilder.select = jest.fn(() => mockQueryBuilder);
  });

  test('csp-stats route uses clinic_id filter', async () => {
    // Read route source to verify .eq('clinic_id', ...) pattern
    const routePath = path.resolve(
      __dirname,
      '../../app/api/admin/security/csp-stats/route.ts'
    );
    const source = fs.readFileSync(routePath, 'utf-8');
    expect(source).toMatch(/\.eq\(['"]clinic_id['"]/);
  });

  test('csp-violations route uses clinic_id filter', async () => {
    const routePath = path.resolve(
      __dirname,
      '../../app/api/admin/security/csp-violations/route.ts'
    );
    const source = fs.readFileSync(routePath, 'utf-8');
    expect(source).toMatch(/\.eq\(['"]clinic_id['"]/);
  });
});

// ================================================================
// Archive headers on old schema files
// ================================================================
describe('Legacy schema files have deprecation headers', () => {
  test('csp-violations-schema.sql has DEPRECATED header', () => {
    const filePath = path.resolve(
      __dirname,
      '../../lib/database/csp-violations-schema.sql'
    );
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/DEPRECATED/);
  });

  test('security-alerts-schema.sql has DEPRECATED header', () => {
    const filePath = path.resolve(
      __dirname,
      '../../lib/database/security-alerts-schema.sql'
    );
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/DEPRECATED/);
  });
});
