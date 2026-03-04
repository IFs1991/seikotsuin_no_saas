/**
 * Supabase クライアント型境界テスト
 *
 * Database ジェネリクスの適用と as any 除去を検証
 */

/** @jest-environment node */

import { describe, test, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// ================================================================
// Red 1: クライアントにジェネリクスが適用されている
// ================================================================
describe('Supabase client Database generics', () => {
  test('server.ts が createServerClient<Database> を使用する', () => {
    const filePath = path.resolve(
      __dirname,
      '../../lib/supabase/server.ts'
    );
    const source = fs.readFileSync(filePath, 'utf-8');
    expect(source).toMatch(/createServerClient<Database>/);
  });

  test('supabase-browser.ts が createSupabaseClient<Database> を使用する', () => {
    const filePath = path.resolve(
      __dirname,
      '../../lib/supabase-browser.ts'
    );
    const source = fs.readFileSync(filePath, 'utf-8');
    expect(source).toMatch(/createSupabaseClient<Database>/);
  });

  test('server.ts が Database 型をインポートしている', () => {
    const filePath = path.resolve(
      __dirname,
      '../../lib/supabase/server.ts'
    );
    const source = fs.readFileSync(filePath, 'utf-8');
    expect(source).toMatch(/import.*Database.*from.*['"]@\/types\/supabase['"]/);
  });

  test('supabase-browser.ts が Database 型をインポートしている', () => {
    const filePath = path.resolve(
      __dirname,
      '../../lib/supabase-browser.ts'
    );
    const source = fs.readFileSync(filePath, 'utf-8');
    expect(source).toMatch(/import.*Database.*from.*['"]@\/types\/supabase['"]/);
  });
});

// ================================================================
// Red 2: as any がゼロ
// ================================================================
describe('as any elimination', () => {
  test('csp-violations route に as any がない', () => {
    const filePath = path.resolve(
      __dirname,
      '../../app/api/admin/security/csp-violations/route.ts'
    );
    const source = fs.readFileSync(filePath, 'utf-8');
    expect(source).not.toMatch(/as any/);
  });

  test('master-data route に as any がない', () => {
    const filePath = path.resolve(
      __dirname,
      '../../app/api/admin/master-data/route.ts'
    );
    const source = fs.readFileSync(filePath, 'utf-8');
    expect(source).not.toMatch(/as any/);
  });
});

// ================================================================
// Red 3: supabase.ts に csp_violations / security_alerts 型定義
// ================================================================
describe('Database type definitions', () => {
  test('supabase.ts に csp_violations テーブル型がある', () => {
    const filePath = path.resolve(
      __dirname,
      '../../types/supabase.ts'
    );
    const source = fs.readFileSync(filePath, 'utf-8');
    expect(source).toMatch(/csp_violations/);
  });

  test('supabase.ts に security_alerts テーブル型がある', () => {
    const filePath = path.resolve(
      __dirname,
      '../../types/supabase.ts'
    );
    const source = fs.readFileSync(filePath, 'utf-8');
    expect(source).toMatch(/security_alerts/);
  });
});
