/**
 * F-03: /api/admin/tables の旧RPC依存排除テスト
 * spec: docs/stabilization/spec-schema-frontend-alignment-v0.2.md
 *
 * 受け入れ条件:
 * - get_manageable_tables / get_table_columns RPC が排除されていること
 * - 旧テーブル名 (treatment_menus / staff_members / patient_profiles) が排除されていること
 */

import * as fs from 'fs';
import * as path from 'path';

const TARGET_FILES = [
  'src/lib/table-metadata.ts',
  'src/lib/validation/table-schemas.ts',
  'src/app/api/admin/tables/route.ts',
];

const BANNED_PATTERNS = [
  'get_manageable_tables',
  'get_table_columns',
  'treatment_menus',
  'staff_members',
  'patient_profiles',
];

function readFile(relativePath: string): string {
  const fullPath = path.resolve(process.cwd(), relativePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

describe('F-03: /api/admin/tables 旧RPC依存排除', () => {
  for (const filePath of TARGET_FILES) {
    describe(`${filePath}`, () => {
      for (const pattern of BANNED_PATTERNS) {
        it(`"${pattern}" が存在しないこと`, () => {
          const content = readFile(filePath);
          expect(content).not.toContain(pattern);
        });
      }
    });
  }

  it('table-metadata.ts が RPC ではなく静的テーブル定義を使用していること', () => {
    const content = readFile('src/lib/table-metadata.ts');
    // rpc() 呼び出しが存在しないこと
    expect(content).not.toMatch(/\.rpc\s*\(/);
  });

  it('table-schemas.ts の tableSchemas に現行スキーマ名が含まれること', () => {
    const content = readFile('src/lib/validation/table-schemas.ts');
    // 現行の管理対象テーブル名が含まれること
    expect(content).toContain('menus');
    expect(content).toContain('staff');
    expect(content).toContain('patients');
  });

  it('table-metadata.ts が Supabase 型と整合する列名を使うこと', () => {
    const content = readFile('src/lib/table-metadata.ts');

    expect(content).toContain('category:');
    expect(content).toContain('settings:');
    expect(content).toContain('phone_number');
    expect(content).toContain('working_hours');

    expect(content).not.toContain('setting_key');
    expect(content).not.toContain('setting_value');
    expect(content).not.toContain('employee_id');
    expect(content).not.toContain('first_name');
    expect(content).not.toContain('last_name');
    expect(content).not.toContain('patient_number');
    expect(content).not.toContain('resource_type');
  });

  it('table-schemas.ts が管理対象テーブルをすべてサポートすること', () => {
    const content = readFile('src/lib/validation/table-schemas.ts');

    expect(content).toContain('resources:');
    expect(content).toContain('clinic_settings:');
  });

  it('staff の管理定義が認証機密列を露出しないこと', () => {
    const metadata = readFile('src/lib/table-metadata.ts');
    const schemas = readFile('src/lib/validation/table-schemas.ts');
    const staffMetadataSection = metadata.match(
      /staff:\s*\{[\s\S]*?patients:\s*\{/
    )?.[0];

    expect(staffMetadataSection).toBeDefined();
    expect(staffMetadataSection).not.toContain('password_hash');
    expect(staffMetadataSection).not.toContain('is_active');
    expect(schemas).not.toContain('password_hash');
  });

  it('staffSchema が実テーブルに存在する列だけを扱うこと', () => {
    const schemas = readFile('src/lib/validation/table-schemas.ts');

    expect(schemas).toContain('name: z');
    expect(schemas).toContain('is_therapist: z.boolean().optional()');
    expect(schemas).not.toContain('employee_id');
    expect(schemas).not.toContain('first_name');
    expect(schemas).not.toContain('last_name');
    expect(schemas).not.toContain('specialization');
  });
});
