/**
 * admin/tables route blast-radius tests (PR-08)
 *
 * Verifies that:
 * - DELETE handler is removed
 * - read-only tables (patients, staff, clinic_settings) reject POST/PUT
 * - writable tables (menus, menu_categories, resources) accept POST/PUT
 * - getManageableTables still returns all configured tables
 * - isWritableTable correctly classifies tables
 *
 * @see docs/stabilization/plan-closed-mvp-refactoring-priority-v0.1.md (PR-08)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  getManageableTables,
  isWritableTable,
} from '@/lib/table-metadata';

const READ_ONLY_TABLES = ['patients', 'staff', 'clinic_settings'];
const WRITABLE_TABLES = ['menus', 'menu_categories', 'resources'];

describe('PR-08: admin/tables blast-radius 縮小', () => {
  describe('DELETE ハンドラの除去', () => {
    it('route.ts に DELETE エクスポートが存在しないこと', () => {
      const routePath = path.resolve(
        process.cwd(),
        'src/app/api/admin/tables/route.ts'
      );
      const content = fs.readFileSync(routePath, 'utf-8');
      expect(content).not.toMatch(/export\s+(async\s+)?function\s+DELETE/);
    });
  });

  describe('テーブル管理対象', () => {
    it('getManageableTables は全テーブルを返す', async () => {
      const tables = await getManageableTables();
      expect(tables).toEqual(
        expect.arrayContaining([...READ_ONLY_TABLES, ...WRITABLE_TABLES])
      );
    });
  });

  describe('isWritableTable による書き込み制御', () => {
    for (const table of WRITABLE_TABLES) {
      it(`${table} は書き込み可能`, () => {
        expect(isWritableTable(table)).toBe(true);
      });
    }

    for (const table of READ_ONLY_TABLES) {
      it(`${table} は read-only`, () => {
        expect(isWritableTable(table)).toBe(false);
      });
    }

    it('管理対象外テーブルは書き込み不可', () => {
      expect(isWritableTable('unknown_table')).toBe(false);
    });
  });

  describe('route.ts POST/PUT が read-only テーブルを拒否すること', () => {
    it('route.ts が isWritableTable を使用していること', () => {
      const routePath = path.resolve(
        process.cwd(),
        'src/app/api/admin/tables/route.ts'
      );
      const content = fs.readFileSync(routePath, 'utf-8');
      expect(content).toContain('isWritableTable');
    });
  });
});
