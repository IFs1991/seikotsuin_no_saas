import fs from 'fs';
import path from 'path';

describe('app_private JWT app_metadata aware RLS helper migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260508000300_app_private_jwt_app_metadata_rls_helpers.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260508000300_app_private_jwt_app_metadata_rls_helpers_rollback.sql'
  );
  const specPath = path.resolve(
    __dirname,
    '../../../docs/stabilization/spec-revenue-rls-app-private-jwt-2026-05-08.md'
  );

  test('migration, rollback, and spec exist', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
    expect(fs.existsSync(specPath)).toBe(true);
  });

  test('migration updates active app_private helpers to read app_metadata claims', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toMatch(/create or replace function app_private\.get_current_role\(\)/);
    expect(sql).toMatch(/create or replace function app_private\.jwt_clinic_id\(\)/);
    expect(sql).toMatch(/create or replace function app_private\.can_access_clinic\(target_clinic_id uuid\)/);
    expect(sql).toContain("claims -> 'app_metadata' ->> 'user_role'");
    expect(sql).toContain("claims -> 'app_metadata' ->> 'clinic_id'");
    expect(sql).toContain("claims -> 'app_metadata' -> 'clinic_scope_ids'");
    expect(sql).toMatch(/role_val = any \(array\['admin', 'clinic_admin', 'manager', 'therapist', 'staff', 'customer'\]\)/);
    expect(sql).not.toMatch(/grant execute on function public\.can_access_clinic\(uuid\) to anon, authenticated/);
  });

  test('migration smoke test covers observed Supabase JWT shape', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain('"role": "authenticated"');
    expect(sql).toContain('"user_role": "clinic_admin"');
    expect(sql).toContain('app_private.get_current_role()');
    expect(sql).toContain('app_private.jwt_clinic_id()');
    expect(sql).toContain('app_private.can_access_clinic(');
  });

  test('rollback restores previous app_private top-level claim behavior', () => {
    const sql = fs.readFileSync(rollbackPath, 'utf-8');
    const spec = fs.readFileSync(specPath, 'utf-8');

    expect(sql).toMatch(/current_setting\('request\.jwt\.claims', true\)::json->>'clinic_id'/);
    expect(sql).toMatch(/current_setting\('request\.jwt\.claims', true\)::json->>'user_role'/);
    expect(sql).toMatch(/current_setting\('request\.jwt\.claims', true\)::json->>'role'/);
    expect(spec).toMatch(/Rollback Plan/);
    expect(spec).toMatch(/DOD-08/);
  });
});
