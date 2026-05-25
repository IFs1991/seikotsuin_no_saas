import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260525000100_phase4a_menu_billing_patient_coverage_snapshot.sql'
  ),
  'utf8'
);

const rollbackSql = readFileSync(
  join(
    process.cwd(),
    'supabase/rollbacks/20260525000100_phase4a_menu_billing_patient_coverage_snapshot_rollback.sql'
  ),
  'utf8'
);

const specMd = readFileSync(
  join(
    process.cwd(),
    'docs/stabilization/spec-phase4a-menu-billing-patient-coverage-snapshot-v0.1.md'
  ),
  'utf8'
);

describe('Phase 4A menu billing and patient coverage snapshot migration', () => {
  test('creates menu billing profiles and patient coverage defaults without fixed copay columns', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.menu_template_billing_profiles'
    );
    expect(migrationSql).toContain(
      'create table if not exists public.menu_billing_profiles'
    );
    expect(migrationSql).toContain(
      'create table if not exists public.customer_insurance_coverages'
    );
    expect(migrationSql).toContain(
      'default_patient_burden_rate integer check'
    );
    expect(migrationSql).toContain(
      'patient_burden_rate integer not null'
    );
    expect(migrationSql).toContain(
      'patient_burden_rate in (0, 10, 20, 30)'
    );
    expect(migrationSql).not.toContain('zero_percent_amount');
    expect(migrationSql).not.toContain('one_percent_amount');
    expect(migrationSql).not.toContain('two_percent_amount');
    expect(migrationSql).not.toContain('three_percent_amount');
    expect(specMd).toContain('健康保険の0割/1割/2割/3割別固定金額');
  });

  test('adds immutable daily report pricing snapshot columns and guarded revenue amount roles', () => {
    expect(migrationSql).toContain(
      'add column if not exists menu_billing_profile_id uuid'
    );
    expect(migrationSql).toContain(
      'add column if not exists customer_insurance_coverage_id uuid'
    );
    expect(migrationSql).toContain(
      'add column if not exists pricing_snapshot_status text not null default'
    );
    expect(migrationSql).toContain(
      "pricing_snapshot_status in ('pending', 'confirmed', 'needs_review', 'recalculated')"
    );
    expect(migrationSql).toContain(
      'add column if not exists amount_role text'
    );
    expect(migrationSql).toContain("'patient_copay_estimated'");
    expect(migrationSql).toContain("'insurer_receivable_estimated'");
    expect(migrationSql).toContain(
      "'traffic_accident_receivable_estimated'"
    );
    expect(migrationSql).toContain(
      "'workers_comp_receivable_estimated'"
    );
  });

  test('confirms pricing through a service-role-only RPC with traffic accident review semantics', () => {
    expect(migrationSql).toContain(
      'create or replace function public.confirm_daily_report_item_pricing'
    );
    expect(migrationSql).toContain('for update');
    expect(migrationSql).toContain(
      "else 'TRAFFIC_ACCIDENT_REVIEW'"
    );
    expect(migrationSql).toContain(
      "'交通事故・自賠責関連の手入力概算です。公式マスタ由来の自動請求額ではありません。'"
    );
    expect(migrationSql).toContain("'TRAFFIC_ACCIDENT_REVIEW'");
    expect(migrationSql).toContain(
      'revoke execute on function public.confirm_daily_report_item_pricing'
    );
    expect(migrationSql).toContain('from public, anon, authenticated');
    expect(migrationSql).toContain('to service_role');
  });

  test('keeps arrived-reservation sync from overwriting confirmed pricing snapshots', () => {
    expect(migrationSql).toContain(
      'create or replace function public.sync_arrived_reservation_daily_report_item'
    );
    expect(migrationSql).toContain(
      "public.daily_report_items.pricing_snapshot_status in ('confirmed', 'recalculated')"
    );
    expect(migrationSql).toContain(
      "and pricing_snapshot_status = 'pending'"
    );
    expect(migrationSql).toContain(
      'create trigger daily_report_items_recalculate_totals'
    );
    expect(migrationSql).toContain(
      'after insert or delete or update of'
    );
  });

  test('adds clinic-scoped RLS and a breakdown summary view', () => {
    expect(migrationSql).toContain(
      'alter table public.menu_template_billing_profiles enable row level security'
    );
    expect(migrationSql).toContain(
      'alter table public.menu_billing_profiles enable row level security'
    );
    expect(migrationSql).toContain(
      'alter table public.customer_insurance_coverages enable row level security'
    );
    expect(migrationSql).toContain('app_private.can_access_clinic(clinic_id)');
    expect(migrationSql).toContain(
      'create or replace view public.daily_report_revenue_breakdown_summary'
    );
    expect(migrationSql).toContain('with (security_invoker = true)');
  });

  test('rollback refuses to drop snapshot-backed data and removes Phase 4A objects only when empty', () => {
    expect(rollbackSql).toContain(
      'Refusing rollback: menu_billing_profiles contains data'
    );
    expect(rollbackSql).toContain(
      'Refusing rollback: daily_report_items contains Phase 4A pricing snapshots'
    );
    expect(rollbackSql).toContain(
      'Refusing rollback: revenue_estimate_lines contains Phase 4A amount roles'
    );
    expect(rollbackSql).toContain(
      'drop function if exists public.confirm_daily_report_item_pricing'
    );
    expect(rollbackSql).toContain(
      'drop view if exists public.daily_report_revenue_breakdown_summary'
    );
    expect(rollbackSql).toContain(
      'drop table if exists public.customer_insurance_coverages'
    );
  });
});
