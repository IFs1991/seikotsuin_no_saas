/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('manager patient analysis period charts migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260611000100_manager_patient_analysis_period_charts.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260611000100_manager_patient_analysis_period_charts_rollback.sql'
  );
  const specPath = path.resolve(
    __dirname,
    '../../../docs/stabilization/spec-manager-patient-analysis-period-charts-v0.2.md'
  );

  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
  const rollbackSql = fs.readFileSync(rollbackPath, 'utf-8');

  test('migration, rollback, and v0.2 spec exist', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
    expect(fs.existsSync(specPath)).toBe(true);
  });

  test('creates service-role-only period totals and series RPCs', () => {
    expect(migrationSql).toContain(
      'create or replace function public.manager_patient_period_totals'
    );
    expect(migrationSql).toContain(
      'create or replace function public.manager_patient_period_series'
    );
    expect(migrationSql).toContain('stable');
    expect(migrationSql).toContain('security invoker');
    expect(migrationSql).toContain(
      'revoke all on function public.manager_patient_period_totals(uuid[], timestamptz, timestamptz)'
    );
    expect(migrationSql).toContain(
      'revoke all on function public.manager_patient_period_series(uuid[], timestamptz, timestamptz, text)'
    );
    expect(migrationSql).toMatch(
      /grant execute on function public\.manager_patient_period_totals\(uuid\[\], timestamptz, timestamptz\)\s+to service_role;/
    );
    expect(migrationSql).toMatch(
      /grant execute on function public\.manager_patient_period_series\(uuid\[\], timestamptz, timestamptz, text\)\s+to service_role;/
    );
  });

  test('uses reservations as source of truth with full-history first visit ranking', () => {
    expect(migrationSql).toContain('from public.reservations r');
    expect(migrationSql).toContain(
      "r.status::text in ('completed', 'arrived')"
    );
    expect(migrationSql).toContain('r.is_deleted = false');
    expect(migrationSql).toContain(
      'and (p_end is null or r.start_time <= p_end)'
    );
    expect(migrationSql).toContain('row_number() over (');
    expect(migrationSql).toContain('partition by r.clinic_id, r.customer_id');
    expect(migrationSql).toContain('order by r.start_time, r.id');
    expect(migrationSql).toContain('coalesce(r.actual_price, r.price, 0)');
    expect(migrationSql).toContain("at time zone 'Asia/Tokyo'");
  });

  test('rollback drops only the new period aggregation RPCs', () => {
    expect(rollbackSql).toContain(
      'drop function if exists public.manager_patient_period_series'
    );
    expect(rollbackSql).toContain(
      'drop function if exists public.manager_patient_period_totals'
    );
    expect(rollbackSql).not.toContain('manager_clinic_assignments');
    expect(rollbackSql).not.toContain('app_private.can_access_clinic');
  });
});
