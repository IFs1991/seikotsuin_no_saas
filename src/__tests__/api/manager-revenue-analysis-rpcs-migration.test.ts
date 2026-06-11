/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('manager revenue analysis RPC migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260611000200_manager_revenue_analysis_rpcs.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260611000200_manager_revenue_analysis_rpcs_rollback.sql'
  );
  const specPath = path.resolve(
    __dirname,
    '../../../docs/stabilization/spec-manager-revenue-analysis-v0.2.md'
  );
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
  const rollbackSql = fs.readFileSync(rollbackPath, 'utf-8');

  test('migration, rollback, and v0.2 spec exist', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
    expect(fs.existsSync(specPath)).toBe(true);
  });

  test('creates three service-role-only manager revenue RPCs', () => {
    expect(migrationSql).toContain(
      'create or replace function public.manager_revenue_period_totals'
    );
    expect(migrationSql).toContain(
      'create or replace function public.manager_revenue_period_series'
    );
    expect(migrationSql).toContain(
      'create or replace function public.manager_revenue_context_breakdown'
    );
    expect(migrationSql).toContain('security invoker');
    expect(migrationSql).toContain('set search_path = public');
    expect(migrationSql).toContain(
      'revoke all on function public.manager_revenue_period_totals(uuid[], date, date)'
    );
    expect(migrationSql).toContain(
      'revoke all on function public.manager_revenue_period_series(uuid[], date, date, text)'
    );
    expect(migrationSql).toContain(
      'revoke all on function public.manager_revenue_context_breakdown(uuid[], date, date)'
    );
    expect(migrationSql).toMatch(
      /grant execute on function public\.manager_revenue_period_totals\(uuid\[\], date, date\)\s+to service_role;/
    );
    expect(migrationSql).toMatch(
      /grant execute on function public\.manager_revenue_period_series\(uuid\[\], date, date, text\)\s+to service_role;/
    );
    expect(migrationSql).toMatch(
      /grant execute on function public\.manager_revenue_context_breakdown\(uuid\[\], date, date\)\s+to service_role;/
    );
  });

  test('aggregates from daily report revenue sources without inferring auth scope', () => {
    expect(migrationSql).toContain('from public.daily_reports');
    expect(migrationSql).toContain(
      'public.daily_report_revenue_context_summary'
    );
    expect(migrationSql).toContain(
      'public.daily_report_revenue_breakdown_summary'
    );
    expect(migrationSql).toContain(
      'public.daily_report_revenue_estimate_summary'
    );
    expect(migrationSql).toContain(
      'coalesce(dr.insurance_revenue, 0) + coalesce(dr.private_revenue, 0)'
    );
    expect(migrationSql).toContain("(now() at time zone 'Asia/Tokyo')::date");
    expect(migrationSql).toContain("date_trunc('week'");
    expect(migrationSql).not.toContain('auth.uid()');
  });

  test('rollback drops exactly the added manager revenue RPCs', () => {
    expect(rollbackSql).toContain(
      'drop function if exists public.manager_revenue_context_breakdown(uuid[], date, date)'
    );
    expect(rollbackSql).toContain(
      'drop function if exists public.manager_revenue_period_series(uuid[], date, date, text)'
    );
    expect(rollbackSql).toContain(
      'drop function if exists public.manager_revenue_period_totals(uuid[], date, date)'
    );
    expect(rollbackSql).not.toContain('manager_clinic_assignments');
    expect(rollbackSql).not.toContain('daily_reports');
  });
});
