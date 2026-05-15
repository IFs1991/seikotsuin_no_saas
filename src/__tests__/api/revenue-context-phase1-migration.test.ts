import fs from 'fs';
import path from 'path';

describe('Revenue context Phase 1 migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260514000100_revenue_context_phase1.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260514000100_revenue_context_phase1_rollback.sql'
  );
  const specPath = path.resolve(
    __dirname,
    '../../../docs/stabilization/spec-revenue-context-phase1-v0.5.md'
  );

  test('migration, rollback, and stabilization spec exist', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
    expect(fs.existsSync(specPath)).toBe(true);
  });

  test('migration adds revenue context storage without unsafe default ordering', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain('create table if not exists public.revenue_contexts');
    expect(sql).toContain('add column if not exists revenue_context_code text');
    expect(sql).toContain(
      'add column if not exists revenue_context_source text'
    );
    expect(sql).toContain('add column if not exists amount_source text');
    expect(sql).toContain('add column if not exists estimate_status text');
    expect(sql).toContain('alter column revenue_context_code set not null');
    expect(sql).toContain('daily_report_items_revenue_context_code_fkey');
    expect(sql).not.toContain(
      "add column if not exists revenue_context_code text not null default 'private'"
    );
  });

  test('migration uses app_private RLS helpers and security invoker view', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain('with (security_invoker = true)');
    expect(sql).toContain('app_private.can_access_clinic(clinic_id)');
    expect(sql).toContain('validate_daily_report_item_tags_refs');
    expect(sql).toContain('daily_report_item_tags_select_for_staff');
    expect(sql).not.toContain('public.can_access_clinic(clinic_id)');
    expect(sql).not.toContain('security_invoker = false');
  });

  test('migration preserves manual revenue classification during arrived reservation sync', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain('sync_arrived_reservation_daily_report_item');
    expect(sql).toContain("revenue_context_source in ('manual', 'override')");
    expect(sql).toContain(
      "when public.daily_report_items.revenue_context_code = 'insurance'"
    );
    expect(sql).toContain("amount_source = 'override'");
    expect(sql).toContain("estimate_status in ('overridden', 'blocked')");
    expect(sql).toContain(
      'revoke execute on function public.sync_arrived_reservation_daily_report_item()'
    );
  });

  test('migration seeds Phase 1 contexts and excludes mixed from analysis and selection', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain("'traffic_accident'");
    expect(sql).toContain("'workers_comp'");
    expect(sql).toContain("'product'");
    expect(sql).toContain("'ticket'");
    expect(sql).toContain("'mixed'");
    expect(sql).toContain('rc.is_analysis_target = true');
    expect(sql).toContain('POST /api/revenue is deprecated');
  });
});
