import fs from 'fs';
import path from 'path';

describe('Daily report items migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260507000100_daily_report_items.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../docs/stabilization/rollbacks/20260507000100_daily_report_items_rollback.sql'
  );
  const specPath = path.resolve(
    __dirname,
    '../../../docs/stabilization/spec-daily-report-items-v0.1.md'
  );

  test('migration, rollback, and spec exist', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
    expect(fs.existsSync(specPath)).toBe(true);
  });

  test('migration creates tenant-scoped daily report item storage', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain(
      'create table if not exists public.daily_report_items'
    );
    expect(sql).toContain('daily_report_items_payment_method_id_fkey');
    expect(sql).toContain('daily_report_items_next_reservation_id_fkey');
    expect(sql).toContain('daily_report_items_clinic_reservation_unique');
    expect(sql).toContain('public.validate_daily_report_items_clinic_refs()');
  });

  test('migration adds RLS policies and aggregate triggers', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain(
      'alter table public.daily_report_items enable row level security'
    );
    expect(sql).toContain('daily_report_items_select_for_staff');
    expect(sql).toContain('daily_report_items_insert_for_staff');
    expect(sql).toContain('daily_report_items_update_for_staff');
    expect(sql).toContain('daily_report_items_delete_for_managers');
    expect(sql).toContain('public.can_access_clinic(clinic_id)');
    expect(sql).toContain('public.sync_daily_report_item_totals()');
    expect(sql).toContain(
      'public.sync_arrived_reservation_daily_report_item()'
    );
  });

  test('rollback removes triggers, functions, and the table', () => {
    const sql = fs.readFileSync(rollbackPath, 'utf-8');

    expect(sql).toContain(
      'drop trigger if exists sync_daily_report_item_from_arrived_reservation'
    );
    expect(sql).toContain(
      'drop function if exists public.sync_arrived_reservation_daily_report_item()'
    );
    expect(sql).toContain('drop table if exists public.daily_report_items');
  });
});
