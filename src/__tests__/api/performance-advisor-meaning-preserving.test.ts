/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Performance Advisor meaning-preserving migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260413000300_performance_advisor_meaning_preserving.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260413000300_performance_advisor_meaning_preserving_rollback.sql'
  );

  test('migration と rollback が存在する', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
  });

  test('duplicate index cleanup だけを行う', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toMatch(/drop index if exists public\.idx_reservations_status_clinic;/);
    expect(sql).toMatch(/drop index if exists public\.idx_resources_clinic;/);
  });

  test('RLS init-plan fix は ALTER POLICY ベースで行う', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toMatch(/alter policy %I on %I\.%I using/);
    expect(sql).not.toMatch(/drop policy/i);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/\(select auth\.uid\(\)\)/);
    expect(sql).toMatch(/\(select auth\.role\(\)\)/);
  });

  test('multiple permissive policy を自動統合しない', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).not.toMatch(/staff_shifts_select_policy/);
    expect(sql).not.toMatch(/staff_preferences_select_policy/);
    expect(sql).not.toMatch(/improvement_backlog_admin_all/);
  });

  test('rollback が index と auth wrapper を戻す', () => {
    const sql = fs.readFileSync(rollbackPath, 'utf-8');

    expect(sql).toMatch(/create index if not exists idx_reservations_status_clinic/);
    expect(sql).toMatch(/create index if not exists idx_resources_clinic/);
    expect(sql).toMatch(/replace\(old_qual, '\(select auth\.uid\(\)\)', 'auth\.uid\(\)'\)/);
    expect(sql).toMatch(/replace\(old_with_check, '\(select auth\.role\(\)\)', 'auth\.role\(\)'\)/);
  });
});
