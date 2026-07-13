import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_SUFFIX = '_commercial_function_execution_hardening.sql';
const SPEC_PATH =
  'docs/stabilization/spec-commercial-function-execution-hardening-v1.0.md';
const EVIDENCE_README_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr04/README.md';
const FUNCTION_MATRIX_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr04/security-definer-matrix.csv';
const FUNCTION_AFTER_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr04/function-boundary-local-after.csv';
const CLEAN_REPLAY_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr04/clean-replay-local-after.md';
const EXTENSION_PREFLIGHT_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr04/extension-preflight.md';
const AUTH_RUNBOOK_PATH =
  'docs/operations/COMMERCIAL_PR04_LEAKED_PASSWORD_PROTECTION.md';
const SUPABASE_CONFIG_PATH = 'supabase/config.toml';
const SETUP_PATHS = [
  'docs/SETUP_VERCEL_SUPABASE.md',
  'docs/setup/SETUP_VERCEL_SUPABASE.md',
] as const;
const RUNNER_PATH = 'scripts/commercial-hardening/run-red-contracts.mjs';

const EXPECTED_AFTER_BOUNDARIES: Readonly<Record<string, string>> = {
  'app_private.assert_manager_clinic_assignment_valid()':
    'true|search_path=public, auth, extensions|postgres;service_role',
  'app_private.assert_subscription_org_root_clinic()':
    'true|search_path=public, auth, extensions|postgres',
  'app_private.belongs_to_clinic(uuid)':
    'true|search_path=public, auth, extensions|anon;authenticated;postgres;service_role',
  'app_private.can_access_clinic(uuid)':
    'true|search_path=public, auth, extensions|anon;authenticated;postgres;service_role',
  'app_private.custom_access_token_hook(jsonb)':
    'true|search_path=public, auth, extensions|postgres;supabase_auth_admin',
  'app_private.get_current_clinic_id()':
    'true|search_path=public, auth, extensions|anon;authenticated;postgres;service_role',
  'app_private.get_current_role()':
    'true|search_path=public, auth, extensions|anon;authenticated;postgres;service_role',
  'app_private.get_sibling_clinic_ids(uuid)':
    'true|search_path=public, auth, extensions|authenticated;postgres;service_role',
  'app_private.is_admin()':
    'true|search_path=public, auth, extensions|anon;authenticated;postgres;service_role',
  'app_private.jwt_clinic_id()':
    'true|search_path=public, auth, extensions|anon;authenticated;postgres;service_role',
  'app_private.jwt_is_admin()':
    'true|search_path=public, auth, extensions|anon;authenticated;postgres;service_role',
  'app_private.user_role()':
    'true|search_path=public, auth, extensions|anon;authenticated;postgres;service_role',
  'public.normalize_customer_phone(text)':
    'false|search_path=public, auth, extensions|PUBLIC;postgres;anon;authenticated;service_role',
  'public.update_reservation_notifications_updated_at()':
    'true|search_path=public|postgres;service_role',
  'public.validate_shift_requests_clinic_refs()':
    'true|search_path=public, auth, extensions|postgres;service_role',
};

const EXPECTED_PHASE_OUTCOMES = {
  '01_exposed_tables_rls.sql': 'green',
  '02_default_client_privileges.sql': 'green',
  '03_private_function_execute.sql': 'green',
  '03b_function_search_path.sql': 'green',
  '04_required_composite_fks.sql': 'red',
  '05_parent_rehome_fixture.sql': 'red',
  '06_clinic_settings_policy.sql': 'green',
  '07_atomic_staff_invite.sql': 'red',
  '08_profile_self_escalation.sql': 'green',
  '09_rls_policy_normalization.sql': 'green',
} as const;

interface FunctionBoundaryRow {
  schema: string;
  signature: string;
  securityDefiner: string;
  config: string;
  effectiveAcl: string;
}

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

