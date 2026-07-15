/** @jest-environment node */

import * as fs from 'node:fs';
import * as path from 'node:path';

const MIGRATION_SUFFIX = '_commercial_auth_authority_fail_closed.sql';
const SPEC_PATH = 'docs/stabilization/spec-commercial-auth-authority-v1.0.md';
const EVIDENCE_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr09/README.md';
const SQL_TEST_PATH = 'supabase/tests/commercial_auth_authority_test.sql';
const AUTH_CONTEXT_PATH = 'src/lib/supabase/auth-context.ts';
const SERVER_PATH = 'src/lib/supabase/server.ts';
const ADMIN_LOGIN_PATH = 'src/app/(public)/admin/actions.ts';
const CLIENT_PROFILE_PATH = 'src/hooks/useUserProfile.ts';
const AUTHORITY_GUARDED_PAGE_PATHS = [
  'src/app/(app)/mobile-uiux/page.tsx',
  'src/app/(app)/admin/(protected)/billing/page.tsx',
  'src/app/(app)/admin/(protected)/session-management/page.tsx',
] as const;
const ROLLBACK_NEGATIVE_PATH =
  'supabase/tests/commercial_auth_authority_rollback_guard_negative_test.sql';
const ROLLBACK_NEGATIVE_RUNNER_PATH =
  'scripts/commercial-hardening/verify-pr09-rollback-guard-negative.mjs';

const repoRoot = path.resolve(__dirname, '../../..');

function readRepositoryFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
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

