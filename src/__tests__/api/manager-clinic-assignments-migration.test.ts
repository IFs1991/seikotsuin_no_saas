/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('manager clinic assignments migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260604000100_manager_clinic_assignments.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260604000100_manager_clinic_assignments_rollback.sql'
  );
  const primaryMigrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260609000100_manager_primary_clinic_assignments.sql'
  );
  const primaryRollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260609000100_manager_primary_clinic_assignments_rollback.sql'
  );
  const specPath = path.resolve(
    __dirname,
    '../../../docs/stabilization/spec-area-manager-clinic-assignments-v0.2.md'
  );

  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
  const rollbackSql = fs.readFileSync(rollbackPath, 'utf-8');

  test('migration, rollback, and copied v0.2 spec exist', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
    expect(fs.existsSync(specPath)).toBe(true);
  });

  test('migration creates assignment table, active unique index, and triggers', () => {
    expect(migrationSql).toContain(
      'create table public.manager_clinic_assignments'
    );
    expect(migrationSql).toContain('manager_clinic_assignments_active_unique');
    expect(migrationSql).toContain(
      'on public.manager_clinic_assignments (manager_user_id, clinic_id)'
    );
    expect(migrationSql).toContain(
      'maintaining a duplicate non-unique partial index'
    );
    expect(migrationSql).not.toContain(
      'manager_clinic_assignments_manager_active_idx'
    );
    expect(migrationSql).toContain('where revoked_at is null');
    expect(migrationSql).toContain(
      'execute function public.update_updated_at_column()'
    );
    expect(migrationSql).toContain(
      'app_private.assert_manager_clinic_assignment_valid()'
    );
  });

  test('integrity trigger requires manager role and active child clinics', () => {
    expect(migrationSql).toContain("up.role = 'manager'");
    expect(migrationSql).toContain('c.is_active');
    expect(migrationSql).toContain('c.parent_id');
    expect(migrationSql).toContain('clinic must be active');
    expect(migrationSql).toContain(
      'clinic assignment target must be a child clinic, not parent tenant'
    );
  });

  test('RLS policies use app_private helpers and include required grants', () => {
    expect(migrationSql).toContain(
      'alter table public.manager_clinic_assignments enable row level security'
    );
    expect(migrationSql).toContain(
      'manager_clinic_assignments_select_admin_or_self_active'
    );
    expect(migrationSql).toContain("app_private.get_current_role() = 'admin'");
    expect(migrationSql).toContain(
      'grant select, insert, update, delete on public.manager_clinic_assignments to authenticated'
    );
    expect(migrationSql).toContain(
      'grant all on public.manager_clinic_assignments to service_role'
    );
    expect(migrationSql).not.toContain('public.get_current_role()');
    expect(migrationSql).not.toContain('public.can_access_clinic(');
  });

  test('manager can_access_clinic branch uses active DB assignments before JWT fallback', () => {
    const managerBranchIndex = migrationSql.indexOf(
      "if v_current_role = 'manager' then"
    );
    const jwtFallbackIndex = migrationSql.indexOf(
      "claims -> 'app_metadata' -> 'clinic_scope_ids'"
    );

    expect(managerBranchIndex).toBeGreaterThan(-1);
    expect(jwtFallbackIndex).toBeGreaterThan(managerBranchIndex);
    expect(migrationSql).toContain('mca.manager_user_id = auth.uid()');
    expect(migrationSql).toContain('mca.clinic_id = target_clinic_id');
    expect(migrationSql).toContain('mca.revoked_at is null');
  });

  test('replacement RPC validates admin actor and performs atomic replacement', () => {
    expect(migrationSql).toContain(
      'create or replace function public.replace_manager_clinic_assignments'
    );
    expect(migrationSql).toContain('perform pg_advisory_xact_lock(');
    expect(migrationSql).toContain("up.role = 'admin'");
    expect(migrationSql).toContain('into v_manager_has_role, v_actor_is_admin');
    expect(migrationSql).toContain(
      'and not (mca.clinic_id = any(v_target_clinic_ids))'
    );
    expect(migrationSql).toContain(
      'insert into public.manager_clinic_assignments'
    );
    expect(migrationSql).toContain(
      'revoke all on function public.replace_manager_clinic_assignments(uuid, uuid[], text, uuid)'
    );
    expect(migrationSql).toMatch(
      /grant execute on function public\.replace_manager_clinic_assignments\(uuid, uuid\[\], text, uuid\)\s+to service_role;/
    );
  });

  test('rollback drops assignment artifacts and restores previous can_access_clinic helper', () => {
    expect(rollbackSql).toContain(
      'drop table if exists public.manager_clinic_assignments cascade'
    );
    expect(rollbackSql).toContain(
      'drop function if exists app_private.assert_manager_clinic_assignment_valid()'
    );
    expect(rollbackSql).toContain(
      'drop function if exists public.replace_manager_clinic_assignments(uuid, uuid[], text, uuid)'
    );
    expect(rollbackSql).toContain(
      'create or replace function app_private.can_access_clinic(target_clinic_id uuid)'
    );
    expect(rollbackSql).not.toContain(
      'from public.manager_clinic_assignments mca'
    );
    expect(rollbackSql).toContain(
      "claims -> 'app_metadata' -> 'clinic_scope_ids'"
    );
    expect(rollbackSql).toContain(
      'primary_clinic_id := app_private.get_current_clinic_id();'
    );
  });

  test('primary clinic migration keeps manager primary optional and assignment-scoped', () => {
    expect(fs.existsSync(primaryMigrationPath)).toBe(true);
    expect(fs.existsSync(primaryRollbackPath)).toBe(true);

    const primaryMigrationSql = fs.readFileSync(primaryMigrationPath, 'utf-8');
    const primaryRollbackSql = fs.readFileSync(primaryRollbackPath, 'utf-8');

    expect(primaryMigrationSql).toContain('p_primary_clinic_id uuid');
    expect(primaryMigrationSql).toContain('p_primary_clinic_id is not null');
    expect(primaryMigrationSql).toContain(
      'not (p_primary_clinic_id = any(v_target_clinic_ids))'
    );
    expect(primaryMigrationSql).toContain(
      '所属拠点は担当店舗の中から選択してください'
    );
    expect(primaryMigrationSql).toContain('update public.user_permissions up');
    expect(primaryMigrationSql).toContain('update public.profiles p');
    expect(primaryMigrationSql).toContain(
      'up.clinic_id is distinct from v_effective_primary_clinic_id'
    );
    expect(primaryMigrationSql).toContain(
      'p.clinic_id is distinct from v_effective_primary_clinic_id'
    );
    expect(primaryMigrationSql).toContain(
      'public.replace_manager_clinic_assignments(uuid, uuid[], text, uuid, uuid)'
    );
    expect(primaryMigrationSql).toContain(
      'public.replace_manager_clinic_assignments(uuid, uuid[], text, uuid)'
    );
    expect(primaryRollbackSql).toContain(
      'drop function if exists public.replace_manager_clinic_assignments(uuid, uuid[], text, uuid, uuid)'
    );
    expect(primaryRollbackSql).toContain(
      'create or replace function public.replace_manager_clinic_assignments('
    );
    expect(primaryRollbackSql).not.toContain('p_primary_clinic_id uuid');
  });
});
