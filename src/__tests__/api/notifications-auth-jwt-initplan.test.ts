/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Notifications auth.jwt init-plan migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260413000400_notifications_auth_jwt_initplan.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260413000400_notifications_auth_jwt_initplan_rollback.sql'
  );

  test('migration と rollback が存在する', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
  });

  test('notifications の対象 policy だけを更新する', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toMatch(/alter policy "Users can view their own notifications"/);
    expect(sql).toMatch(/on public\.notifications/);
    expect(sql).toMatch(/\(\(select auth\.jwt\(\)\) ->> 'clinic_id'::text\)/);
    expect(sql).toMatch(/\(\(select auth\.jwt\(\)\) ->> 'user_role'::text\)/);
    expect(sql).not.toMatch(/drop policy/i);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/staff_shifts_/);
  });

  test('rollback が direct auth.jwt() 呼び出しを復元する', () => {
    const sql = fs.readFileSync(rollbackPath, 'utf-8');

    expect(sql).toMatch(/alter policy "Users can view their own notifications"/);
    expect(sql).toMatch(/\(auth\.jwt\(\) ->> 'clinic_id'::text\)/);
    expect(sql).toMatch(/\(auth\.jwt\(\) ->> 'user_role'::text\)/);
    expect(sql).not.toMatch(/\(select auth\.jwt\(\)\)/);
  });
});