describe('commercial PR-09 DB-authoritative auth contract', () => {
  const migrationPath = findSingleFile('supabase/migrations', MIGRATION_SUFFIX);
  const migrationName = path.basename(migrationPath);
  const rollbackPath = findSingleFile(
    'supabase/rollbacks',
    migrationName.replace(/\.sql$/, '_rollback.sql')
  );
  const migration = readRepositoryFile(migrationPath);
  const normalizedMigration = normalizeExecutableSql(migration);
  const rollback = readRepositoryFile(rollbackPath);
  const normalizedRollback = normalizeExecutableSql(rollback);

  it('ships one migration with its specification, fail-closed rollback, evidence, and pgTAP', () => {
    for (const requiredPath of [SPEC_PATH, EVIDENCE_PATH, SQL_TEST_PATH]) {
      expect(fs.existsSync(path.join(repoRoot, requiredPath))).toBe(true);
    }

    expect(migration).toContain(`-- @spec ${SPEC_PATH}`);
    expect(migration).toContain(
      `-- @rollback ${rollbackPath.replace(/\\/g, '/')}`
    );
    expect(normalizedRollback).not.toMatch(
      /claims[\s\S]*app_metadata[\s\S]*(?:user_role|clinic_id)[\s\S]*return/
    );
    expect(rollback).toContain('forward-fix');
  });

  it('pins rollback recovery to exact function, policy, and grantability contracts', () => {
    const negativeFixture = readRepositoryFile(ROLLBACK_NEGATIVE_PATH);
    const negativeRunner = readRepositoryFile(ROLLBACK_NEGATIVE_RUNNER_PATH);
    const packageJson = readRepositoryFile('package.json');

    expect(normalizedRollback).toContain('expected_definition_hash');
    expect(normalizedRollback).toContain('expected_expression_hash');
    expect(normalizedRollback).toContain('acl.is_grantable');
    expect(negativeFixture).toContain(
      'pr09_run_rollback_guard_negative_policy'
    );
    expect(negativeFixture).toContain(
      'pr09_run_rollback_guard_negative_function'
    );
    expect(negativeRunner).toContain('pr09_run_rollback_guard_negative_policy');
    expect(negativeRunner).toContain(
      'pr09_run_rollback_guard_negative_function'
    );
    expect(negativeRunner).toContain(
      'pr09_run_rollback_guard_negative_extra_policy'
    );
    expect(negativeRunner).toContain(
      'pr09_run_rollback_guard_negative_column_acl'
    );
    expect(packageJson).toContain(
      'commercial:verify:pr09:rollback-guard:local'
    );
  });

  it('makes active profile plus user_permissions the role and clinic authority', () => {
    for (const signature of [
      'app_private.get_current_role()',
      'app_private.get_current_clinic_id()',
      'app_private.jwt_clinic_id()',
      'app_private.can_access_clinic(target_clinic_id uuid)',
      'app_private.jwt_is_admin()',
      'app_private.custom_access_token_hook(event jsonb)',
    ]) {
      expect(normalizedMigration).toContain(
        `create or replace function ${signature}`
      );
    }

    expect(normalizedMigration).toContain('from public.user_permissions');
    expect(normalizedMigration).toMatch(/(?:from|join) public\.profiles/);
    expect(normalizedMigration).toMatch(/is_active\s+is\s+true/);
    expect(normalizedMigration).toContain(
      'from public.manager_clinic_assignments'
    );
    expect(normalizedMigration).toContain('revoked_at is null');
  });

  it('uses JWT clinic scope only as an intersection and clears stale hook claims', () => {
    expect(normalizedMigration).toContain('jsonb_array_elements_text');
    expect(normalizedMigration).toMatch(
      /jwt[\s\S]*scope[\s\S]*(?:intersect|= any)/
    );
    expect(normalizedMigration).toContain("v_claims - 'user_role'");
    expect(normalizedMigration).toContain("v_claims - 'clinic_id'");
    expect(normalizedMigration).toContain("v_claims - 'clinic_scope_ids'");
  });

  it('keeps private helpers SECURITY DEFINER with a fixed search path and reviewed ACLs', () => {
    expect(
      normalizedMigration.match(/security definer/g)?.length
    ).toBeGreaterThanOrEqual(5);
    expect(
      normalizedMigration.match(/set search_path = pg_catalog/g)?.length
    ).toBeGreaterThanOrEqual(5);
    for (const signature of [
      'app_private.get_current_role()',
      'app_private.get_current_clinic_id()',
      'app_private.jwt_clinic_id()',
      'app_private.can_access_clinic(uuid)',
      'app_private.jwt_is_admin()',
    ]) {
      expect(normalizedMigration).toContain(
        `revoke all on function ${signature} from public, anon, authenticated, service_role`
      );
      expect(normalizedMigration).toContain(
        `grant execute on function ${signature} to anon, authenticated, service_role`
      );
    }
    expect(normalizedMigration).toContain(
      'revoke all on function app_private.custom_access_token_hook(jsonb) from public, anon, authenticated, service_role, supabase_auth_admin'
    );
    expect(normalizedMigration).toContain(
      'grant execute on function app_private.custom_access_token_hook(jsonb) to supabase_auth_admin'
    );
  });

  it('removes direct JWT and profile-role authority from effective RLS policies', () => {
    expect(normalizedMigration).toContain(
      'alter policy "users can view their own notifications" on public.notifications'
    );
    expect(normalizedMigration).toContain('pr09_policy_authority_contract');
    expect(normalizedMigration).toContain("position('auth.jwt()'");
    expect(normalizedMigration).toContain("position('request.jwt.claims'");
    expect(normalizedMigration).toContain("position('profiles.role'");
    expect(normalizedMigration).toContain("position('profiles.clinic_id'");
    expect(normalizedMigration).toContain(
      "alter policy staff_profiles_select_scoped on public.staff_profiles to authenticated using ( (select app_private.get_current_role()) <> '' and user_id = (select auth.uid()) )"
    );
    expect(normalizedMigration).toContain(
      'alter policy staff_clinic_memberships_select_scoped on public.staff_clinic_memberships to authenticated using (app_private.can_access_clinic(clinic_id))'
    );
    expect(normalizedMigration).toContain(
      'alter policy clinic_feature_flags_select_scoped on public.clinic_feature_flags to authenticated using (app_private.can_access_clinic(clinic_id))'
    );
    for (const retiredPolicy of [
      'staff_profiles_write_admin_only',
      'staff_clinic_memberships_write_admin_only',
      'clinic_feature_flags_write_admin_only',
    ]) {
      expect(normalizedMigration).toContain(`drop policy ${retiredPolicy}`);
    }
    expect(normalizedMigration).toContain(
      'pr-09 postflight: staff or feature policy set drift'
    );
    expect(normalizedMigration).toContain('has_column_privilege');
    expect(normalizedRollback).toContain(
      'pr-09 recovery guard: staff or feature policy set drift'
    );
    expect(normalizedRollback).toContain('has_column_privilege');
  });

  it('distinguishes authority lookup states and never restores DB role or clinic from metadata', () => {
    const authContext = readRepositoryFile(AUTH_CONTEXT_PATH);
    const server = readRepositoryFile(SERVER_PATH);
    const adminLogin = readRepositoryFile(ADMIN_LOGIN_PATH);
    const clientProfile = readRepositoryFile(CLIENT_PROFILE_PATH);

    expect(authContext).toMatch(
      /type PermissionLookupResult[\s\S]*status: 'found'[\s\S]*status: 'missing'[\s\S]*status: 'error'/
    );
    expect(authContext).toMatch(
      /type ProfileStatusLookupResult[\s\S]*status: 'found'[\s\S]*status: 'missing'[\s\S]*status: 'error'/
    );
    expect(authContext).not.toContain('roleFromJwt');
    expect(authContext).not.toContain('clinicIdFromJwt');
    expect(server).toContain('applyJwtClinicScopeIntersection');
    expect(server).toContain('DATABASE_CONNECTION_ERROR');
    expect(adminLogin).not.toContain('ensureProfileExists');
    expect(clientProfile).not.toContain('appMeta?.user_role');
    expect(clientProfile).not.toContain('appMeta?.clinic_id');
  });

  it('routes repeated protected-page authority failures through the blank 503 boundary', () => {
    for (const guardedPagePath of AUTHORITY_GUARDED_PAGE_PATHS) {
      expect(readRepositoryFile(guardedPagePath)).toContain(
        'withAuthorityUnavailableRedirect'
      );
    }
  });
});
