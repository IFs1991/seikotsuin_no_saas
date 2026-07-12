import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH =
  'supabase/migrations/20260712075529_commercial_privilege_baseline_hardening.sql';
const ROLLBACK_PATH =
  'supabase/rollbacks/20260712075529_commercial_privilege_baseline_hardening_rollback.sql';
const MATRIX_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr02/privilege-matrix.csv';
const RED_CONTRACT_PATH =
  'scripts/commercial-hardening/red-contracts/02_default_client_privileges.sql';
const RUNNER_PATH = 'scripts/commercial-hardening/run-red-contracts.mjs';

type MatrixRow = {
  objectName: string;
  classification: string;
  anonPrivileges: string;
  authenticatedPrivileges: string;
};

function readRepositoryFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

function readMatrix(): MatrixRow[] {
  const [header, ...lines] = readRepositoryFile(MATRIX_PATH)
    .trim()
    .split(/\r?\n/);

  expect(header).toBe(
    'schema,object_type,object_name,classification,anon_privileges,authenticated_privileges,service_role_target,evidence'
  );

  return lines.map(line => {
    const fields = line.split(',').map(value => value.replace(/^"|"$/g, ''));

    if (fields.length !== 8) {
      throw new Error(`Invalid PR-02 matrix row: ${line}`);
    }

    return {
      objectName: fields[2] ?? '',
      classification: fields[3] ?? '',
      anonPrivileges: fields[4] ?? '',
      authenticatedPrivileges: fields[5] ?? '',
    };
  });
}

function extractAuthenticatedGrant(
  migration: string,
  privilege: 'select' | 'insert' | 'update' | 'delete'
): string[] {
  const pattern = new RegExp(
    `grant ${privilege} on table([\\s\\S]*?)to authenticated;`,
    'i'
  );
  const body = migration.match(pattern)?.[1];
  if (!body) {
    throw new Error(`Missing authenticated ${privilege} grant block`);
  }

  return [...body.matchAll(/public\.([a-z0-9_]+)/g)]
    .map(match => match[1] ?? '')
    .filter(Boolean)
    .sort();
}

describe('commercial PR-02 migration contract', () => {
  const migration = readRepositoryFile(MIGRATION_PATH);
  const rollback = readRepositoryFile(ROLLBACK_PATH);
  const redContract = readRepositoryFile(RED_CONTRACT_PATH);
  const runner = readRepositoryFile(RUNNER_PATH);
  const matrix = readMatrix();

  it('classifies every reviewed public relation exactly once', () => {
    const names = matrix.map(row => row.objectName);

    expect(matrix).toHaveLength(95);
    expect(new Set(names).size).toBe(95);
    expect(names).toEqual(expect.arrayContaining(['profiles', 'revenues']));
    expect(names).toEqual(
      expect.arrayContaining([
        'clinic_hierarchy',
        'daily_reservation_stats',
        'staff_performance_summary',
      ])
    );
  });

  it('keeps anon closed and dangerous client privileges out of the matrix', () => {
    expect(matrix.every(row => row.anonPrivileges === 'NONE')).toBe(true);
    for (const row of matrix) {
      expect(row.authenticatedPrivileges).not.toMatch(
        /TRUNCATE|REFERENCES|TRIGGER|MAINTAIN/
      );
    }
  });

  it.each(['select', 'insert', 'update', 'delete'] as const)(
    'keeps the migration %s grant block identical to the reviewed matrix',
    privilege => {
      const expected = matrix
        .filter(row =>
          row.authenticatedPrivileges
            .split(';')
            .includes(privilege.toUpperCase())
        )
        .map(row => row.objectName)
        .sort();

      expect(extractAuthenticatedGrant(migration, privilege)).toEqual(expected);
    }
  );

  it('preserves only the reviewed profile self-service update columns', () => {
    const profile = matrix.find(row => row.objectName === 'profiles');

    expect(profile?.authenticatedPrivileges).toBe(
      'SELECT;UPDATE_COLUMNS(avatar_url|full_name|language_preference|last_login_at|phone_number|timezone|updated_at)'
    );
    expect(migration).toContain(
      'grant update (\n  avatar_url,\n  full_name,\n  language_preference,\n  last_login_at,\n  phone_number,\n  timezone,\n  updated_at\n)\non table public.profiles\nto authenticated;'
    );
  });

  it('keeps the elevated legacy heatmap join clinic-consistent', () => {
    expect(migration).toContain(
      "if to_regprocedure('public.get_hourly_visit_pattern(uuid)') is null then"
    );
    expect(migration).toContain(
      'create or replace function public.get_hourly_visit_pattern(clinic_uuid uuid)'
    );
    expect(migration).toContain('security invoker');
    expect(migration).toContain('set search_path = public, auth, extensions');
    expect(migration).toContain(
      'left join public.revenues r\n    on r.visit_id = v.id\n    and r.clinic_id = v.clinic_id'
    );
  });

  it('removes inherited defaults and never introduces client GRANT ALL', () => {
    expect(migration).toContain(
      'alter default privileges for role postgres in schema public'
    );
    expect(migration).toContain(
      'alter default privileges for role postgres\n  revoke execute on functions from public, anon, authenticated;'
    );
    expect(migration).toContain(
      'revoke all privileges on all tables in schema public\n  from public, anon, authenticated;'
    );
    expect(migration).not.toMatch(
      /grant all(?: privileges)?[\s\S]*?to (?:anon|authenticated)/i
    );
    expect(migration).toMatch(
      /and c\.relkind in \('r', 'p', 'v', 'm', 'S', 'f'\)\n      and acl\.grantee = 0/
    );
    expect(migration).toContain(
      "or (c.relkind = 'S' and grantee.rolname = 'authenticated')"
    );
  });

  it('keeps the rollback security-preserving', () => {
    const executableRollback = rollback.replace(/^--.*$/gm, '');

    expect(executableRollback).not.toMatch(/\bgrant\b/i);
    expect(executableRollback).not.toMatch(/alter default privileges/i);
    expect(rollback).toContain('Use a reviewed forward-fix');
  });

  it('documents the bounded platform and legacy exceptions', () => {
    const supabaseAdminObjects = matrix.filter(
      row => row.classification === 'PLATFORM_EXTENSION'
    );
    const legacyObjects = matrix
      .filter(row => row.classification === 'LEGACY_QUARANTINE')
      .map(row => row.objectName)
      .sort();

    expect(supabaseAdminObjects).toHaveLength(0);
    expect(legacyObjects).toEqual([
      'appointments',
      'revenues',
      'treatment_menu_records',
      'treatments',
      'visits',
    ]);
    expect(migration).toContain(
      'supabase_admin owns extension-managed routines only'
    );
    expect(redContract).toContain("d.refclassid = 'pg_extension'::regclass");
  });

  it('expects only the remediated PR-02 DB contract to be GREEN', () => {
    expect(runner).toMatch(
      /'02_default_client_privileges\.sql',[\s\S]*?outcome: 'green'/
    );
    expect(runner).toMatch(
      /'03_private_function_execute\.sql',[\s\S]*?outcome: 'red'/
    );
  });
});
