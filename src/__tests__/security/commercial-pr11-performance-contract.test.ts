/** @jest-environment node */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

const INDEX_MIGRATION_SUFFIX = '_commercial_performance_safe_fk_indexes.sql';
const RLS_MIGRATION_SUFFIX = '_commercial_rls_plan_cleanup.sql';
const FORWARD_MIGRATION_SUFFIX =
  '_commercial_pr11_fixed_performance_forward_fix.sql';
const SPEC_PATH =
  'docs/stabilization/spec-commercial-performance-safe-indexes-rls-plan-v1.0.md';
const EVIDENCE_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr11/README.md';
const PILOT_WAIVER_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr11/pilot-performance-waiver.yaml';
const GIT_ATTRIBUTES_PATH = '.gitattributes';
const FK_MATRIX_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr11/fk-index-decision-matrix.csv';
const FK_RESIDUAL_MATRIX_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr11/fk-residual-exception-matrix.csv';
const RLS_MATRIX_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr11/rls-policy-decision-matrix.csv';
const RLS_RESIDUAL_MATRIX_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr11/rls-residual-exception-matrix.csv';
const SQL_TEST_PATH = 'supabase/tests/commercial_pr11_performance_rls_test.sql';
const PERFORMANCE_PROBE_PATH =
  'scripts/commercial-hardening/sql/pr11-performance-probe.sql';
const RLS_PLAN_PROBE_PATH =
  'scripts/commercial-hardening/sql/pr11-rls-plan-probe.sql';
const PAIRED_NORMALIZE_PATH =
  'scripts/commercial-hardening/sql/pr11-paired-normalize.sql';
const PAIRED_PERFORMANCE_BEFORE_PATH =
  'scripts/commercial-hardening/sql/pr11-paired-performance-before.sql';
const PAIRED_RLS_BEFORE_PATH =
  'scripts/commercial-hardening/sql/pr11-paired-rls-before.sql';
const PAIRED_POSTFLIGHT_PATH =
  'scripts/commercial-hardening/sql/pr11-paired-postflight.sql';
const PAIRED_PHYSICAL_SNAPSHOT_PATH =
  'scripts/commercial-hardening/sql/pr11-paired-physical-snapshot.sql';
const PAIRED_RUNNER_PATH =
  'scripts/commercial-hardening/run-pr11-paired-benchmark.mjs';
const RUNNER_PATH = 'scripts/commercial-hardening/run-red-contracts.mjs';
const FORWARD_RUNNER_PATH =
  'scripts/commercial-hardening/run-pr11-forward-fix-experiment.mjs';
const POSTAPPLY_RUNNER_PATH =
  'scripts/commercial-hardening/run-pr11-forward-fix-postapply-paired.mjs';
const POSTAPPLY_PERMANENT_STATE_PATH =
  'scripts/commercial-hardening/sql/pr11-postapply-permanent-state.sql';
const POSTAPPLY_BLOCKS_BEFORE_PATH =
  'scripts/commercial-hardening/sql/pr11-postapply-blocks-before.sql';
const POSTAPPLY_RLS_BEFORE_PATH =
  'scripts/commercial-hardening/sql/pr11-postapply-rls-read-before.sql';

const PAIRED_NORMALIZED_RELATIONS = [
  'auth.users',
  'public.clinics',
  'public.profiles',
  'public.resources',
  'public.shift_request_periods',
  'public.staff',
  'public.user_permissions',
  'public.blocks',
  'public.customers',
  'public.reservations',
  'public.reservation_history',
  'public.shift_requests',
  'public.patient_outreach_recipients',
  'public.customer_insurance_coverages',
  'public.menus',
  'public.menu_billing_profiles',
  'public.patient_outreach_campaigns',
] as const;

