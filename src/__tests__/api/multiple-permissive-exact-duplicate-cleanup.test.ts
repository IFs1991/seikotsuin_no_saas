/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Multiple permissive exact duplicate cleanup migration', () => {
  const specPath = path.resolve(
    __dirname,
    '../../../docs/stabilization/spec-performance-advisor-multiple-permissive-exact-duplicates-v0.1.md'
  );
  const rollbackPlanPath = path.resolve(
    __dirname,
    '../../../docs/stabilization/rollback-performance-advisor-multiple-permissive-exact-duplicates-v0.1.md'
  );
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260413000500_multiple_permissive_exact_duplicate_cleanup.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260413000500_multiple_permissive_exact_duplicate_cleanup_rollback.sql'
  );

  test('spec / rollback plan / migration / rollback が存在する', () => {
    expect(fs.existsSync(specPath)).toBe(true);
    expect(fs.existsSync(rollbackPlanPath)).toBe(true);
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
  });

  test('migration は対象 6 件の exact duplicate だけを削除する', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toMatch(/staff_shifts_delete_policy/);
    expect(sql).toMatch(/staff_shifts_insert_policy/);
    expect(sql).toMatch(/staff_shifts_select_policy/);
    expect(sql).toMatch(/staff_shifts_update_policy/);
    expect(sql).toMatch(/staff_preferences_delete_policy/);
    expect(sql).toMatch(/staff_preferences_select_policy/);

    expect(sql).not.toMatch(/staff_preferences_insert_policy/);
    expect(sql).not.toMatch(/staff_preferences_update_policy/);
    expect(sql).not.toMatch(/clinic_settings_/);
    expect(sql).not.toMatch(/improvement_backlog_/);
    expect(sql).not.toMatch(/menus_select_for_staff/);
    expect(sql).not.toMatch(/menus_select_for_managers/);
  });

  test('migration は pg_policies で完全一致検証してから drop する', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toMatch(/create temporary table _exact_duplicate_policy_pairs/);
    expect(sql).toMatch(/array_to_string\(roles, ','\) as roles/);
    expect(sql).toMatch(/except/);
    expect(sql).toMatch(/is not an exact duplicate/);
    expect(sql).toMatch(/drop policy if exists "staff_shifts_delete_policy"/);
    expect(sql).toMatch(/drop policy if exists "staff_preferences_select_policy"/);
  });

  test('rollback は 6 件の duplicate policy だけを baseline 定義で復元する', () => {
    const sql = fs.readFileSync(rollbackPath, 'utf-8');

    expect(sql).toMatch(/create policy "staff_shifts_delete_policy"/);
    expect(sql).toMatch(/create policy "staff_shifts_insert_policy"/);
    expect(sql).toMatch(/create policy "staff_shifts_select_policy"/);
    expect(sql).toMatch(/create policy "staff_shifts_update_policy"/);
    expect(sql).toMatch(/create policy "staff_preferences_delete_policy"/);
    expect(sql).toMatch(/create policy "staff_preferences_select_policy"/);

    expect(sql).not.toMatch(/create policy "staff_preferences_insert_policy"/);
    expect(sql).not.toMatch(/create policy "staff_preferences_update_policy"/);
    expect(sql).not.toMatch(/clinic_settings_/);
    expect(sql).not.toMatch(/menus_select_for_staff/);
  });
});
