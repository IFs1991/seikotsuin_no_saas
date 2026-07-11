#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const SQL_ROOT = path.join(SCRIPT_DIR, 'sql');
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  'docs/stabilization/evidence/commercial-hardening'
);

const EXPORTS = [
  {
    key: 'tables',
    sql: 'tables.sql',
    headers: [
      'schema',
      'table_name',
      'owner',
      'rls_enabled',
      'force_rls',
      'has_clinic_id',
      'clinic_id_nullable',
      'policy_count',
      'anon_select',
      'anon_write_any',
      'authenticated_select',
      'authenticated_write_any',
      'classification',
      'expected',
      'difference',
    ],
  },
  {
    key: 'privilege',
    sql: 'privileges.sql',
    headers: [
      'schema',
      'object_type',
      'object_name',
      'grantee',
      'privilege_type',
      'is_grantable',
      'source_migration_if_known',
      'owner',
      'classification',
      'expected',
      'difference',
    ],
  },
  {
    key: 'policies',
    sql: 'policies.sql',
    headers: [
      'schema',
      'table_name',
      'policy_name',
      'permissive',
      'roles',
      'cmd',
      'qual',
      'with_check',
      'classification',
      'expected',
      'difference',
    ],
  },
  {
    key: 'functions',
    sql: 'functions.sql',
    headers: [
      'schema',
      'signature',
      'function_name',
      'identity_arguments',
      'result_type',
      'owner',
      'language',
      'security_definer',
      'volatility',
      'config',
      'grantee',
      'can_execute',
      'runtime_callers',
      'classification',
      'expected',
      'difference',
    ],
  },
  {
    key: 'function-dependencies',
    sql: 'function-dependencies.sql',
    headers: [
      'function_signature',
      'dependency_type',
      'dependent_schema',
      'dependent_object',
      'detail',
    ],
  },
  {
    key: 'constraints',
    sql: 'constraints.sql',
    headers: [
      'schema',
      'child_table',
      'constraint_name',
      'constraint_type',
      'child_columns',
      'parent_schema',
      'parent_table',
      'parent_columns',
      'on_update',
      'on_delete',
      'validated',
      'tenant_pair_detected',
      'definition',
      'classification',
      'expected',
      'difference',
    ],
  },
  {
    key: 'indexes',
    sql: 'indexes.sql',
    headers: [
      'schema',
      'table_name',
      'index_name',
      'is_primary',
      'is_unique',
      'is_valid',
      'is_ready',
      'definition',
      'classification',
      'expected',
      'difference',
    ],
  },
  {
    key: 'relation-preflight',
    sql: 'relation-preflight.sql',
    headers: [
      'relation',
      'rows_checked',
      'orphan_count',
      'mismatch_count',
    ],
  },
  {
    key: 'staff-id-semantics',
    sql: 'staff-id-semantics.sql',
    headers: [
      'column_name',
      'current_fk_target',
      'rows_checked',
      'matches_auth_users',
      'matches_profiles_user_id',
      'matches_staff_id',
      'matches_resources_id',
      'matches_staff_profiles_id',
    ],
  },
];

function parseArgs(argv) {
  const args = {
    target: null,
    outputDir: DEFAULT_OUTPUT,
    label: null,
    mode: 'write',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--local' || value === '--linked') {
      args.target = value;
    } else if (value === '--output-dir') {
      args.outputDir = path.resolve(argv[++index]);
    } else if (value === '--label') {
      args.label = argv[++index];
    } else if (value === '--check') {
      args.mode = 'check';
    } else {
      throw new Error('Unknown argument: ' + value);
    }
  }

  if (!/^[a-z0-9-]+$/i.test(args.label)) {
    throw new Error('Label must contain only letters, digits, and hyphens');
  }
  if (!args.target || !args.label) {
    throw new Error(
      'An explicit target and label are required: --local|--linked --label <target-qualified-label>'
    );
  }
  const targetName = args.target === '--local' ? 'local' : 'remote';
  const canonicalRemoteBefore =
    args.target === '--linked' && args.label.toLowerCase() === 'before';
  if (
    !canonicalRemoteBefore &&
    !args.label.toLowerCase().includes(targetName)
  ) {
    throw new Error('Label must include target name "' + targetName + '"');
  }
  return args;
}

