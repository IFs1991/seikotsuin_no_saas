/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('manager revenue analysis index migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260611000300_manager_revenue_analysis_indexes.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260611000300_manager_revenue_analysis_indexes_rollback.sql'
  );
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
  const rollbackSql = fs.readFileSync(rollbackPath, 'utf-8');

  test('adds the revenue_estimate_lines(revenue_estimate_id) join index', () => {
    expect(migrationSql).toContain(
      'create index if not exists idx_revenue_estimate_lines_estimate_id'
    );
    expect(migrationSql).toContain(
      'on public.revenue_estimate_lines (revenue_estimate_id)'
    );
  });

  test('drops the index made redundant by the daily_reports unique constraint', () => {
    expect(migrationSql).toContain(
      'drop index if exists public.idx_daily_reports_clinic_date'
    );
    // UNIQUE (clinic_id, report_date) 制約の暗黙インデックスが同じ走査を担うため、
    // テーブル本体や制約には触れない。
    expect(migrationSql).not.toContain('alter table');
    expect(migrationSql).not.toContain('drop constraint');
  });

  test('rollback restores exactly the previous index state', () => {
    expect(rollbackSql).toContain(
      'drop index if exists public.idx_revenue_estimate_lines_estimate_id'
    );
    expect(rollbackSql).toContain(
      'create index if not exists idx_daily_reports_clinic_date'
    );
    expect(rollbackSql).toContain(
      'on public.daily_reports (clinic_id, report_date)'
    );
  });
});