const NEW_INDEX_NAMES = [
  'blocks_created_by_idx',
  'blocks_deleted_by_idx',
  'care_episodes_created_by_idx',
  'care_episodes_updated_by_idx',
  'clinic_line_credentials_updated_by_idx',
  'customer_insurance_coverages_created_by_idx',
  'customer_insurance_coverages_updated_by_idx',
  'customer_insurance_coverages_verified_by_idx',
  'customers_created_by_idx',
  'customers_deleted_by_idx',
  'daily_report_item_tags_created_by_idx',
  'daily_report_item_tags_tag_code_idx',
  'daily_report_item_tags_updated_by_idx',
  'daily_report_items_created_by_idx',
  'daily_report_items_revenue_context_code_idx',
  'daily_report_items_updated_by_idx',
  'daily_report_items_visit_stage_code_idx',
  'daily_reports_staff_id_idx',
  'manager_clinic_assignments_assigned_by_idx',
  'manager_clinic_assignments_revoked_by_idx',
  'menu_billing_profiles_created_by_idx',
  'menu_billing_profiles_revenue_context_code_idx',
  'menu_billing_profiles_source_template_profile_id_idx',
  'menu_billing_profiles_updated_by_idx',
  'menus_created_by_idx',
  'menus_deleted_by_idx',
  'patient_outreach_campaigns_created_by_idx',
  'patient_outreach_recipients_booked_reservation_clinic_idx',
  'reservation_history_created_by_idx',
  'reservation_notifications_email_outbox_id_idx',
  'reservations_created_by_idx',
  'reservations_deleted_by_idx',
  'resources_created_by_idx',
  'resources_deleted_by_idx',
  'shift_requests_reviewed_by_idx',
  'shift_requests_staff_id_idx',
  'shift_requests_submitted_by_idx',
  'staff_shifts_created_by_idx',
  'staff_shifts_home_clinic_id_idx',
  'staff_shifts_source_shift_request_id_idx',
  'staff_shifts_staff_profile_id_idx',
] as const;

const EXISTING_PATH_INDEX_NAMES = [
  'patient_outreach_recipients_campaign_idx',
  'patient_outreach_recipients_customer_idx',
  'reservations_campaign_id_idx',
] as const;

const RETIRED_ALL_POLICIES = [
  'customer_insurance_coverages_write_for_clinic_pricing_admin',
  'menu_billing_profiles_write_for_clinic_pricing_admin',
] as const;

const SPLIT_POLICY_NAMES = [
  'customer_insurance_coverages_insert_for_clinic_pricing_admin',
  'customer_insurance_coverages_update_for_clinic_pricing_admin',
  'customer_insurance_coverages_delete_for_clinic_pricing_admin',
  'menu_billing_profiles_insert_for_clinic_pricing_admin',
  'menu_billing_profiles_update_for_clinic_pricing_admin',
  'menu_billing_profiles_delete_for_clinic_pricing_admin',
] as const;

const repoRoot = path.resolve(__dirname, '../../..');

function readRepositoryFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function repositoryFileSha256(relativePath: string): string {
  return createHash('sha256')
    .update(fs.readFileSync(path.join(repoRoot, relativePath)))
    .digest('hex')
    .toUpperCase();
}

function findSingleFile(directory: string, suffix: string): string {
  const files = fs
    .readdirSync(path.join(repoRoot, directory))
    .filter(file => file.endsWith(suffix));

  expect(files).toHaveLength(1);
  const file = files[0];
  if (!file) {
    throw new Error(`Missing file ending with ${suffix}`);
  }
  return path.join(directory, file);
}

function normalizeExecutableSql(sql: string): string {
  return sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function readSimpleCsvRows(relativePath: string): string[][] {
  const lines = readRepositoryFile(relativePath).trim().split(/\r?\n/);
  return lines.slice(1).map(line => line.split(','));
}

function parsePhaseOutcomes(source: string): Record<string, 'red' | 'green'> {
  const entries = Array.from(
    source.matchAll(
      /\[\s*'([^']+\.sql)'\s*,\s*\{\s*marker:\s*'[^']+'\s*,\s*outcome:\s*'(red|green)'\s*,?\s*\}\s*,?\s*\]/g
    ),
    match => {
      const file = match[1];
      const outcome = match[2];
      if (!file || (outcome !== 'red' && outcome !== 'green')) {
        throw new Error('Invalid commercial phase contract entry');
      }
      return [file, outcome] as const;
    }
  );
  return Object.fromEntries(entries);
}

