import fs from 'fs';
import path from 'path';

describe('Insurance fee system master Phase 3A migration', () => {
  const task1Tables = [
    'insurance_fee_sources',
    'insurance_fee_source_snapshots',
    'insurance_fee_schedules',
    'insurance_fee_items',
    'insurance_fee_warning_definitions',
    'insurance_fee_revision_diffs',
  ] as const;
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260521000100_insurance_fee_system_master_phase3a.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260521000100_insurance_fee_system_master_phase3a_rollback.sql'
  );
  const specPath = path.resolve(
    __dirname,
    '../../../docs/stabilization/spec-insurance-fee-system-master-phase3a-v0.9.md'
  );

  test('migration, rollback, and stabilization spec exist', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
    expect(fs.existsSync(specPath)).toBe(true);
  });

  test('migration creates only the Phase 3A-1 insurance fee system master tables', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    task1Tables.forEach(table => {
      expect(sql).toContain(`create table if not exists public.${table}`);
    });
  });

  test('migration keeps the Phase 3A-1 masters RLS enabled and authenticated read-only', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    task1Tables.forEach(table => {
      expect(sql).toContain(
        `alter table public.${table} enable row level security`
      );
      expect(sql).toContain(`${table}_select_for_authenticated`);
      expect(sql).toContain(`revoke all on table public.${table} from anon`);
      expect(sql).toContain(
        `revoke all on table public.${table} from authenticated`
      );
      expect(sql).toContain(
        `grant select on table public.${table} to authenticated`
      );
      expect(sql).toContain(`grant all on table public.${table} to service_role`);
    });
    expect(sql).not.toMatch(
      /grant\s+(?:all|insert|update|delete|select,\s*insert)[^;]*public\.insurance_fee_[a-z_]+[^;]*to authenticated/i
    );
  });

  test('migration constrains schedule revisions and item master amounts', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toMatch(
      /create table if not exists public\.insurance_fee_schedules[\s\S]*?effective_from date not null,[\s\S]*?effective_to date,[\s\S]*?schedule_status text not null default 'draft',[\s\S]*?constraint insurance_fee_schedules_effective_range_check/
    );
    expect(sql).toContain('constraint insurance_fee_schedules_effective_range_check');
    expect(sql).toContain(
      'check (effective_to is null or effective_to >= effective_from)'
    );
    expect(sql).toContain('constraint insurance_fee_schedules_status_check');
    expect(sql).toContain('validate_insurance_fee_schedule_active_range');
    expect(sql).toContain('protect_insurance_fee_schedule_revision');
    expect(sql).toContain('idx_insurance_fee_schedules_active_resolver');
    expect(sql).toContain("where schedule_status = 'active'");
    expect(sql).toContain('constraint insurance_fee_items_amount_check');
    expect(sql).toContain('check (amount_yen is null or amount_yen >= 0)');
    expect(sql).toContain('constraint insurance_fee_items_manual_amount_check');
  });

  test('migration keeps traffic accident items review-shaped in the master', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain('billing_scope text not null');
    expect(sql).toContain('manual_amount_required boolean not null default false');
    expect(sql).toContain('auto_calculation_allowed boolean not null default true');
    expect(sql).toContain('validate_insurance_fee_item_mutation');
    expect(sql).toContain("v_payer_context_code = 'traffic_accident'");
    expect(sql).toContain('new.amount_yen is not null');
    expect(sql).toContain('new.manual_amount_required = false');
    expect(sql).toContain('new.auto_calculation_allowed = true');
  });

  test('rollback drops Phase 3A-1 tables in dependency order', () => {
    const rollback = fs.readFileSync(rollbackPath, 'utf-8');
    const dropOrder = [
      'insurance_fee_revision_diffs',
      'insurance_fee_warning_definitions',
      'insurance_fee_items',
      'insurance_fee_schedules',
      'insurance_fee_source_snapshots',
      'insurance_fee_sources',
    ] as const;
    const tableDropOffsets = dropOrder.map(table =>
      rollback.indexOf(`drop table if exists public.${table}`)
    );

    tableDropOffsets.forEach(dropOffset => {
      expect(dropOffset).toBeGreaterThanOrEqual(0);
    });
    tableDropOffsets.slice(1).forEach((dropOffset, index) => {
      expect(tableDropOffsets[index]).toBeLessThan(dropOffset);
    });
  });
});
