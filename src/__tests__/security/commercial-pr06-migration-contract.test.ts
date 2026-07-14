import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_SUFFIX =
  '_commercial_report_operational_tenant_composite_fks.sql';
const SPEC_PATH =
  'docs/stabilization/spec-commercial-report-operational-tenant-composite-fks-v1.0.md';
const EVIDENCE_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr06/README.md';
const SQL_TEST_PATH =
  'supabase/tests/commercial_report_operational_tenant_fks_test.sql';
const RUNNER_PATH = 'scripts/commercial-hardening/run-red-contracts.mjs';
const GENERATED_TYPES_PATH = 'src/types/supabase.ts';

const FK_NAMES = [
  'daily_report_items_daily_report_id_fkey',
  'daily_report_items_reservation_id_fkey',
  'daily_report_items_customer_id_fkey',
  'daily_report_items_care_episode_id_fkey',
  'daily_report_items_customer_insurance_coverage_id_fkey',
  'daily_report_items_menu_id_fkey',
  'daily_report_items_menu_billing_profile_id_fkey',
  'daily_report_items_staff_resource_id_fkey',
  'daily_report_item_tags_item_id_fkey',
  'reservation_history_reservation_id_fkey',
  'reservation_notifications_reservation_id_fkey',
] as const;

const TEMPORARY_FK_NAMES = [
  'dri_daily_report_clinic_pr06_fkey',
  'dri_reservation_clinic_pr06_fkey',
  'dri_customer_clinic_pr06_fkey',
  'dri_care_episode_clinic_pr06_fkey',
  'dri_insurance_coverage_clinic_pr06_fkey',
  'dri_menu_clinic_pr06_fkey',
  'dri_menu_billing_profile_clinic_pr06_fkey',
  'dri_staff_resource_clinic_pr06_fkey',
  'drit_item_clinic_pr06_fkey',
  'reservation_history_reservation_clinic_pr06_fkey',
  'reservation_notifications_reservation_clinic_pr06_fkey',
] as const;

const INDEX_NAMES = [
  'daily_report_items_daily_report_clinic_idx',
  'daily_report_items_reservation_clinic_idx',
  'daily_report_items_customer_clinic_idx',
  'daily_report_items_care_episode_clinic_idx',
  'daily_report_items_customer_insurance_coverage_clinic_idx',
  'daily_report_items_menu_clinic_idx',
  'daily_report_items_menu_billing_profile_clinic_idx',
  'daily_report_items_staff_resource_clinic_idx',
  'daily_report_item_tags_item_clinic_idx',
  'reservation_history_reservation_clinic_idx',
  'reservation_notifications_reservation_clinic_idx',
] as const;

const NEW_PARENT_UNIQUES = [
  'daily_reports_id_clinic_unique',
  'care_episodes_id_clinic_unique',
  'customer_insurance_coverages_id_clinic_unique',
  'menu_billing_profiles_id_clinic_unique',
  'daily_report_items_id_clinic_unique',
] as const;

