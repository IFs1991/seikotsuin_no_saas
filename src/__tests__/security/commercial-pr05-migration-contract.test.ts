import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_SUFFIX = '_commercial_core_tenant_composite_fks.sql';
const SPEC_PATH =
  'docs/stabilization/spec-commercial-core-tenant-composite-fks-v1.0.md';
const EVIDENCE_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr05/README.md';
const SQL_TEST_PATH = 'supabase/tests/commercial_core_tenant_fks_test.sql';
const RUNNER_PATH = 'scripts/commercial-hardening/run-red-contracts.mjs';
const GENERATED_TYPES_PATH = 'src/types/supabase.ts';

const FK_NAMES = [
  'reservations_customer_id_fkey',
  'reservations_menu_id_fkey',
  'reservations_staff_id_fkey',
  'blocks_resource_id_fkey',
  'care_episodes_customer_id_fkey',
  'customer_insurance_coverages_customer_id_fkey',
  'menu_billing_profiles_menu_id_fkey',
] as const;

const TEMPORARY_FK_NAMES = [
  'reservations_customer_clinic_pr05_fkey',
  'reservations_menu_clinic_pr05_fkey',
  'reservations_staff_clinic_pr05_fkey',
  'blocks_resource_clinic_pr05_fkey',
  'care_episodes_customer_clinic_pr05_fkey',
  'customer_insurance_coverages_customer_clinic_pr05_fkey',
  'menu_billing_profiles_menu_clinic_pr05_fkey',
] as const;

const INDEX_NAMES = [
  'reservations_customer_clinic_idx',
  'reservations_menu_clinic_idx',
  'reservations_staff_clinic_idx',
  'blocks_resource_clinic_idx',
  'care_episodes_customer_clinic_idx',
  'customer_insurance_coverages_customer_clinic_idx',
  'menu_billing_profiles_menu_clinic_idx',
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

function normalizeExecutableSql(sql: string): string {
  return sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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

describe('commercial PR-05 migration contract', () => {
  const migrationPath = findSingleFile('supabase/migrations', MIGRATION_SUFFIX);
  const migrationName = path.basename(migrationPath);
  const rollbackPath = findSingleFile(
    'supabase/rollbacks',
    migrationName.replace(/\.sql$/, '_rollback.sql')
  );
  const migration = readRepositoryFile(migrationPath);
  const rollback = readRepositoryFile(rollbackPath);
  const normalizedMigration = normalizeExecutableSql(migration);

  it('ships the paired specification, evidence, SQL test, and recovery guard', () => {
    expect(fs.existsSync(path.resolve(process.cwd(), SPEC_PATH))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), EVIDENCE_PATH))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), SQL_TEST_PATH))).toBe(true);
    expect(migration).toContain(`-- @spec ${SPEC_PATH}`);
    expect(migration).toContain(
      `-- @rollback ${rollbackPath.replace(/\\/g, '/')}`
    );
  });

  it('preserves the seven stable FK names while replacing their column contract', () => {
    for (let index = 0; index < FK_NAMES.length; index += 1) {
      const finalName = FK_NAMES[index];
      const temporaryName = TEMPORARY_FK_NAMES[index];
      expect(finalName).toBeDefined();
      expect(temporaryName).toBeDefined();
      expect(normalizedMigration).toContain(
        `rename constraint ${temporaryName} to ${finalName}`
      );
    }

    expect(migration).toContain('foreign key (staff_id, clinic_id)');
    expect(migration).not.toContain('foreign key (resource_id, clinic_id)\n  references public.resources (id, clinic_id)\n  on delete restrict');
  });

  it('uses parent uniqueness, exact child indexes, NOT VALID, and explicit validation', () => {
    expect(migration).toContain('customers_id_clinic_unique');
    expect(migration).toContain('menus_id_clinic_unique');
    expect(migration).toContain('resources_id_clinic_unique');
    expect((migration.match(/not valid;/g) ?? [])).toHaveLength(7);
    expect((migration.match(/validate constraint/g) ?? [])).toHaveLength(7);

    for (const indexName of INDEX_NAMES) {
      expect(migration).toContain(`create index ${indexName}`);
    }
  });

  it('fails closed on catalog/data drift and proves security metadata no-drift', () => {
    expect(migration).toContain('PR-05 preflight failed');
    expect(migration).toContain('cross-clinic mismatch');
    expect(migration).toContain('orphan');
    expect(migration).toContain('duplicate parent key');
    expect(migration).toContain('duplicate structural target FK');
    expect(migration).toContain('FK RI trigger state drift');
    expect(migration).toContain('pr05_table_security_snapshot');
    expect(migration).toContain('pr05_policy_snapshot');
    expect(migration).toContain('pr05_trigger_snapshot');
    expect(migration).toContain('PR-05 postflight failed');
  });

  it('does not repair tenant data or mutate RLS and grants', () => {
    expect(normalizedMigration).not.toMatch(/\bupdate\s+public\./);
    expect(normalizedMigration).not.toMatch(/\bdelete\s+from\s+public\./);
    expect(normalizedMigration).not.toMatch(/\bcreate\s+policy\b/);
    expect(normalizedMigration).not.toMatch(/\bdrop\s+policy\b/);
    expect(normalizedMigration).not.toMatch(/\bgrant\b|\brevoke\b/);
    expect(normalizedMigration).not.toMatch(/disable\s+row\s+level\s+security/);
  });

  it('keeps the recovery SQL validation-only and forward-fix oriented', () => {
    const executableRollback = normalizeExecutableSql(rollback);

    expect(executableRollback).not.toMatch(/drop\s+constraint/);
    expect(executableRollback).not.toMatch(/drop\s+index/);
    expect(executableRollback).not.toMatch(/add\s+constraint/);
    expect(executableRollback).not.toMatch(/create\s+index/);
    expect(executableRollback).toContain("set local statement_timeout = '60s'");
    expect(rollback).toContain('duplicate structural target FK');
    expect(rollback).toContain('required non-null UUID column drift');
    expect(rollback).toContain('FK RI trigger state drift');
    expect(rollback).toContain('index_data.indpred is null');
    expect(rollback).toContain('index_data.indexprs is null');
    expect(rollback).toContain('reviewed forward-fix');
  });

  it('advances only the focused PR-05 contracts to GREEN', () => {
    const outcomes = parsePhaseOutcomes(readRepositoryFile(RUNNER_PATH));

    expect(outcomes['04a_core_composite_fks.sql']).toBe('green');
    expect(outcomes['05_parent_rehome_fixture.sql']).toBe('green');
  });

  it('regenerates the seven relationship column pairs without renaming them', () => {
    const generatedTypes = readRepositoryFile(GENERATED_TYPES_PATH);
    const relationships = [
      ['reservations_customer_id_fkey', 'customer_id'],
      ['reservations_menu_id_fkey', 'menu_id'],
      ['reservations_staff_id_fkey', 'staff_id'],
      ['blocks_resource_id_fkey', 'resource_id'],
      ['care_episodes_customer_id_fkey', 'customer_id'],
      ['customer_insurance_coverages_customer_id_fkey', 'customer_id'],
      ['menu_billing_profiles_menu_id_fkey', 'menu_id'],
    ] as const;

    for (const [foreignKeyName, foreignId] of relationships) {
      expect(generatedTypes).toMatch(
        new RegExp(
          `foreignKeyName: '${foreignKeyName}';[\\s\\S]*?columns: \\['${foreignId}', 'clinic_id'\\]`
        )
      );
    }
  });
});