function normalizeExecutableSql(sql: string): string {
  return sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseFunctionBoundaryRow(row: string): FunctionBoundaryRow {
  const match = row.match(
    /^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"$/
  );
  if (!match) {
    throw new Error(`Invalid function boundary CSV row: ${row}`);
  }

  const schema = match[1];
  const signature = match[2];
  const securityDefiner = match[3];
  const config = match[4];
  const effectiveAcl = match[5];
  if (
    schema === undefined ||
    signature === undefined ||
    securityDefiner === undefined ||
    config === undefined ||
    effectiveAcl === undefined
  ) {
    throw new Error(`Incomplete function boundary CSV row: ${row}`);
  }

  return { schema, signature, securityDefiner, config, effectiveAcl };
}

function boundaryKey(row: FunctionBoundaryRow): string {
  return row.signature.startsWith(`${row.schema}.`)
    ? row.signature
    : `${row.schema}.${row.signature}`;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function extractInsertStatement(source: string, tableName: string): string {
  const start = source.indexOf(`insert into ${tableName}`);
  if (start < 0) {
    throw new Error(`Missing INSERT for ${tableName}`);
  }

  const end = source.indexOf(';', start);
  if (end < 0) {
    throw new Error(`Unterminated INSERT for ${tableName}`);
  }

  return source.slice(start, end + 1);
}

function migrationExpectedAfterPairs(source: string): string[] {
  const insert = extractInsertStatement(
    source,
    'pr04_expected_private_execute_grants'
  );
  return sortedUnique(
    Array.from(
      insert.matchAll(
        /\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'[^']+'\s*,\s*true\s*,\s*(true|false)\)/g
      ),
      match => {
        const signature = match[1];
        const roleName = match[2];
        const expectedAfter = match[3];
        if (!signature || !roleName || !expectedAfter) {
          throw new Error('Invalid forward ACL contract tuple');
        }
        return expectedAfter === 'true' ? `${signature}|${roleName}` : '';
      }
    ).filter(Boolean)
  );
}

function rollbackExpectedPairs(source: string): string[] {
  const insert = extractInsertStatement(
    source,
    'pr04_expected_private_execute_grants'
  );
  return sortedUnique(
    Array.from(insert.matchAll(/\('([^']+)'\s*,\s*'([^']+)'\)/g), match => {
      const signature = match[1];
      const roleName = match[2];
      if (!signature || !roleName) {
        throw new Error('Invalid rollback ACL contract tuple');
      }
      return `${signature}|${roleName}`;
    })
  );
}

function evidenceExpectedPairs(rows: readonly FunctionBoundaryRow[]): string[] {
  return sortedUnique(
    rows
      .filter(row => row.schema === 'app_private')
      .flatMap(row =>
        row.effectiveAcl
          .split(';')
          .filter(roleName => roleName !== 'postgres')
          .map(roleName => `${row.signature}|${roleName}`)
      )
  );
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

  if (new Set(entries.map(([file]) => file)).size !== entries.length) {
    throw new Error('Duplicate commercial phase contract entry');
  }

  return Object.fromEntries(entries);
}

describe('commercial PR-04 migration contract', () => {
  const migrationPath = findSingleFile('supabase/migrations', MIGRATION_SUFFIX);
  const migrationName = path.basename(migrationPath);
  const rollbackPath = findSingleFile(
    'supabase/rollbacks',
    migrationName.replace(/\.sql$/, '_rollback.sql')
  );
  const migration = readRepositoryFile(migrationPath);
  const rollback = readRepositoryFile(rollbackPath);
  const normalizedMigration = normalizeExecutableSql(migration);
  const normalizedRollback = normalizeExecutableSql(rollback);

  it('ships the PR-04 specification, reviewed function matrix, and operations evidence', () => {
    for (const requiredPath of [
      SPEC_PATH,
      EVIDENCE_README_PATH,
      FUNCTION_MATRIX_PATH,
      FUNCTION_AFTER_PATH,
      CLEAN_REPLAY_PATH,
      EXTENSION_PREFLIGHT_PATH,
      AUTH_RUNBOOK_PATH,
    ]) {
      expect(fs.existsSync(path.resolve(process.cwd(), requiredPath))).toBe(
        true
      );
    }

    expect(readRepositoryFile(FUNCTION_MATRIX_PATH)).toContain(
      'schema,signature,security_definer,exposed_schema,data_api_callable'
    );

    const afterRows = readRepositoryFile(FUNCTION_AFTER_PATH)
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map(parseFunctionBoundaryRow);
    const afterBoundaries = Object.fromEntries(
      afterRows.map(row => [
        boundaryKey(row),
        `${row.securityDefiner}|${row.config}|${row.effectiveAcl}`,
      ])
    );
    expect(Object.keys(afterBoundaries)).toHaveLength(afterRows.length);
    expect(afterBoundaries).toEqual(EXPECTED_AFTER_BOUNDARIES);
    expect(readRepositoryFile(CLEAN_REPLAY_PATH)).toContain('`20260713004754`');
    expect(readRepositoryFile(CLEAN_REPLAY_PATH)).toContain(
      'Explicit RLS-helper EXECUTE grants: 26 / 26'
    );
    expect(readRepositoryFile(CLEAN_REPLAY_PATH)).toContain(
      'Exact non-owner `app_private` EXECUTE matrix: 28 / 28'
    );
  });

  it('keeps Auth hook config and both setup guides on the hardened private signature', () => {
    const expectedSignature = 'app_private.custom_access_token_hook';

    expect(readRepositoryFile(SUPABASE_CONFIG_PATH)).toContain(
      'pg-functions://postgres/app_private/custom_access_token_hook'
    );

    for (const setupPath of SETUP_PATHS) {
      const setup = readRepositoryFile(setupPath);
      expect(setup).toContain(`\`${expectedSignature}\``);
      expect(setup).not.toContain('`public.custom_access_token_hook`');
    }
  });

  it('fixes the exact normalize function search path and closes both flagged trigger functions', () => {
    expect(normalizedMigration).toContain(
      'alter function public.normalize_customer_phone(text) set search_path = public, auth, extensions;'
    );
    expect(normalizedMigration).toContain(
      'revoke execute on function public.update_reservation_notifications_updated_at() from public, anon, authenticated;'
    );
    expect(normalizedMigration).toContain(
      'revoke execute on function public.validate_shift_requests_clinic_refs() from public, anon, authenticated;'
    );
  });

  it('removes inherited PUBLIC execution from private functions and minimizes the Auth hook grant', () => {
    expect(normalizedMigration).toContain(
      'revoke execute on all functions in schema app_private from public;'
    );
    expect(normalizedMigration).toContain(
      'revoke execute on function app_private.custom_access_token_hook(jsonb) from public, anon, authenticated, service_role;'
    );
    expect(normalizedMigration).toContain(
      'grant execute on function app_private.custom_access_token_hook(jsonb) to supabase_auth_admin;'
    );
    expect(migration).toContain(
      'PR-04 preflight failed: app_private EXECUTE matrix drifted'
    );
    expect(migration).toContain(
      'PR-04 postflight failed: app_private EXECUTE matrix drifted'
    );
    expect(
      migration.match(/insert into pr04_expected_private_execute_grants/g)
    ).toHaveLength(2);

    const evidenceRows = readRepositoryFile(FUNCTION_AFTER_PATH)
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map(parseFunctionBoundaryRow);
    const expectedPairs = evidenceExpectedPairs(evidenceRows);
    expect(expectedPairs).toHaveLength(28);
    expect(migrationExpectedAfterPairs(migration)).toEqual(expectedPairs);
    expect(rollbackExpectedPairs(rollback)).toEqual(expectedPairs);
  });

  it('requires all reviewed privileged routines to remain SECURITY DEFINER', () => {
    expect(
      migration.match(/a reviewed SECURITY DEFINER function changed identity/g)
    ).toHaveLength(2);
    expect(rollback).toContain('a reviewed SECURITY DEFINER function drifted');
  });

  it('keeps future function defaults closed and verifies trigger bindings postflight', () => {
    expect(normalizedMigration).toContain(
      'alter default privileges for role postgres revoke execute on functions from public, anon, authenticated;'
    );
    expect(migration).toContain('reservation_notifications_updated_at_trigger');
    expect(migration).toContain('validate_shift_requests_clinic_refs_trigger');
    expect(migration).toContain('PR-04 postflight failed');
  });

  it('defers the relocatable btree_gist move until dependency and staging validation', () => {
    expect(migration).not.toMatch(
      /alter\s+extension\s+btree_gist\s+set\s+schema/i
    );
    expect(readRepositoryFile(EXTENSION_PREFLIGHT_PATH)).toContain(
      'extrelocatable=true'
    );
    expect(readRepositoryFile(EXTENSION_PREFLIGHT_PATH)).toContain(
      'separate reviewed migration'
    );
  });

  it('keeps rollback security-preserving', () => {
    expect(normalizedRollback).not.toMatch(
      /grant\s+execute[\s\S]*\b(?:public|anon|authenticated)\b/i
    );
    expect(normalizedRollback).not.toMatch(/alter\s+extension\s+btree_gist/i);
    expect(normalizedRollback).not.toMatch(
      /alter\s+function[\s\S]*reset\s+search_path/i
    );
    expect(rollback).toContain(
      'PR-04 rollback refused: app_private EXECUTE matrix drifted'
    );
    expect(rollback).toContain('reviewed forward-fix');
  });

  it('advances only the PR-04 function contracts to GREEN', () => {
    const runner = readRepositoryFile(RUNNER_PATH);
    expect(parsePhaseOutcomes(runner)).toEqual(EXPECTED_PHASE_OUTCOMES);
  });
});
