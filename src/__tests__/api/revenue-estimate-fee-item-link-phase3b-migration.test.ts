import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260523000200_revenue_estimate_fee_item_link_phase3b.sql'
  ),
  'utf8'
);

const rollbackSql = readFileSync(
  join(
    process.cwd(),
    'supabase/rollbacks/20260523000200_revenue_estimate_fee_item_link_phase3b_rollback.sql'
  ),
  'utf8'
);

const specSql = readFileSync(
  join(
    process.cwd(),
    'docs/stabilization/spec-revenue-estimate-fee-item-link-phase3b-v0.9.md'
  ),
  'utf8'
);

describe('revenue estimate fee item link Phase 3B migration', () => {
  test('adds nullable estimate-level schedule provenance', () => {
    expect(migrationSql).toContain(
      'add column if not exists used_schedule_code text'
    );
    expect(migrationSql).toContain(
      'add column if not exists source_snapshot_hash text'
    );
    expect(migrationSql).toContain(
      'revenue_estimates_used_schedule_code_fkey'
    );
    expect(migrationSql).toContain(
      'references public.insurance_fee_schedules(schedule_code)'
    );
    expect(migrationSql).toContain(
      'revenue_estimates_source_snapshot_hash_fkey'
    );
    expect(migrationSql).toContain(
      'validate_revenue_estimate_insurance_fee_refs'
    );
    expect(migrationSql).toContain(
      'revenue_estimates insurance fee schedule context mismatch'
    );
    expect(migrationSql).toContain(
      'revenue_estimates insurance fee schedule date mismatch'
    );
  });

  test('adds nullable estimate line item provenance', () => {
    expect(migrationSql).toContain(
      'add column if not exists insurance_fee_item_id uuid'
    );
    expect(migrationSql).toContain(
      'add column if not exists schedule_code text'
    );
    expect(migrationSql).toContain(
      'add column if not exists fee_item_code text'
    );
    expect(migrationSql).toContain(
      'revenue_estimate_lines_fee_item_id_fkey'
    );
    expect(migrationSql).toContain(
      'references public.insurance_fee_items(id)'
    );
    expect(migrationSql).toContain(
      'revenue_estimate_lines_schedule_item_fkey'
    );
    expect(migrationSql).toContain(
      'validate_revenue_estimate_line_insurance_fee_refs'
    );
    expect(migrationSql).toContain(
      'revenue_estimate_lines traffic accident item links are manual only'
    );
    expect(migrationSql).toContain(
      'revenue_estimate_lines insurance fee item link requires automatic item'
    );
  });

  test('adds bounded override reason codes without replacing free text reason', () => {
    expect(migrationSql).toContain(
      'add column if not exists override_reason_code text'
    );
    expect(migrationSql).toContain(
      'revenue_estimate_overrides_reason_code_check'
    );
    expect(migrationSql).toContain("'INSURER_SPECIFIC_RULE'");
    expect(migrationSql).toContain("'MANUAL_CORRECTION'");
    expect(migrationSql).not.toContain('drop column if exists reason');
  });

  test('does not weaken revenue estimate RLS or traffic accident guards', () => {
    expect(migrationSql).not.toContain('disable row level security');
    expect(migrationSql).not.toContain(
      'public.can_access_clinic(clinic_id)'
    );
    expect(migrationSql).toContain(
      'revoke execute on function public.validate_revenue_estimate_insurance_fee_refs()'
    );
    expect(migrationSql).toContain(
      'revoke execute on function public.validate_revenue_estimate_line_insurance_fee_refs()'
    );
    expect(migrationSql).toContain('from public, anon, authenticated');
    expect(migrationSql).toContain('to service_role');
    expect(specSql).toContain(
      'automatic traffic-accident master pricing'
    );
  });

  test('rollback removes only Phase 3B link metadata', () => {
    expect(rollbackSql).toContain(
      'drop trigger if exists revenue_estimate_lines_insurance_fee_ref_check'
    );
    expect(rollbackSql).toContain(
      'drop function if exists public.validate_revenue_estimate_line_insurance_fee_refs()'
    );
    expect(rollbackSql).toContain(
      'drop constraint if exists revenue_estimate_lines_schedule_item_fkey'
    );
    expect(rollbackSql).toContain(
      'drop column if exists insurance_fee_item_id'
    );
    expect(rollbackSql).toContain(
      'drop column if exists used_schedule_code'
    );
    expect(rollbackSql).toContain(
      'drop column if exists override_reason_code'
    );
    expect(rollbackSql).not.toContain('drop table');
  });
});
