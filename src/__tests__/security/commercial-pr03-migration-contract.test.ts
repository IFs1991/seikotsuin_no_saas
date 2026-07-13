import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_SUFFIX = '_commercial_rls_role_policy_normalization.sql';
const MATRIX_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr03/policy-matrix.csv';
const README_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr03/README.md';
const RUNNER_PATH = 'scripts/commercial-hardening/run-red-contracts.mjs';

const SERVICE_POLICY_NAMES = [
  'appointments_insert_service_role',
  'audit_logs_insert_service_role',
  'System can insert metrics',
  'service_role full access billing audit logs',
  'service_role full access billing overrides',
  'csp_violations_insert_any',
  'service_role_full_access_logs',
  'service_role_full_access_outbox',
  'notifications_insert_service_role',
  'patients_insert_legacy_block',
  'reservation_history_insert_service_role',
  'service_role_full_access_reservation_notifications',
  'security_alerts_insert_any',
  'security_events_insert_service_role',
  'staff_insert_legacy_block',
  'service_role full access stripe webhook events',
  'service_role full access subscriptions',
] as const;

function readRepositoryFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

function findSingleFile(directory: string, suffix: string): string {
  const files = fs
    .readdirSync(path.resolve(process.cwd(), directory))
    .filter(file => file.endsWith(suffix));

  expect(files).toHaveLength(1);
  const file = files[0];
  if (!file) {
    throw new Error(`Missing file ending with ${suffix}`);
  }

  return path.join(directory, file);
}

describe('commercial PR-03 migration contract', () => {
  const migrationPath = findSingleFile('supabase/migrations', MIGRATION_SUFFIX);
  const migrationName = path.basename(migrationPath);
  const rollbackPath = findSingleFile(
    'supabase/rollbacks',
    migrationName.replace(/\.sql$/, '_rollback.sql')
  );
  const migration = readRepositoryFile(migrationPath);
  const rollback = readRepositoryFile(rollbackPath);

  it('ships the reviewed PR-03 policy evidence', () => {
    expect(fs.existsSync(path.resolve(process.cwd(), MATRIX_PATH))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), README_PATH))).toBe(true);
    expect(readRepositoryFile(MATRIX_PATH)).toContain(
      'schema,table_name,policy_name,command,target_roles,decision,evidence'
    );
  });

  it('requires authenticated policy targets and deny-all RLS on legacy tables', () => {
    expect(migration).toContain('to authenticated');
    expect(migration).toContain(
      'alter table public.treatment_menu_records enable row level security;'
    );
    expect(migration).toContain(
      'alter table public.treatments enable row level security;'
    );
    expect(migration).not.toMatch(/\bto\s+(?:anon|service_role)\b/i);
  });

  it.each(SERVICE_POLICY_NAMES)(
    'removes redundant service-role RLS policy %s',
    policyName => {
      expect(migration).toContain(`drop policy ${JSON.stringify(policyName)}`);
    }
  );

  it('removes tautological clinic settings policies and consolidates reviewed duplicates', () => {
    expect(migration).toContain(
      'drop policy "clinic_settings_select_policy" on public.clinic_settings;'
    );
    expect(migration).toContain(
      'drop policy "clinic_settings_upsert_policy" on public.clinic_settings;'
    );
    expect(migration).not.toMatch(/p\.clinic_id\s*=\s*p\.clinic_id/i);
    expect(migration).not.toMatch(/up\.clinic_id\s*=\s*up\.clinic_id/i);
  });

  it('moves direct auth uid policy calls into initialization plans', () => {
    expect(migration).toContain('(select auth.uid())');
    expect(migration).toContain(
      'manager_clinic_assignments_select_admin_or_self_active'
    );
    expect(migration).toContain('calendar_feed_tokens_select_scoped');
    expect(migration).toContain('shift_requests_update_scoped');
  });

  it('comments every retained policy and rejects policy drift postflight', () => {
    expect(migration).toContain('comment on policy');
    expect(migration).toContain('PR-03 postflight failed');
  });

  it('keeps rollback security-preserving', () => {
    const executableRollback = rollback.replace(/^--.*$/gm, '');

    expect(executableRollback).not.toMatch(/create policy/i);
    expect(executableRollback).not.toMatch(/alter policy[\s\S]*to public/i);
    expect(executableRollback).not.toMatch(/disable row level security/i);
    expect(rollback).toContain('reviewed forward-fix');
  });

  it('advances only the PR-03 phase DB contracts to GREEN', () => {
    const runner = readRepositoryFile(RUNNER_PATH);

    for (const file of [
      '01_exposed_tables_rls.sql',
      '02_default_client_privileges.sql',
      '06_clinic_settings_policy.sql',
      '08_profile_self_escalation.sql',
      '09_rls_policy_normalization.sql',
    ]) {
      expect(runner).toMatch(
        new RegExp(`${file.replace('.', '\\.')}[\\s\\S]*?outcome: 'green'`)
      );
    }

    for (const file of [
      '03_private_function_execute.sql',
      '03b_function_search_path.sql',
      '04_required_composite_fks.sql',
      '05_parent_rehome_fixture.sql',
      '07_atomic_staff_invite.sql',
    ]) {
      expect(runner).toMatch(
        new RegExp(`${file.replace('.', '\\.')}[\\s\\S]*?outcome: 'red'`)
      );
    }
  });
});
