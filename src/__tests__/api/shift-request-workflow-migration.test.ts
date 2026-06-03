/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('manager shift request workflow migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260602000100_shift_request_workflow.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260602000100_shift_request_workflow_rollback.sql'
  );

  test('migration and rollback files exist', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
  });

  test('new RLS policies use app_private helper functions', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    const rollbackSql = fs.readFileSync(rollbackPath, 'utf-8');

    expect(sql).toContain('app_private.get_current_role()');
    expect(sql).toContain('app_private.can_access_clinic(clinic_id)');
    expect(sql).not.toContain('public.get_current_role()');
    expect(sql).not.toContain('public.can_access_clinic(clinic_id)');
    expect(rollbackSql).toContain('app_private.can_access_clinic(clinic_id)');
  });

  test('conversion RPC excludes unavailable and day_off requests', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain("sr.request_type in ('available', 'preferred')");
    expect(sql).toContain(
      "blocker.request_type in ('unavailable', 'day_off')"
    );
    expect(sql).toContain("new.request_type in ('unavailable', 'day_off')");
  });

  test('conversion RPC role check does not use <> any', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).not.toContain('p_actor_role <> any');
    expect(sql).toContain(
      "p_actor_role is null or p_actor_role <> all (array['admin', 'manager'])"
    );
  });

  test('migration adds partial indexes for conversion hot paths', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    const rollbackSql = fs.readFileSync(rollbackPath, 'utf-8');

    expect(sql).toContain('shift_requests_convertible_idx');
    expect(sql).toContain('shift_requests_approved_constraints_idx');
    expect(sql).toContain('staff_shifts_conversion_overlap_idx');
    expect(sql).toContain("where status = 'approved'");
    expect(sql).toContain("where status <> 'cancelled'");
    expect(rollbackSql).toContain('drop index if exists public.shift_requests_convertible_idx');
    expect(rollbackSql).toContain(
      'drop index if exists public.shift_requests_approved_constraints_idx'
    );
    expect(rollbackSql).toContain(
      'drop index if exists public.staff_shifts_conversion_overlap_idx'
    );
  });
});
