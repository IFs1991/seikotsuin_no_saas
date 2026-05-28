import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function readWorkspaceFile(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function containsAll(source, needles) {
  return needles.every(needle => source.includes(needle));
}

const sources = {
  phase4aMigration: readWorkspaceFile(
    'supabase/migrations/20260525000100_phase4a_menu_billing_patient_coverage_snapshot.sql'
  ),
  phase4a7Migration: readWorkspaceFile(
    'supabase/migrations/20260528000100_phase4a7_verification_benchmark_hardening.sql'
  ),
  phase4a7Rollback: readWorkspaceFile(
    'supabase/rollbacks/20260528000100_phase4a7_verification_benchmark_hardening_rollback.sql'
  ),
  dailyReportItemsRoute: readWorkspaceFile(
    'src/app/api/daily-reports/items/route.ts'
  ),
  revenueRoute: readWorkspaceFile('src/app/api/revenue/route.ts'),
  handover: readWorkspaceFile(
    'docs/stabilization/phase4a7-verification-benchmark-handover-v0.1.md'
  ),
};

const checks = [
  {
    id: 'coverage-current-index',
    description: 'Current coverage lookup has a confirmed-only partial index.',
    pass: containsAll(sources.phase4aMigration, [
      'idx_customer_insurance_coverages_current_lookup',
      "where verification_status = 'confirmed'",
    ]),
  },
  {
    id: 'coverage-query-index-aligned',
    description: 'Daily report pricing context query filters confirmed coverage.',
    pass: sources.dailyReportItemsRoute.includes(
      ".eq('verification_status', 'confirmed')"
    ),
  },
  {
    id: 'pricing-context-batched',
    description: 'Daily report pricing context is resolved in batch queries.',
    pass: containsAll(sources.dailyReportItemsRoute, [
      'await Promise.all([',
      ".in('customer_id', customerIds)",
      ".in('menu_id', menuIds)",
    ]),
  },
  {
    id: 'trigger-update-columns',
    description: 'Daily report aggregate trigger is limited to aggregate inputs.',
    pass: containsAll(sources.phase4aMigration, [
      'after insert or delete or update of',
      'fee,',
      'billing_type,',
      'daily_report_id',
    ]),
  },
  {
    id: 'trigger-value-change-guard',
    description:
      'Phase 4A-7 trigger function skips recalculation when aggregate values are unchanged.',
    pass: containsAll(sources.phase4a7Migration, [
      'old.daily_report_id is not distinct from new.daily_report_id',
      'old.fee is not distinct from new.fee',
      'old.billing_type is not distinct from new.billing_type',
    ]),
  },
  {
    id: 'trigger-search-path-hardened',
    description: 'Phase 4A-7 trigger function keeps an explicit search_path.',
    pass: sources.phase4a7Migration.includes(
      'set search_path = public, auth, extensions'
    ),
  },
  {
    id: 'revenue-breakdown-view',
    description: 'Revenue API reads the role-based breakdown summary view.',
    pass:
      sources.phase4aMigration.includes(
        'create or replace view public.daily_report_revenue_breakdown_summary'
      ) &&
      sources.revenueRoute.includes(
        ".from('daily_report_revenue_breakdown_summary')"
      ),
  },
  {
    id: 'rollback-available',
    description: 'Phase 4A-7 rollback restores the previous trigger function.',
    pass: containsAll(sources.phase4a7Rollback, [
      'create or replace function public.sync_daily_report_item_totals()',
      'old.daily_report_id is distinct from new.daily_report_id',
      'set search_path = public, auth, extensions',
    ]),
  },
  {
    id: 'handover-benchmark-plan',
    description: 'Handover document records verification and benchmark steps.',
    pass:
      sources.handover.includes('Benchmark Baseline') &&
      sources.handover.includes('Rollback Verification') &&
      sources.handover.includes('Manual UI Check'),
  },
];

const failures = checks.filter(check => !check.pass);
const wantsJson = process.argv.includes('--json');

if (wantsJson) {
  console.log(
    JSON.stringify(
      {
        ok: failures.length === 0,
        checks,
      },
      null,
      2
    )
  );
} else {
  console.log('Phase 4A-7 benchmark readiness');
  for (const check of checks) {
    const status = check.pass ? 'PASS' : 'FAIL';
    console.log(`${status} ${check.id}: ${check.description}`);
  }
}

if (failures.length > 0) {
  console.error(
    `Phase 4A-7 readiness failed: ${failures.map(check => check.id).join(', ')}`
  );
  process.exitCode = 1;
}
