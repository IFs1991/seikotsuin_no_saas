/** @jest-environment node */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MIGRATION_SUFFIX = '_commercial_legacy_quarantine.sql';
const SPEC_PATH =
  'docs/stabilization/spec-commercial-legacy-quarantine-v1.0.md';
const DELETION_CANDIDATE_SPEC_PATH =
  'docs/stabilization/spec-commercial-legacy-deletion-candidates-v0.1.md';
const EVIDENCE_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr07/README.md';
const DATA_EVIDENCE_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr07/data-preservation-before.csv';
const INVENTORY_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr07/runtime-reference-inventory.json';
const QUARANTINE_MATRIX_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr07/legacy-quarantine-matrix.csv';
const SQL_TEST_PATH = 'supabase/tests/commercial_legacy_quarantine_test.sql';
const RUNNER_PATH = 'scripts/commercial-hardening/run-red-contracts.mjs';
const VERIFIER_PATH =
  'scripts/commercial-hardening/verify-legacy-quarantine.mjs';

const LEGACY_TABLES = [
  'appointments',
  'revenues',
  'treatment_menu_records',
  'treatments',
  'visits',
] as const;

const READ_ONLY_SERVICE_TABLES = ['revenues', 'visits'] as const;

const STALE_POLICIES = [
  ['appointments_select_for_staff', 'appointments'],
  ['revenues_delete_for_admin', 'revenues'],
  ['revenues_insert_for_managers', 'revenues'],
  ['revenues_select_for_managers', 'revenues'],
  ['revenues_update_for_managers', 'revenues'],
  ['visits_delete_for_managers', 'visits'],
  ['visits_insert_for_staff', 'visits'],
  ['visits_select_for_staff', 'visits'],
  ['visits_update_for_staff', 'visits'],
] as const;

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

