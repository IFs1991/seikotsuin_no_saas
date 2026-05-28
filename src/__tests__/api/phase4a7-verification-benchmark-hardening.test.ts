import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260528000100_phase4a7_verification_benchmark_hardening.sql'
  ),
  'utf8'
);

const rollbackSql = readFileSync(
  join(
    process.cwd(),
    'supabase/rollbacks/20260528000100_phase4a7_verification_benchmark_hardening_rollback.sql'
  ),
  'utf8'
);

const phase4aMigrationSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260525000100_phase4a_menu_billing_patient_coverage_snapshot.sql'
  ),
  'utf8'
);

const dailyReportItemsRoute = readFileSync(
  join(process.cwd(), 'src/app/api/daily-reports/items/route.ts'),
  'utf8'
);

const packageJson = readFileSync(join(process.cwd(), 'package.json'), 'utf8');

const readinessScript = readFileSync(
  join(process.cwd(), 'scripts/phase4a/verify-benchmark-readiness.mjs'),
  'utf8'
);

describe('Phase 4A-7 verification and benchmark hardening', () => {
  test('keeps current coverage lookup aligned with the partial confirmed index', () => {
    expect(phase4aMigrationSql).toContain(
      'idx_customer_insurance_coverages_current_lookup'
    );
    expect(phase4aMigrationSql).toContain(
      "where verification_status = 'confirmed'"
    );
    expect(dailyReportItemsRoute).toContain(
      ".eq('verification_status', 'confirmed')"
    );
    expect(dailyReportItemsRoute).toContain(".in('customer_id', customerIds)");
  });

  test('keeps daily report pricing context lookup batched instead of N+1', () => {
    expect(dailyReportItemsRoute).toContain('await Promise.all([');
    expect(dailyReportItemsRoute).toContain(
      'fetchCoveragesByCustomerId('
    );
    expect(dailyReportItemsRoute).toContain('fetchMenuProfileByKey(');
    expect(dailyReportItemsRoute).toContain(".in('menu_id', menuIds)");
    expect(dailyReportItemsRoute).toContain(
      ".in('revenue_context_code', revenueContextCodes)"
    );
  });

  test('skips aggregate recalculation when update-triggered aggregate inputs did not change', () => {
    expect(migrationSql).toContain(
      'create or replace function public.sync_daily_report_item_totals()'
    );
    expect(migrationSql).toContain(
      'set search_path = public, auth, extensions'
    );
    expect(migrationSql).toContain(
      'old.daily_report_id is not distinct from new.daily_report_id'
    );
    expect(migrationSql).toContain('old.fee is not distinct from new.fee');
    expect(migrationSql).toContain(
      'old.billing_type is not distinct from new.billing_type'
    );
    expect(migrationSql).toContain('return new;');
    expect(migrationSql).toContain(
      'revoke execute on function public.sync_daily_report_item_totals()'
    );
    expect(migrationSql).toContain('to service_role');
  });

  test('rollback restores the pre-hardening trigger function behavior', () => {
    expect(rollbackSql).toContain(
      'Restores the pre-4A-7 daily report item total trigger function behavior'
    );
    expect(rollbackSql).toContain(
      'create or replace function public.sync_daily_report_item_totals()'
    );
    expect(rollbackSql).toContain(
      'set search_path = public, auth, extensions'
    );
    expect(rollbackSql).toContain(
      'old.daily_report_id is distinct from new.daily_report_id'
    );
    expect(rollbackSql).not.toContain('old.fee is not distinct from new.fee');
    expect(rollbackSql).toContain(
      'revoke execute on function public.sync_daily_report_item_totals()'
    );
    expect(rollbackSql).toContain('to service_role');
  });

  test('exposes a local readiness command for handover and benchmark checks', () => {
    expect(packageJson).toContain(
      '"phase4a:verify-benchmark-readiness": "node scripts/phase4a/verify-benchmark-readiness.mjs"'
    );
    expect(readinessScript).toContain('coverage-current-index');
    expect(readinessScript).toContain('pricing-context-batched');
    expect(readinessScript).toContain('trigger-value-change-guard');
    expect(readinessScript).toContain('trigger-search-path-hardened');
    expect(readinessScript).toContain('handover-benchmark-plan');
  });
});
