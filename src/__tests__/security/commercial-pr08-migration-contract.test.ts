/** @jest-environment node */

import * as fs from 'node:fs';
import * as path from 'node:path';

const MIGRATION_SUFFIX = '_commercial_atomic_staff_invite.sql';
const SPEC_PATH =
  'docs/stabilization/spec-commercial-atomic-staff-invite-v1.0.md';
const EVIDENCE_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr08/README.md';
const SQL_TEST_PATH = 'supabase/tests/commercial_atomic_staff_invite_test.sql';
const CONCURRENCY_VERIFIER_PATH =
  'scripts/commercial-hardening/verify-atomic-staff-invite.mjs';
const ACTIONS_PATH = 'src/app/(public)/invite/actions.ts';
const RED_RUNNER_PATH = 'scripts/commercial-hardening/run-red-contracts.mjs';
const INVITE_RUNNER_PATH =
  'scripts/commercial-hardening/run-red-invite-contract.mjs';
const GENERATED_TYPES_PATH = 'src/types/supabase.ts';
const CI_PATH = '.github/workflows/ci.yml';

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

describe('commercial PR-08 atomic staff invite contract', () => {
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

  it('ships the migration with its specification, evidence, pgTAP, concurrency verifier, and recovery guard', () => {
    for (const requiredPath of [
      SPEC_PATH,
      EVIDENCE_PATH,
      SQL_TEST_PATH,
      CONCURRENCY_VERIFIER_PATH,
    ]) {
      expect(fs.existsSync(path.join(repoRoot, requiredPath))).toBe(true);
    }

    expect(migration).toContain(`-- @spec ${SPEC_PATH}`);
    expect(migration).toContain(
      `-- @rollback ${rollbackPath.replace(/\\/g, '/')}`
    );
  });

  it('creates the exact service-only SECURITY DEFINER RPC with a fixed search path', () => {
    expect(normalizedMigration).toMatch(
      /create or replace function public\.accept_staff_invite_atomic\s*\(\s*p_token uuid\s*,\s*p_user_id uuid\s*,\s*p_account_email text\s*\)\s*returns jsonb/
    );
    expect(normalizedMigration).toContain('language plpgsql');
    expect(normalizedMigration).toContain('security definer');
    expect(normalizedMigration).toContain('set search_path = pg_catalog');
    expect(normalizedMigration).toContain(
      'revoke all on function public.accept_staff_invite_atomic(uuid, uuid, text) from public, anon, authenticated, service_role'
    );
    expect(normalizedMigration).toContain(
      'grant execute on function public.accept_staff_invite_atomic(uuid, uuid, text) to service_role'
    );
    expect(normalizedMigration).toContain('do $acl_scrub$');
    expect(normalizedMigration).toContain('for grantee_name in');
    expect(normalizedMigration).toContain(
      "acl.grantee not in (p.proowner, 'service_role'::regrole)"
    );
    expect(normalizedMigration).toContain('and not acl.is_grantable');
  });

  it('locks before validating and derives every authorization value from trusted rows', () => {
    expect(normalizedMigration).toMatch(
      /from public\.staff_invites[\s\S]*where token = p_token[\s\S]*for update/
    );
    expect(normalizedMigration).toContain('clock_timestamp()');
    expect(normalizedMigration).toMatch(
      /(?:pg_catalog\.)?lower\((?:pg_catalog\.)?btrim\(p_account_email\)\)/
    );
    expect(normalizedMigration).toMatch(
      /(?:pg_catalog\.)?lower\((?:pg_catalog\.)?btrim\(v_invite\.email::text\)\)/
    );
    expect(normalizedMigration).toContain(
      "v_invite.role::text not in ('manager', 'therapist', 'staff')"
    );
    expect(normalizedMigration).toMatch(
      /from auth\.users[\s\S]*where id = p_user_id/
    );
    expect(normalizedMigration).not.toMatch(
      /(?:clinic_id|role)\s*[:=]\s*p_(?:clinic_id|role)/
    );
  });

  it('fails closed on duplicate tokens and makes the row-lock lookup unambiguous', () => {
    expect(normalizedMigration).toMatch(
      /from public\.staff_invites[\s\S]*group by token[\s\S]*having count\(\*\) > 1/
    );
    expect(normalizedMigration).toContain(
      'add constraint staff_invites_token_key unique (token)'
    );
  });

  it('keeps profile, permission, invite claim, and audit writes in one uncaught function transaction', () => {
    expect(normalizedMigration).toContain('insert into public.profiles');
    expect(normalizedMigration).toContain('on conflict (user_id) do update');
    expect(normalizedMigration).toContain(
      'insert into public.user_permissions'
    );
    expect(normalizedMigration).toContain('on conflict (staff_id) do update');
    expect(normalizedMigration).toContain('update public.staff_invites');
    expect(normalizedMigration).toContain('insert into public.security_events');
    expect(normalizedMigration).not.toMatch(/exception\s+when/);
  });

  it('retires the client-executable legacy acceptance path without changing staff identity semantics', () => {
    expect(normalizedMigration).toContain(
      'revoke all on function public.accept_invite(uuid) from public, anon, authenticated, service_role'
    );
    expect(normalizedMigration).not.toMatch(
      /alter table public\.user_permissions[\s\S]*staff_id/
    );
    expect(normalizedMigration).not.toMatch(
      /(?:insert into|update|delete from) public\.staff\b/
    );
  });

  it('uses the atomic RPC as the only application acceptance write path', () => {
    const actions = readRepositoryFile(ACTIONS_PATH);
    const helperStart = actions.indexOf('async function acceptInviteForUser');
    const helperEnd = actions.indexOf('export type InviteInfo', helperStart);
    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);

    const helper = actions.slice(helperStart, helperEnd);
    expect(helper).toMatch(/\.rpc\(\s*['"]accept_staff_invite_atomic['"]/);
    expect(helper).not.toContain('.from(');
    expect(actions).not.toContain("from('profiles').insert");
    expect(actions).not.toContain('MANAGED_PASSWORD_PLACEHOLDER');
  });

  it('promotes both PR-08 RED runners to GREEN only after the implementation exists', () => {
    const redRunner = readRepositoryFile(RED_RUNNER_PATH);
    const inviteRunner = readRepositoryFile(INVITE_RUNNER_PATH);
    const packageJson = JSON.parse(readRepositoryFile('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(redRunner).toMatch(
      /'07_atomic_staff_invite\.sql',[\s\S]*outcome:\s*'green'/
    );
    expect(inviteRunner).toContain('GREEN COMM-INVITE-003');
    expect(packageJson.scripts?.['commercial:verify:invite:local']).toBe(
      'node scripts/commercial-hardening/verify-atomic-staff-invite.mjs --local'
    );
    const concurrencyVerifier = readRepositoryFile(CONCURRENCY_VERIFIER_PATH);
    expect(concurrencyVerifier).toContain(
      '/rest/v1/rpc/accept_staff_invite_atomic'
    );
    expect(concurrencyVerifier).toContain("['anon', anonResult]");
    expect(concurrencyVerifier).toContain(
      "['authenticated', authenticatedResult]"
    );
    expect(concurrencyVerifier).toContain('runtime.serviceRoleKey');
    expect(readRepositoryFile(CI_PATH)).toContain(
      'npm run commercial:verify:invite:local'
    );
  });

  it('checks the exact routine identity and regenerates the Supabase RPC type', () => {
    const generatedTypes = readRepositoryFile(GENERATED_TYPES_PATH);

    expect(normalizedMigration).toContain(
      "count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'accept_staff_invite_atomic'"
    );
    expect(normalizedMigration).toContain("owner_role.rolname = 'postgres'");
    expect(normalizedMigration).toContain("p.provolatile = 'v'");
    expect(normalizedMigration).toContain(
      "p.proconfig = array['search_path=pg_catalog']::text[]"
    );
    expect(generatedTypes).toMatch(
      /accept_staff_invite_atomic:\s*\{\s*Args:\s*\{\s*p_account_email:\s*string;\s*p_token:\s*string;\s*p_user_id:\s*string;?\s*\};\s*Returns:\s*Json;/
    );
  });

  it('keeps recovery fail-closed and documents the unresolved staff_id semantic blocker', () => {
    const spec = readRepositoryFile(SPEC_PATH);
    const evidence = readRepositoryFile(EVIDENCE_PATH);

    expect(normalizedRollback).not.toContain(
      'drop function public.accept_staff_invite_atomic'
    );
    expect(normalizedRollback).not.toMatch(
      /grant execute[\s\S]*to (?:public|anon|authenticated)/
    );
    expect(normalizedRollback).not.toMatch(
      /grant execute[\s\S]*public\.accept_invite\(uuid\)/
    );
    expect(spec).toContain('user_permissions.staff_id');
    expect(spec).toContain('decision: BLOCK');
    expect(evidence).toContain('user_permissions.staff_id');
  });
});