describe('commercial PR-11 performance-safe DB contract', () => {
  const indexMigrationPath = findSingleFile(
    'supabase/migrations',
    INDEX_MIGRATION_SUFFIX
  );
  const rlsMigrationPath = findSingleFile(
    'supabase/migrations',
    RLS_MIGRATION_SUFFIX
  );
  const forwardMigrationPath = findSingleFile(
    'supabase/migrations',
    FORWARD_MIGRATION_SUFFIX
  );
  const indexRollbackPath = findSingleFile(
    'supabase/rollbacks',
    path.basename(indexMigrationPath).replace(/\.sql$/, '_rollback.sql')
  );
  const rlsRollbackPath = findSingleFile(
    'supabase/rollbacks',
    path.basename(rlsMigrationPath).replace(/\.sql$/, '_rollback.sql')
  );
  const forwardRollbackPath = findSingleFile(
    'supabase/rollbacks',
    path.basename(forwardMigrationPath).replace(/\.sql$/, '_rollback.sql')
  );
  const indexMigration = readRepositoryFile(indexMigrationPath);
  const rlsMigration = readRepositoryFile(rlsMigrationPath);
  const indexRollback = readRepositoryFile(indexRollbackPath);
  const rlsRollback = readRepositoryFile(rlsRollbackPath);
  const forwardMigration = readRepositoryFile(forwardMigrationPath);
  const forwardRollback = readRepositoryFile(forwardRollbackPath);
  const normalizedIndexMigration = normalizeExecutableSql(indexMigration);
  const normalizedRlsMigration = normalizeExecutableSql(rlsMigration);
  const normalizedIndexRollback = normalizeExecutableSql(indexRollback);
  const normalizedRlsRollback = normalizeExecutableSql(rlsRollback);
  const normalizedForwardMigration = normalizeExecutableSql(forwardMigration);
  const normalizedForwardRollback = normalizeExecutableSql(forwardRollback);

  it('ships paired specification, recovery guards, evidence, SQL test, and probe', () => {
    for (const requiredPath of [
      SPEC_PATH,
      EVIDENCE_PATH,
      PILOT_WAIVER_PATH,
      GIT_ATTRIBUTES_PATH,
      FK_MATRIX_PATH,
      FK_RESIDUAL_MATRIX_PATH,
      RLS_MATRIX_PATH,
      RLS_RESIDUAL_MATRIX_PATH,
      SQL_TEST_PATH,
      PERFORMANCE_PROBE_PATH,
      RLS_PLAN_PROBE_PATH,
      PAIRED_NORMALIZE_PATH,
      PAIRED_PERFORMANCE_BEFORE_PATH,
      PAIRED_RLS_BEFORE_PATH,
      PAIRED_POSTFLIGHT_PATH,
      PAIRED_PHYSICAL_SNAPSHOT_PATH,
      PAIRED_RUNNER_PATH,
      FORWARD_RUNNER_PATH,
      'docs/stabilization/evidence/commercial-hardening/pr11/rls-plan-before.json',
      'docs/stabilization/evidence/commercial-hardening/pr11/rls-plan-after.json',
    ]) {
      expect(fs.existsSync(path.join(repoRoot, requiredPath))).toBe(true);
    }

    expect(indexMigration).toContain(`-- @spec ${SPEC_PATH}`);
    expect(indexMigration).toContain(
      `-- @rollback ${indexRollbackPath.replace(/\\/g, '/')}`
    );
    expect(rlsMigration).toContain(`-- @spec ${SPEC_PATH}`);
    expect(rlsMigration).toContain(
      `-- @rollback ${rlsRollbackPath.replace(/\\/g, '/')}`
    );
    expect(forwardMigration).toContain(`-- @spec ${SPEC_PATH}`);
    expect(forwardMigration).toContain(
      `-- @rollback ${forwardRollbackPath.replace(/\\/g, '/')}`
    );
    expect(forwardMigration).toContain(`-- @evidence ${PILOT_WAIVER_PATH}`);
    expect(readRepositoryFile(GIT_ATTRIBUTES_PATH)).toContain(
      'docs/stabilization/evidence/commercial-hardening/pr11/**/*.raw binary'
    );
  });

  it('creates exactly 36 partial and 5 full reviewed FK indexes', () => {
    expect(NEW_INDEX_NAMES).toHaveLength(41);
    for (const indexName of NEW_INDEX_NAMES) {
      expect(indexMigration).toContain(`'${indexName}'`);
      expect(indexRollback).toContain(`'${indexName}'`);
    }

    expect(indexMigration).toContain('where predicate_sql is null) <> 5');
    expect(indexMigration).toContain('where predicate_sql is not null) <> 36');
    expect(indexMigration).toContain(
      "'create index %I on %s using btree (%s)%s'"
    );
    expect(indexMigration).toContain(
      'booked_reservation_idisnotnullandclinic_idisnotnull'
    );
    expect(indexMigration).toContain('pr11_fk_constraint_contract');
    expect(indexMigration).toContain('exact FK definition drift');
    expect(indexRollback).toContain('pr11_recovery_fk_contract');
  });

  it('freezes decision rows and every FK/RLS residual by identity and owner', () => {
    const fkRows = readSimpleCsvRows(FK_MATRIX_PATH);
    const fkResidualRows = readSimpleCsvRows(FK_RESIDUAL_MATRIX_PATH);
    const rlsRows = readSimpleCsvRows(RLS_MATRIX_PATH);
    const rlsResidualRows = readSimpleCsvRows(RLS_RESIDUAL_MATRIX_PATH);

    expect(fkRows).toHaveLength(44);
    expect(
      fkRows.filter(row => row[2] === 'PARTIAL_NOT_NULL_BTREE')
    ).toHaveLength(36);
    expect(fkRows.filter(row => row[2] === 'FULL_BTREE')).toHaveLength(5);
    expect(fkRows.filter(row => row[2]?.startsWith('EXISTING_'))).toHaveLength(
      3
    );

    expect(fkResidualRows).toHaveLength(50);
    expect(new Set(fkResidualRows.map(row => row[0])).size).toBe(50);
    expect(
      fkResidualRows.every(row => Boolean(row[0] && row[1] && row[2]))
    ).toBe(true);
    expect(
      new Set(fkResidualRows.map(row => `${row[1]}/${row[0]}/${row[2]}`)).size
    ).toBe(50);
    expect(
      fkResidualRows.filter(row => row[3] === 'A_TENANT_CANONICAL')
    ).toHaveLength(3);
    expect(
      fkResidualRows.filter(row => row[3] === 'E_LEGACY_QUARANTINE')
    ).toHaveLength(12);
    expect(fkResidualRows.filter(row => row[3] === 'UNKNOWN')).toHaveLength(35);
    expect(
      fkResidualRows.every(row => Boolean(row[5] && row[6] && row[7]))
    ).toBe(true);

    expect(rlsRows).toHaveLength(18);
    expect(
      rlsRows.filter(row => row[3] === 'SPLIT_ALL_TO_COMMANDS')
    ).toHaveLength(2);
    expect(rlsRows.filter(row => row[3] === 'RETAIN_EXCEPTION')).toHaveLength(
      16
    );
    expect(rlsResidualRows).toHaveLength(16);
    expect(
      new Set(rlsResidualRows.map(row => `${row[0]}/${row[1]}/${row[2]}`)).size
    ).toBe(16);
    expect(
      rlsResidualRows.every(row => Boolean(row[3] && row[4] && row[6]))
    ).toBe(true);

    const fkResidualContract = readRepositoryFile(
      'scripts/commercial-hardening/red-contracts/10_performance_fk_indexes.sql'
    );
    const sqlTest = readRepositoryFile(SQL_TEST_PATH);
    expect(fkResidualContract).toContain(
      'reviewed residual FK warning identity drift'
    );
    for (const row of fkResidualRows) {
      const [constraintName, tableName, keyColumns] = row;
      expect(fkResidualContract).toContain(
        `('${tableName}', '${constraintName}', '${keyColumns}')`
      );
      expect(sqlTest).toContain(
        `('${tableName}', '${constraintName}', '${keyColumns}')`
      );
    }
    expect(
      readRepositoryFile(
        'scripts/commercial-hardening/red-contracts/11_performance_rls_plan.sql'
      )
    ).toContain('multiple-permissive residual identity drift');
  });

  it('retains three proven existing paths and bounds ordinary index locking', () => {
    for (const indexName of EXISTING_PATH_INDEX_NAMES) {
      expect(indexMigration).toContain(`'${indexName}'`);
      expect(indexRollback).toContain(indexName);
    }
    expect(indexMigration).toContain("'leading_parent_id'");
    expect(indexMigration).toContain("'reversed_complete_key'");
    expect(indexMigration).toContain('64 * 1024 * 1024');
    expect(indexMigration).toContain("interval '5 minutes'");
    expect(indexMigration).toContain("set local lock_timeout = '5s'");
  });

  it('keeps index DDL separate from policies, grants, data repair, and index removal', () => {
    expect(normalizedIndexMigration).not.toMatch(/\bcreate\s+policy\b/);
    expect(normalizedIndexMigration).not.toMatch(/\bdrop\s+policy\b/);
    expect(normalizedIndexMigration).not.toMatch(/\bgrant\b|\brevoke\b/);
    expect(normalizedIndexMigration).not.toMatch(/\bupdate\s+public\./);
    expect(normalizedIndexMigration).not.toMatch(/\bdelete\s+from\s+public\./);
    expect(normalizedIndexMigration).not.toMatch(/\bdrop\s+index\b/);
    expect(normalizedIndexRollback).not.toMatch(/\bdrop\s+index\b/);
    expect(indexRollback).toContain('validation-only');
    expect(indexRollback).toContain('reviewed forward-fix');
  });

  it('splits only the two reviewed ALL policies into exact command policies', () => {
    for (const retiredPolicy of RETIRED_ALL_POLICIES) {
      expect(normalizedRlsMigration).toContain(`drop policy ${retiredPolicy}`);
    }
    for (const splitPolicy of SPLIT_POLICY_NAMES) {
      expect(normalizedRlsMigration).toContain(`create policy ${splitPolicy}`);
      expect(rlsMigration).toContain(`'${splitPolicy}'`);
    }

    expect(rlsMigration).toContain('actual.qual is distinct from case');
    expect(rlsMigration).toContain('actual.with_check is distinct from case');
    expect(rlsMigration).toContain('pr11_rls_unaffected_snapshot');
    expect(rlsMigration).toContain('duplicate_group_count <> 16');
    expect(rlsMigration).toContain(
      "count(*) from pg_policies where schemaname = 'public') <> 183"
    );
  });

  it('does not broaden RLS via grants, data mutation, indexes, or an automatic policy rollback', () => {
    expect(normalizedRlsMigration).not.toMatch(/\bgrant\b|\brevoke\b/);
    expect(normalizedRlsMigration).not.toMatch(/\bcreate\s+index\b/);
    expect(normalizedRlsMigration).not.toMatch(/\bdrop\s+index\b/);
    expect(normalizedRlsMigration).not.toMatch(/\bupdate\s+public\./);
    expect(normalizedRlsMigration).not.toMatch(/\bdelete\s+from\s+public\./);
    expect(normalizedRlsRollback).not.toMatch(/\bcreate\s+policy\b/);
    expect(normalizedRlsRollback).not.toMatch(/\bdrop\s+policy\b/);
    expect(rlsRollback).toContain('validation-only');
    expect(rlsRollback).toContain('reviewed forward-fix');
    expect(rlsRollback).toContain('pr11_rls_recovery_policy');
    expect(rlsRollback).toContain('exact split policy identity or shape drift');
  });

  it('advances all four PR-11 RED contracts to GREEN', () => {
    const outcomes = parsePhaseOutcomes(readRepositoryFile(RUNNER_PATH));

    expect(outcomes['10_performance_fk_indexes.sql']).toBe('green');
    expect(outcomes['11_performance_rls_plan.sql']).toBe('green');
    expect(outcomes['12_pr11_blocks_trigger_fast_path.sql']).toBe('green');
    expect(outcomes['13_pr11_rls_statement_scope.sql']).toBe('green');
  });

  it('keeps the applied PR-11 migrations and recovery guards immutable', () => {
    expect(repositoryFileSha256(indexMigrationPath)).toBe(
      'D638168DF8B5B525AA6410B96CC7584215F012AA651628A641FD318985E924CA'
    );
    expect(repositoryFileSha256(rlsMigrationPath)).toBe(
      '061178CE97700AE0105832BD645E4C1D053FF39D59D8718C283964842BB12CAE'
    );
    expect(repositoryFileSha256(indexRollbackPath)).toBe(
      '40C7AEEF24FACE1C0F2837F9EE59AC18AE2802EB186212377E9FDA4B8D79B47A'
    );
    expect(repositoryFileSha256(rlsRollbackPath)).toBe(
      '176FE002A66243098B037641A3738895BF6E757B1E3E1703752692F0A62B5325'
    );
  });

  it('ships an append-only, bounded, exact forward-fix without data mutation', () => {
    expect(forwardMigrationPath).toMatch(
      /^supabase[\\/]migrations[\\/]20260718/
    );
    expect(
      forwardMigrationPath.localeCompare(rlsMigrationPath)
    ).toBeGreaterThan(0);
    expect(forwardMigration).toContain("set local lock_timeout = '5s'");
    expect(forwardMigration).toContain('64 * 1024 * 1024');
    expect(forwardMigration).toContain("interval '5 minutes'");
    expect(forwardMigration).toContain(
      'create or replace function public.validate_blocks_clinic_refs()'
    );
    expect(forwardMigration).toContain(
      'create function app_private.get_current_accessible_clinic_ids()'
    );
    expect(
      normalizedForwardMigration.match(/\balter\s+policy\b/g) ?? []
    ).toHaveLength(2);
    expect(
      normalizedForwardMigration.match(/\bcreate\s+index\b/g) ?? []
    ).toHaveLength(2);
    expect(normalizedForwardMigration).not.toMatch(
      /\bdrop\s+(index|function|policy|table|constraint)\b/
    );
    expect(normalizedForwardMigration).not.toMatch(
      /\bupdate\s+public\.|\bdelete\s+from\s+public\.|\binsert\s+into\s+public\./
    );
    expect(normalizedForwardMigration).not.toContain(
      'create or replace function app_private.get_current_role()'
    );
    expect(normalizedForwardMigration).not.toContain(
      'create or replace function app_private.can_access_clinic'
    );
    expect(forwardMigration).not.toMatch(/^\\/m);
    expect(forwardMigration).toContain('fe160976fe22dac01208d155ebf16984');
    expect(forwardMigration).toContain('bae22e5fdf92404e1202dd2f891a359a');
    expect(forwardMigration).toContain('633cd3f3b42e72d9ffdc0127f68b1a89');
    expect(forwardMigration).toContain('pr11_fix_unaffected_policy_snapshot');
    expect(forwardMigration).toContain('pr11_fix_source_helper_snapshot');
    expect(forwardMigration).toContain('pr11_fix_relation_security_snapshot');
  });

  it('keeps forward-fix recovery validation-only and security preserving', () => {
    expect(forwardRollback).toContain('validation-only');
    expect(forwardRollback).toContain('reviewed append-only forward-fix');
    expect(normalizedForwardRollback).not.toMatch(
      /\bdrop\s+(index|function|policy)\b/
    );
    expect(normalizedForwardRollback).not.toMatch(
      /\b(create|alter)\s+policy\b|\bcreate\s+index\b/
    );
    expect(normalizedForwardRollback).not.toMatch(/\bgrant\b|\brevoke\b/);
    expect(normalizedForwardRollback).not.toMatch(
      /\bupdate\s+public\.|\bdelete\s+from\s+public\.|\binsert\s+into\s+public\./
    );
    expect(forwardRollback).toContain('de340ecaa55f2bc46858a3f37aa13ff7');
    expect(forwardRollback).toContain('633cd3f3b42e72d9ffdc0127f68b1a89');
    expect(forwardRollback).toContain('183-policy inventory drift');
    expect(forwardRollback).toContain('composite-FK data mismatch');
  });

  it('preserves the frozen gates and records waiver separately from measurement', () => {
    const forwardRunner = readRepositoryFile(FORWARD_RUNNER_PATH);
    const waiver = readRepositoryFile(PILOT_WAIVER_PATH);

    for (const frozenValue of [
      '435.7373',
      '521.55125',
      '66.757',
      '63.3855',
      '124.709',
      '135.944',
      '9_292_168.2',
      '11_133_665',
      '1_220_025',
      '1_718_510',
    ]) {
      expect(forwardRunner).toContain(frozenValue);
    }
    expect(forwardRunner).toContain('summary.primaryPass =');
    expect(forwardRunner).toContain("'gate-fail'");
    expect(forwardRunner).not.toMatch(/waiver|pass_with_risk/i);
    expect(waiver).toContain('status: PASS_WITH_RISK');
    expect(waiver).toContain('blocking: false');
    expect(waiver).toContain('primary_measurement_pass: false');
    expect(waiver).toContain("expires_at: '2026-08-18T23:59:59+09:00'");
  });

  it('ships a permanent-state official paired runner without weakening hard gates', () => {
    const runner = readRepositoryFile(POSTAPPLY_RUNNER_PATH);
    const permanentState = readRepositoryFile(POSTAPPLY_PERMANENT_STATE_PATH);
    const blocksBefore = readRepositoryFile(POSTAPPLY_BLOCKS_BEFORE_PATH);
    const rlsBefore = readRepositoryFile(POSTAPPLY_RLS_BEFORE_PATH);

    for (const frozenValue of [
      '2.851',
      '435.7373',
      '521.55125',
      '198.387',
      '219.224',
      '46.665',
      '81.761',
      '66.757',
      '63.3855',
      '124.709',
      '135.944',
      '9_292_168.2',
      '11_133_665',
      '1_220_025',
      '1_718_510',
    ]) {
      expect(runner).toContain(frozenValue);
    }
    expect(runner).toContain("permanentMigrationHead: '20260718011731'");
    expect(runner).toContain('primaryExecutionGateCount: 9');
    expect(runner).toContain('primaryWalGateCount: 6');
    expect(runner).toContain('auxiliaryExecutionGateCount: 2');
    expect(runner).toContain('auxiliaryWalGateCount: 2');
    expect(runner).toContain('summary.primaryPass =');
    expect(runner).toContain('summary.hardNonWaivedPass =');
    expect(runner).toContain("'PASS_WITH_RISK'");
    expect(runner).toContain('generalCommercialReleaseEligible = false');
    expect(runner).toContain('tapOk === 52');
    expect(runner).not.toMatch(/db\s+reset|volume\s+(delete|remove)/i);

    expect(permanentState).toContain(
      '20260718011731_commercial_pr11_fixed_performance_forward_fix_rollback.sql'
    );
    expect(blocksBefore).toContain('pr11-postapply-blocks-before-ddl.sql');
    expect(blocksBefore).toContain('pr11-performance-probe.sql');
    expect(rlsBefore).toContain('pr11-postapply-rls-before-ddl.sql');
    expect(rlsBefore).toContain('pr11-rls-plan-probe.sql');
  });

  it('keeps the approved paired benchmark local, fail-closed, and rollback-only', () => {
    const normalize = normalizeExecutableSql(
      readRepositoryFile(PAIRED_NORMALIZE_PATH)
    );
    const performanceBefore = normalizeExecutableSql(
      readRepositoryFile(PAIRED_PERFORMANCE_BEFORE_PATH)
    );
    const rlsBefore = normalizeExecutableSql(
      readRepositoryFile(PAIRED_RLS_BEFORE_PATH)
    );
    const postflight = readRepositoryFile(PAIRED_POSTFLIGHT_PATH);
    const physicalSnapshot = readRepositoryFile(PAIRED_PHYSICAL_SNAPSHOT_PATH);
    const runner = readRepositoryFile(PAIRED_RUNNER_PATH);
    const performanceProbe = readRepositoryFile(PERFORMANCE_PROBE_PATH);
    const rlsProbe = readRepositoryFile(RLS_PLAN_PROBE_PATH);

    for (const relation of PAIRED_NORMALIZED_RELATIONS) {
      expect(normalize).toContain(`vacuum (analyze) ${relation}`);
      expect(normalize).toContain(`reindex table ${relation}`);
    }
    expect(normalize).toContain('local fixture baseline drift');
    expect(normalize).not.toMatch(
      /\btruncate\b|\bdelete\s+from\b|\bupdate\s+public\./
    );

    expect(performanceBefore.match(/\bdrop\s+index\b/g) ?? []).toHaveLength(6);
    expect(performanceBefore).toContain('\\ir pr11-performance-probe.sql');
    expect(performanceBefore).not.toMatch(/\bcommit\b/);

    expect(rlsBefore.match(/\bdrop\s+index\b/g) ?? []).toHaveLength(7);
    expect(rlsBefore.match(/\bdrop\s+policy\b/g) ?? []).toHaveLength(6);
    expect(rlsBefore.match(/\bcreate\s+policy\b/g) ?? []).toHaveLength(2);
    expect(rlsBefore).toContain(
      'pr-03: authenticated-only all policy; authorization remains defined by the reviewed using/with check predicate. server service_role flows use bypassrls.'
    );
    expect(rlsBefore).toContain('\\ir pr11-rls-plan-probe.sql');
    expect(rlsBefore).not.toMatch(/\bcommit\b/);

    expect(postflight).toContain('b03aa579342a1d898d54330f82c6c3f5');
    expect(postflight).toContain('cd71ca524d4580eeb83db7414cfa6af7');
    expect(postflight).toContain('PR11_PAIRED_POSTFLIGHT_PASS');
    expect(postflight).toContain('\\quit 3');
    expect(postflight).toContain('auth_users_baseline');
    expect(postflight).toContain('customers_rows = 0');
    expect(postflight).toContain('reservations_rows = 0');
    expect(postflight).toContain('menus_rows = 0');
    expect(postflight).toContain('campaign_rows = 0');

    expect(physicalSnapshot).toContain("'blocked_other_clients'");
    expect(physicalSnapshot).toContain("'other_client_activity'");
    expect(physicalSnapshot).toContain("'vacuum_progress_count'");
    expect(physicalSnapshot).toContain("'create_index_progress_count'");
    expect(physicalSnapshot).toContain("'postmaster_started_at'");

    expect(runner).toContain("'-X'");
    expect(runner).toContain("'ON_ERROR_STOP=1'");
    expect(runner).not.toContain("'--single-transaction'");
    expect(runner).not.toContain("'-1'");
    expect(runner).toContain('primaryGateUsesOriginalFrozenLimits: true');
    expect(runner).toContain('pairedBeforeIsDiagnosticOnly: true');
    expect(runner).toContain('recordCleanPhysicalState');
    expect(runner).toContain('captureSampleResourceEvidence');
    expect(runner).toContain('validateDatabaseRuntimeState');
    expect(runner).toContain("'docker.exe'");
    expect(runner).toContain("'--no-stream'");
    expect(runner).toContain('database runtime was not quiescent');
    expect(runner).toContain('Duplicate physical snapshot key');
    expect(runner).toContain('expectedSupabaseCliArchiveSha256');
    expect(runner).not.toContain('.find(value => value.probe === probe)');
    expect(runner).toContain(
      "indexName: 'customer_insurance_coverages_customer_clinic_idx'"
    );
    expect(runner).toContain(
      "indexName: 'menu_billing_profiles_menu_clinic_idx'"
    );
    expect(runner).toContain("requireSuccess(runPsql('final-normalize'");
    expect(runner).toContain("requireSuccess(runPsql('final-postflight'");
    expect(runner).toContain("'emergency-final-normalize'");
    expect(runner).toContain("'emergency-final-postflight'");

    expect(performanceProbe).toContain('md5(plan_data::text) as raw_plan_md5');
    expect(performanceProbe).toContain('plan_data::text as plan_json');
    expect(rlsProbe).toContain("'raw_plan', plan_data");
  });
});
