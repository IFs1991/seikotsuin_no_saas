import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260523000100_insurance_fee_system_master_phase3a2.sql'
  ),
  'utf8'
);

const rollbackSql = readFileSync(
  join(
    process.cwd(),
    'supabase/rollbacks/20260523000100_insurance_fee_system_master_phase3a2_rollback.sql'
  ),
  'utf8'
);

describe('insurance fee system master Phase 3A-2 migration', () => {
  test('adds a forward guard for schedule context conversion to traffic accident', () => {
    expect(migrationSql).toContain(
      'validate_insurance_fee_schedule_context_mutation'
    );
    expect(migrationSql).toContain(
      'insurance_fee_schedules_context_mutation_guard'
    );
    expect(migrationSql).toContain(
      "old.payer_context_code <> 'traffic_accident'"
    );
    expect(migrationSql).toContain(
      "new.payer_context_code = 'traffic_accident'"
    );
    expect(migrationSql).toContain(
      'new.payer_context_code is not distinct from old.payer_context_code'
    );
    expect(migrationSql).toContain('item.amount_yen is not null');
    expect(migrationSql).toContain(
      'item.manual_amount_required = false'
    );
    expect(migrationSql).toContain(
      'item.auto_calculation_allowed = true'
    );
  });

  test('keeps the guard function unavailable to public client roles', () => {
    expect(migrationSql).toContain(
      'revoke execute on function public.validate_insurance_fee_schedule_context_mutation()'
    );
    expect(migrationSql).toContain('from public, anon, authenticated');
    expect(migrationSql).toContain(
      'grant execute on function public.validate_insurance_fee_schedule_context_mutation()'
    );
    expect(migrationSql).toContain('to service_role');
  });

  test('rollback drops only the Phase 3A-2 guard objects', () => {
    expect(rollbackSql).toContain(
      'drop trigger if exists insurance_fee_schedules_context_mutation_guard'
    );
    expect(rollbackSql).toContain(
      'drop index if exists public.idx_insurance_fee_items_schedule_auto_amount_guard'
    );
    expect(rollbackSql).toContain(
      'drop function if exists public.validate_insurance_fee_schedule_context_mutation()'
    );
    expect(rollbackSql).not.toContain('drop table');
  });

  test('adds a partial index for the context guard lookup', () => {
    expect(migrationSql).toContain(
      'idx_insurance_fee_items_schedule_auto_amount_guard'
    );
    expect(migrationSql).toContain('on public.insurance_fee_items (schedule_code)');
    expect(migrationSql).toContain('where amount_yen is not null');
    expect(migrationSql).toContain('or manual_amount_required = false');
    expect(migrationSql).toContain('or auto_calculation_allowed = true');
  });
});