function parseCommaSeparatedRelations(statementBody: string): string[] {
  return statementBody
    .split(',')
    .map(relation => relation.trim().replace(/^public\./, ''))
    .sort();
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

function expectNoLegacyDataOrDestructiveSchemaMutation(sql: string): void {
  for (const table of LEGACY_TABLES) {
    const relation = `(?:public\\.)?${table}`;
    expect(sql).not.toMatch(
      new RegExp(`\\binsert\\s+into\\s+${relation}\\b`)
    );
    expect(sql).not.toMatch(
      new RegExp(`\\bupdate\\s+(?:only\\s+)?${relation}\\b`)
    );
    expect(sql).not.toMatch(
      new RegExp(`\\bdelete\\s+from\\s+(?:only\\s+)?${relation}\\b`)
    );
    expect(sql).not.toMatch(
      new RegExp(`\\btruncate\\s+(?:table\\s+)?[^;]*\\b${relation}\\b`)
    );
    expect(sql).not.toMatch(
      new RegExp(`\\bdrop\\s+table\\s+(?:if\\s+exists\\s+)?${relation}\\b`)
    );
    expect(sql).not.toMatch(
      new RegExp(
        `\\balter\\s+table\\s+(?:only\\s+)?${relation}[^;]*\\b(?:drop\\s+(?:column|constraint)|alter\\s+column)\\b`
      )
    );
  }
}

describe('commercial PR-07 legacy quarantine migration contract', () => {
  const migrationPath = findSingleFile('supabase/migrations', MIGRATION_SUFFIX);
  const migrationName = path.basename(migrationPath);
  const rollbackPath = findSingleFile(
    'supabase/rollbacks',
    migrationName.replace(/\.sql$/, '_rollback.sql')
  );
  const migration = readRepositoryFile(migrationPath);
  const rollback = readRepositoryFile(rollbackPath);
  const normalizedMigration = normalizeExecutableSql(migration);

  it('ships one migration with its specification, evidence, pgTAP, and recovery guard', () => {
    for (const requiredPath of [
      SPEC_PATH,
      DELETION_CANDIDATE_SPEC_PATH,
      EVIDENCE_PATH,
      DATA_EVIDENCE_PATH,
      INVENTORY_PATH,
      QUARANTINE_MATRIX_PATH,
      SQL_TEST_PATH,
    ]) {
      expect(fs.existsSync(path.join(repoRoot, requiredPath))).toBe(true);
    }

    expect(migration).toContain(`-- @spec ${SPEC_PATH}`);
    expect(migration).toContain(
      `-- @rollback ${rollbackPath.replace(/\\/g, '/')}`
    );
  });

  it('quarantines exactly five relations and drops the exact nine stale policies', () => {
    const contractStart = normalizedMigration.indexOf(
      'insert into pr07_legacy_contract'
    );
    const contractEnd = normalizedMigration.indexOf(
      'create temporary table pr07_policy_contract',
      contractStart
    );
    expect(contractStart).toBeGreaterThanOrEqual(0);
    expect(contractEnd).toBeGreaterThan(contractStart);

    const contractValues = normalizedMigration.slice(
      contractStart,
      contractEnd
    );
    const contractRelations = Array.from(
      contractValues.matchAll(/'public\.([a-z_]+)'/g),
      match => {
        const relation = match[1];
        if (!relation) {
          throw new Error('Invalid PR-07 legacy relation contract entry');
        }
        return relation;
      }
    ).sort();

    expect(normalizedMigration).toContain(
      'create temporary table pr07_legacy_contract'
    );
    expect(contractRelations).toEqual([...LEGACY_TABLES].sort());

    for (const table of LEGACY_TABLES) {
      expect(normalizedMigration).toContain(
        `alter table public.${table} enable row level security`
      );
      expect(normalizedMigration).toContain(`comment on table public.${table}`);
    }
    expect(
      normalizedMigration.match(/enable row level security/g) ?? []
    ).toHaveLength(LEGACY_TABLES.length);

    for (const [policy, table] of STALE_POLICIES) {
      expect(normalizedMigration).toMatch(
        new RegExp(
          `drop\\s+policy(?:\\s+if\\s+exists)?\\s+${policy}\\s+on\\s+public\\.${table}`
        )
      );
    }
    expect(normalizedMigration.match(/\bdrop\s+policy\b/g) ?? []).toHaveLength(
      STALE_POLICIES.length
    );
  });

  it('sets the exact fail-closed table and function privilege boundary', () => {
    const relationRevoke = normalizedMigration.match(
      /revoke all privileges on table ([^;]+) from public, anon, authenticated, service_role;/
    );
    const serviceReadGrant = normalizedMigration.match(
      /grant select on table ([^;]+) to service_role;/
    );

    expect(relationRevoke?.[1]).toBeDefined();
    expect(serviceReadGrant?.[1]).toBeDefined();
    expect(parseCommaSeparatedRelations(relationRevoke?.[1] ?? '')).toEqual(
      [...LEGACY_TABLES].sort()
    );
    expect(parseCommaSeparatedRelations(serviceReadGrant?.[1] ?? '')).toEqual(
      [...READ_ONLY_SERVICE_TABLES].sort()
    );

    expect(normalizedMigration).toContain(
      'revoke all privileges on function public.get_hourly_visit_pattern(uuid) from public, anon, authenticated, service_role'
    );
    expect(normalizedMigration).toContain(
      'grant execute on function public.get_hourly_visit_pattern(uuid) to service_role'
    );
    expect(normalizedMigration).not.toMatch(
      /grant\s+(?:select|execute)[^;]+\s+to\s+(?:public|anon|authenticated)\b/
    );
  });

  it('depends on PR-06 and fails closed on nullable rows and data drift', () => {
    expect(migration).toContain('20260714120318');
    expect(migration).toContain('supabase_migrations.schema_migrations');
    expect(migration).toContain('PR-07 preflight');
    expect(migration).toContain('PR-07 postflight');
    expect(normalizedMigration).toContain('pr07_data_snapshot');
    expect(normalizedMigration).toContain('pr07_function_contract');
    expect(normalizedMigration).toContain('routine.prosrc');
    expect(normalizedMigration).toContain('r.clinic_id = v.clinic_id');
    expect(normalizedMigration).toContain('v.clinic_id = clinic_uuid');
    expect(normalizedMigration).toMatch(/clinic_id\s+is\s+null/);
    expect(normalizedMigration).toMatch(/count\s*\(\s*\*\s*\)/);
    expect(normalizedMigration).toMatch(
      /(?:row_count|current_count)[^;]*<>[^;]*(?:row_count|snapshot)/
    );
  });

  it('preserves rows and schema while changing only quarantine metadata', () => {
    expectNoLegacyDataOrDestructiveSchemaMutation(normalizedMigration);
    expect(normalizedMigration).not.toMatch(/\bdrop\s+table\b/);
    expect(normalizedMigration).not.toMatch(/\bdrop\s+column\b/);
    expect(normalizedMigration).not.toMatch(/\bdrop\s+constraint\b/);
    expect(normalizedMigration).not.toMatch(/\bdrop\s+index\b/);
    expect(normalizedMigration).not.toMatch(/\balter\s+column\b/);
    expect(normalizedMigration).not.toMatch(/\bcreate\s+policy\b/);
    expect(normalizedMigration).not.toMatch(/disable\s+row\s+level\s+security/);
  });

  it('keeps recovery validation-only and directs failures to a forward fix', () => {
    const executableRollback = normalizeExecutableSql(rollback);

    expect(executableRollback).toContain("set local statement_timeout = '60s'");
    expect(executableRollback).toContain('pr07_legacy_contract');
    expect(rollback).toContain('reviewed forward-fix');
    expect(executableRollback).not.toMatch(/(?:^|;)\s*(?:grant|revoke)\s+/);
    expect(executableRollback).not.toMatch(/(?:^|;)\s*create\s+policy\b/);
    expect(executableRollback).not.toMatch(/(?:^|;)\s*drop\s+policy\b/);
    expect(executableRollback).not.toMatch(
      /(?:enable|disable)\s+row\s+level\s+security/
    );
    expectNoLegacyDataOrDestructiveSchemaMutation(executableRollback);
    expect(executableRollback).not.toMatch(/\bdrop\s+table\s+public\./);
    expect(executableRollback).not.toMatch(
      /alter\s+table\s+public\.[^;]+\bdrop\s+column\b/
    );
    expect(executableRollback).not.toMatch(
      /alter\s+table\s+public\.[^;]+\balter\s+column\b/
    );
  });

  it('advances only PR-07 while keeping the PR-08 invite contract RED', () => {
    const outcomes = parsePhaseOutcomes(readRepositoryFile(RUNNER_PATH));

    expect(outcomes['06a_legacy_quarantine.sql']).toBe('green');
    expect(outcomes['07_atomic_staff_invite.sql']).toBe('red');
  });

  it('verifies the exact read-only runtime reference inventory', () => {
    const verification = spawnSync(
      process.execPath,
      [path.join(repoRoot, VERIFIER_PATH), '--check'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        windowsHide: true,
      }
    );

    if (verification.error) {
      throw verification.error;
    }
    if (verification.status !== 0) {
      throw new Error(
        `Legacy quarantine verifier failed:\n${verification.stdout}${verification.stderr}`
      );
    }

    const inventory: unknown = JSON.parse(readRepositoryFile(INVENTORY_PATH));
    expect(inventory).toEqual({
      schemaVersion: 2,
      generatedBy: VERIFIER_PATH,
      scope:
        'src runtime JS/TS variants plus E2E and connection scripts, excluding __tests__, legacy, generated types, and non-literal/computed database object names',
      scanSummary: {
        operationalFiles: expect.arrayContaining([
          'scripts/e2e/cleanup-e2e-data.mjs',
          'scripts/e2e/preflight.mjs',
          'scripts/e2e/seed-e2e-data.mjs',
          'scripts/verify-supabase-connection.mjs',
        ]),
      },
      contract: {
        quarantinedTables: [...LEGACY_TABLES],
        writeMethods: ['delete', 'insert', 'update', 'upsert'],
        allowedTableReferences: [
          {
            name: 'revenues',
            path: 'src/app/api/clinic/analysis/route.ts',
            methods: ['eq', 'limit', 'order', 'select'],
          },
        ],
        allowedRpcReferences: [
          {
            name: 'get_hourly_visit_pattern',
            path: 'src/lib/dashboard/read-model.ts',
            methods: [],
          },
        ],
      },
      tables: [
        {
          name: 'appointments',
          status: 'NO_LITERAL_RUNTIME_REFERENCE',
          references: [],
        },
        {
          name: 'revenues',
          status: 'REVIEWED_READ_REFERENCE',
          references: [
            {
              name: 'revenues',
              path: 'src/app/api/clinic/analysis/route.ts',
              line: expect.any(Number),
              methods: ['eq', 'limit', 'order', 'select'],
            },
          ],
        },
        {
          name: 'treatment_menu_records',
          status: 'NO_LITERAL_RUNTIME_REFERENCE',
          references: [],
        },
        {
          name: 'treatments',
          status: 'NO_LITERAL_RUNTIME_REFERENCE',
          references: [],
        },
        {
          name: 'visits',
          status: 'NO_LITERAL_RUNTIME_REFERENCE',
          references: [],
        },
      ],
      rpcReferences: [
        {
          name: 'get_hourly_visit_pattern',
          path: 'src/lib/dashboard/read-model.ts',
          line: expect.any(Number),
          methods: [],
        },
      ],
      operationalScriptReferences: [],
      limitations: [
        'Computed table or RPC names cannot be attributed to a catalog object statically.',
        'The PR-07 SQL contract verifies only the reviewed get_hourly_visit_pattern(uuid) body; other database-side legacy dependencies and transitive callers remain a deletion-gate residual risk.',
      ],
    });
  });
});
