/**
 * R-07: supabase:types 生成物の検証テスト
 *
 * 検証項目:
 * 1. 生成ファイルの先頭が `export type Json` で始まること（ログ混入なし）
 * 2. 必須テーブルがすべて含まれていること
 * 3. Database型が正しい構造を持つこと
 */
import * as fs from 'fs';
import * as path from 'path';

const TYPES_FILE = path.resolve(__dirname, '../../types/supabase.ts');

describe('R-07: supabase:types 生成物の検証', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(TYPES_FILE, 'utf-8');
  });

  test('生成ファイルが存在する', () => {
    expect(fs.existsSync(TYPES_FILE)).toBe(true);
  });

  test('先頭行が export type Json で始まる（ログ混入なし）', () => {
    const firstLine = content.split('\n')[0].trim();
    expect(firstLine).toBe('export type Json =');
  });

  test('Database 型が export されている', () => {
    expect(content).toContain('export type Database = {');
  });

  test('public スキーマが定義されている', () => {
    expect(content).toMatch(/public:\s*\{/);
  });

  test('Tables セクションが存在する', () => {
    expect(content).toMatch(/Tables:\s*\{/);
  });

  test('Views セクションが存在する', () => {
    expect(content).toMatch(/Views:\s*\{/);
  });

  test('Functions セクションが存在する', () => {
    expect(content).toMatch(/Functions:\s*\{/);
  });

  describe('必須テーブルの存在確認', () => {
    const requiredTables = [
      'clinics',
      'reservations',
      'blocks',
      'customers',
      'menus',
      'resources',
      'profiles',
      'user_permissions',
      'daily_reports',
      'staff',
      'mfa_setup_sessions',
      'user_mfa_settings',
      'security_events',
      'notifications',
      'audit_logs',
    ];

    test.each(requiredTables)('テーブル "%s" が定義されている', tableName => {
      const pattern = new RegExp(`^\\s+${tableName}:\\s*\\{`, 'm');
      expect(content).toMatch(pattern);
    });
  });

  describe('必須ビューの存在確認', () => {
    const requiredViews = [
      'reservation_list_view',
      'staff_performance_summary',
    ];

    test.each(requiredViews)('ビュー "%s" が定義されている', viewName => {
      const viewsSection = content.substring(content.indexOf('Views: {'));
      const pattern = new RegExp(`^\\s+${viewName}:\\s*\\{`, 'm');
      expect(viewsSection).toMatch(pattern);
    });
  });

  test('各テーブルに Row/Insert/Update が定義されている', () => {
    const tablesMatch = content.match(/Tables:\s*\{([\s\S]*?)Views:\s*\{/);
    expect(tablesMatch).toBeTruthy();
    const tablesSection = tablesMatch![1];

    expect(tablesSection).toContain('Row: {');
    expect(tablesSection).toContain('Insert: {');
    expect(tablesSection).toContain('Update: {');
  });

  test('ファイル末尾に不正なログ出力がないこと', () => {
    const lastLines = content.split('\n').slice(-5).join('\n');
    expect(lastLines).not.toMatch(/console\.|Error:|Warning:|supabase\s/i);
  });
});
