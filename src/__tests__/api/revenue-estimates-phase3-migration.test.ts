import fs from 'fs';
import path from 'path';

describe('Revenue estimates Phase 3 migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260514000300_revenue_estimates_phase3.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260514000300_revenue_estimates_phase3_rollback.sql'
  );
  const specPath = path.resolve(
    __dirname,
    '../../../docs/stabilization/spec-revenue-estimates-phase3-v0.5.md'
  );

  test('migration, rollback, and stabilization spec exist', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
    expect(fs.existsSync(specPath)).toBe(true);
  });

  test('migration creates revenue estimate storage with fixed disclaimer', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain(
      'create table if not exists public.revenue_estimates'
    );
    expect(sql).toContain(
      'create table if not exists public.revenue_estimate_lines'
    );
    expect(sql).toContain(
      'create table if not exists public.revenue_estimate_warnings'
    );
    expect(sql).toContain(
      'create table if not exists public.revenue_estimate_overrides'
    );
    expect(sql).toContain('経営分析用の概算です。請求確定額ではありません。');
    expect(sql).toContain('constraint revenue_estimates_unique_item');
    expect(sql).toContain('idx_revenue_estimate_warnings_estimate_id');
  });

  test('migration validates tenant consistency and keeps RLS app_private scoped', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain('validate_revenue_estimates_refs');
    expect(sql).toContain(
      'revenue_estimates.daily_report_item_id clinic mismatch'
    );
    expect(sql).toContain('validate_revenue_estimate_child_refs');
    expect(sql).toContain('revenue_estimate child clinic mismatch');
    expect(sql).toContain('app_private.can_access_clinic(clinic_id)');
    expect(sql).not.toContain('public.can_access_clinic(clinic_id)');
  });

  test('migration exposes only a security invoker summary view', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain(
      'create or replace view public.daily_report_revenue_estimate_summary'
    );
    expect(sql).toContain('with (security_invoker = true)');
    expect(sql).not.toContain('security_invoker = false');
  });

  test('rollback removes Phase 3 objects in dependency order', () => {
    const rollback = fs.readFileSync(rollbackPath, 'utf-8');

    expect(rollback).toContain(
      'drop view if exists public.daily_report_revenue_estimate_summary'
    );
    expect(rollback).toContain(
      'drop function if exists public.validate_revenue_estimate_child_refs()'
    );
    expect(rollback).toContain(
      'drop table if exists public.revenue_estimate_overrides'
    );
    expect(rollback).toContain('drop table if exists public.revenue_estimates');
  });
});
