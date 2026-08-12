/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('function runtime contract remediation migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260812160826_function_runtime_contract_remediation.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260812160826_function_runtime_contract_remediation_rollback.sql'
  );
  const specPath = path.resolve(
    __dirname,
    '../../../docs/stabilization/spec-function-runtime-contract-remediation-v0.1.md'
  );

  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');
  const spec = fs.readFileSync(specPath, 'utf8');

  test('ships an append-only migration with its spec and rollback guard', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
    expect(fs.existsSync(specPath)).toBe(true);
    expect(migrationSql).toContain('begin;');
    expect(migrationSql).toContain('commit;');
    expect(rollbackSql).toContain('Validation-only rollback guard');
    expect(rollbackSql).toContain(
      "definition not ilike '%on conflict on constraint revenue_estimates_unique_item%'"
    );
    expect(rollbackSql).toContain("definition not ilike '%''reservation''::varchar%'");
    expect(spec).toContain('Remote Supabase migration application is a separate approval gate');
  });

  test('repairs the five runtime failures without changing public signatures', () => {
    expect(migrationSql).toContain(
      'on conflict on constraint revenue_estimates_unique_item'
    );
    expect(migrationSql).toContain("'reservation'::varchar");
    expect(migrationSql).toContain("'block'::varchar");
    expect(migrationSql).toContain('from public.patient_visit_summary summary');
    expect(migrationSql).not.toMatch(/from public\.visits\b/i);
    expect(migrationSql).toContain('clinic.name::text');
  });

  test('repairs all lint warnings while preserving conversion behavior', () => {
    expect(migrationSql).toContain(
      "greatest(coalesce(analysis_period, 30), 1)"
    );
    expect(migrationSql).toContain("at time zone 'Asia/Tokyo'");
    expect(migrationSql).not.toMatch(/day_counter\s+integer\s*;/i);
    expect(migrationSql).toContain(
      'PRAGMA:TABLE: shift_request_conversion_candidates'
    );
    expect(migrationSql).toContain(
      'PRAGMA:TABLE: shift_request_conversion_map'
    );
    expect(migrationSql).toContain('perform pg_advisory_xact_lock');
  });

  test('keeps privileged functions service-role-only and validates drift', () => {
    for (const functionName of [
      'confirm_daily_report_item_pricing',
      'convert_shift_requests',
      'get_invite_by_token',
    ]) {
      expect(migrationSql).toMatch(
        new RegExp(
          `revoke all on function public\\.${functionName}[\\s\\S]*from public, anon, authenticated;`
        )
      );
    }

    expect(migrationSql).toContain('aclexplode');
    expect(migrationSql).toContain('acl_entry.is_grantable');
    expect(migrationSql).toContain('exact function EXECUTE ACL drift');
    expect(migrationSql).toContain('security mode drift');
    expect(migrationSql).toContain('search_path drift');
    expect(migrationSql).toContain('owner drift');
    expect(rollbackSql).toContain('Refusing rollback: security mode drift');
    expect(rollbackSql).toContain('Refusing rollback: search_path drift');
    expect(rollbackSql).toContain('Refusing rollback: owner drift');
    expect(rollbackSql).toContain('aclexplode');
    expect(rollbackSql).toContain('acl_entry.is_grantable');
    expect(rollbackSql).toContain(
      'Refusing rollback: exact function EXECUTE ACL drift'
    );
  });
});