const SET_NULL_COLUMNS = [
  'reservation_id',
  'customer_id',
  'care_episode_id',
  'customer_insurance_coverage_id',
  'menu_id',
  'menu_billing_profile_id',
  'staff_resource_id',
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

function extractTableDefinition(
  generatedTypes: string,
  tableName: string,
  nextTableName: string
): string {
  const startMarker = `      ${tableName}: {`;
  const endMarker = `      ${nextTableName}: {`;
  const start = generatedTypes.indexOf(startMarker);
  const end = generatedTypes.indexOf(endMarker, start + startMarker.length);

  if (start < 0 || end < 0) {
    throw new Error(
      `Unable to isolate generated table definition ${tableName} before ${nextTableName}`
    );
  }

  return generatedTypes.slice(start, end);
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

describe('commercial PR-06 migration contract', () => {
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
    expect(fs.existsSync(path.resolve(process.cwd(), EVIDENCE_PATH))).toBe(
      true
    );
    expect(fs.existsSync(path.resolve(process.cwd(), SQL_TEST_PATH))).toBe(
      true
    );
    expect(migration).toContain(`-- @spec ${SPEC_PATH}`);
    expect(migration).toContain(
      `-- @rollback ${rollbackPath.replace(/\\/g, '/')}`
    );
  });

  it('preserves all eleven stable FK names after validated replacement', () => {
    for (let index = 0; index < FK_NAMES.length; index += 1) {
      const finalName = FK_NAMES[index];
      const temporaryName = TEMPORARY_FK_NAMES[index];
      expect(finalName).toBeDefined();
      expect(temporaryName).toBeDefined();
      expect(normalizedMigration).toContain(
        `rename constraint ${temporaryName} to ${finalName}`
      );
    }
  });

  it('uses exact parent uniqueness, child indexes, NOT VALID, and validation', () => {
    for (const uniqueName of NEW_PARENT_UNIQUES) {
      expect(migration).toContain(uniqueName);
    }
    for (const indexName of INDEX_NAMES) {
      expect(migration).toContain(`create index ${indexName}`);
    }

    expect(migration.match(/not valid;/g) ?? []).toHaveLength(11);
    expect(migration.match(/validate constraint/g) ?? []).toHaveLength(11);
    expect(normalizedMigration).toContain(
      'alter table public.daily_reports alter column clinic_id set not null'
    );
  });

  it('limits SET NULL to nullable foreign-id columns and preserves clinic_id', () => {
    for (const column of SET_NULL_COLUMNS) {
      expect(normalizedMigration).toContain(`on delete set null (${column})`);
    }

    expect(
      normalizedMigration.match(/on delete set null \([^)]+\)/g)
    ).toHaveLength(7);
    expect(normalizedMigration).not.toMatch(
      /on delete set null\s+(?:not deferrable|not valid|;)/
    );
    expect(migration).toContain('confdelsetcols');
  });

  it('fails closed on catalog/data drift and proves security metadata no-drift', () => {
    expect(migration).toContain('PR-06 preflight failed');
    expect(migration).toContain('cross-clinic mismatch');
    expect(migration).toContain('orphan');
    expect(migration).toContain('duplicate parent key');
    expect(migration).toContain('duplicate structural target FK');
    expect(migration).toContain('FK RI trigger state drift');
    expect(migration).toContain('delete SET column drift');
    expect(migration).toContain('pr06_table_security_snapshot');
    expect(migration).toContain('pr06_policy_snapshot');
    expect(migration).toContain('pr06_trigger_snapshot');
    expect(migration).toContain('PR-06 postflight failed');
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
    expect(executableRollback).not.toMatch(/alter\s+column/);
    expect(executableRollback).toContain("set local statement_timeout = '60s'");
    expect(rollback).toContain('duplicate structural target FK');
    expect(rollback).toContain('required UUID column drift');
    expect(rollback).toContain('FK RI trigger state drift');
    expect(rollback).toContain('delete SET column drift');
    expect(rollback).toContain('index_data.indpred is null');
    expect(rollback).toContain('index_data.indexprs is null');
    expect(rollback).toContain('reviewed forward-fix');
  });

  it('advances only the focused PR-06 FK contracts to GREEN', () => {
    const outcomes = parsePhaseOutcomes(readRepositoryFile(RUNNER_PATH));

    expect(outcomes['04_required_composite_fks.sql']).toBe('green');
    expect(outcomes['04b_report_operational_composite_fks.sql']).toBe('green');
    expect(outcomes['05b_report_parent_rehome_fixture.sql']).toBe('green');
  });

  it('regenerates the eleven relationship column pairs without renaming them', () => {
    const generatedTypes = readRepositoryFile(GENERATED_TYPES_PATH);
    const dailyReportsDefinition = extractTableDefinition(
      generatedTypes,
      'daily_reports',
      'email_logs'
    );
    const relationships = [
      [
        'daily_report_items_daily_report_id_fkey',
        'daily_report_id',
        'daily_reports',
      ],
      [
        'daily_report_items_reservation_id_fkey',
        'reservation_id',
        'reservations',
      ],
      ['daily_report_items_customer_id_fkey', 'customer_id', 'customers'],
      [
        'daily_report_items_care_episode_id_fkey',
        'care_episode_id',
        'care_episodes',
      ],
      [
        'daily_report_items_customer_insurance_coverage_id_fkey',
        'customer_insurance_coverage_id',
        'customer_insurance_coverages',
      ],
      ['daily_report_items_menu_id_fkey', 'menu_id', 'menus'],
      [
        'daily_report_items_menu_billing_profile_id_fkey',
        'menu_billing_profile_id',
        'menu_billing_profiles',
      ],
      [
        'daily_report_items_staff_resource_id_fkey',
        'staff_resource_id',
        'resources',
      ],
      [
        'daily_report_item_tags_item_id_fkey',
        'daily_report_item_id',
        'daily_report_items',
      ],
      [
        'reservation_history_reservation_id_fkey',
        'reservation_id',
        'reservations',
      ],
      [
        'reservation_notifications_reservation_id_fkey',
        'reservation_id',
        'reservations',
      ],
    ] as const;

    for (const [
      foreignKeyName,
      foreignId,
      referencedRelation,
    ] of relationships) {
      const exactRelationship = new RegExp(
        `foreignKeyName: '${foreignKeyName}';\\s*` +
          `columns: \\['${foreignId}', 'clinic_id'\\];\\s*` +
          `isOneToOne: false;\\s*` +
          `referencedRelation: '${referencedRelation}';\\s*` +
          `referencedColumns: \\['id', 'clinic_id'\\];`,
        'g'
      );

      expect(generatedTypes.match(exactRelationship) ?? []).toHaveLength(1);
    }

    expect(dailyReportsDefinition).toMatch(/Row: \{\s*clinic_id: string;/);
    expect(dailyReportsDefinition).toMatch(/Insert: \{\s*clinic_id: string;/);
    expect(dailyReportsDefinition).toMatch(/Update: \{\s*clinic_id\?: string;/);
    expect(dailyReportsDefinition).not.toMatch(
      /(?:Row|Insert|Update): \{\s*clinic_id\??: string \| null;/
    );
  });
});