function parseCliJson(stdout) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('Supabase CLI did not return JSON');
  }
  const payload = JSON.parse(stdout.slice(start, end + 1));
  if (!Array.isArray(payload.rows)) {
    throw new Error('Supabase CLI JSON does not contain a rows array');
  }
  return payload.rows;
}

function queryRows(target, sqlFile) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = spawnSync(
      'supabase',
      [
        'db',
        'query',
        target,
        '--file',
        sqlFile,
        '--output-format',
        'json',
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          DO_NOT_TRACK: '1',
          SUPABASE_TELEMETRY_DISABLED: '1',
        },
        maxBuffer: 64 * 1024 * 1024,
        timeout: 120_000,
        windowsHide: true,
      }
    );

    if (result.error) throw result.error;
    if (result.status === 0) return parseCliJson(result.stdout);
    const detail = [result.stdout, result.stderr]
      .filter(Boolean)
      .join('\n')
      .trim();
    const retryableInfrastructureError =
      /LegacyDbConnectError|Timeout while shutting down PostHog/.test(detail);
    if (attempt === 1 && retryableInfrastructureError) {
      console.warn(
        'Retrying read-only catalog query after transient CLI infrastructure error: ' +
          path.basename(sqlFile)
      );
      continue;
    }
    throw new Error(
      'Supabase catalog query failed for ' +
        path.basename(sqlFile) +
        ' (status ' +
        String(result.status) +
        ')' +
        ': ' +
        detail
    );
  }
  throw new Error('Catalog query exhausted retries: ' + path.basename(sqlFile));
}

function csvValue(value) {
  if (value === null || value === undefined) return '';
  const stringValue =
    typeof value === 'object' ? JSON.stringify(value) : String(value);
  return '"' + stringValue.replaceAll('"', '""') + '"';
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvValue).join(',')];
  for (const row of rows) {
    lines.push(headers.map(header => csvValue(row[header])).join(','));
  }
  return lines.join('\n') + '\n';
}

function writeOrCheck(filePath, content, mode) {
  if (mode === 'check') {
    if (readFileSync(filePath, 'utf8') !== content) {
      throw new Error(
        'Catalog inventory drift: ' + path.relative(REPO_ROOT, filePath)
      );
    }
    return;
  }
  writeFileSync(filePath, content, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputs = [];

  for (const exportConfig of EXPORTS) {
    const rows = queryRows(
      args.target,
      path.join(SQL_ROOT, exportConfig.sql)
    );
    const filePath = path.join(
      args.outputDir,
      exportConfig.key + '-' + args.label + '.csv'
    );
    outputs.push({ filePath, content: toCsv(exportConfig.headers, rows) });
  }

  const migrations = queryRows(
    args.target,
    path.join(SQL_ROOT, 'migrations.sql')
  );
  const migrationContent =
    migrations.map(row => row.version + ' ' + row.name).join('\n') + '\n';
  const targetName = args.target === '--local' ? 'local' : 'remote';
  outputs.push({
    filePath: path.join(args.outputDir, 'migrations-' + targetName + '.txt'),
    content: migrationContent,
  });

  await mkdir(args.outputDir, { recursive: true });
  for (const output of outputs) {
    writeOrCheck(output.filePath, output.content, args.mode);
  }

  console.log(
    (args.mode === 'check' ? 'Checked ' : 'Wrote ') +
      path.relative(REPO_ROOT, args.outputDir) +
      ' from ' +
      args.target
  );
}

await main();
