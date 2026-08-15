#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readPinnedSupabaseCliVersion } from '../verify-supabase-cli-version.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const REPAIRED_VERSION = '20260718011731';
const BASELINE_VERSION = '20260716160402';
const RECOVERY_VERSION = '20260815104957';
const LOCAL_RESET_APPROVAL = 'PR11_DEFERRED_LOCAL_RESET_APPROVED';
const ROLLBACK_PATH = path.join(
  REPO_ROOT,
  'supabase/rollbacks/20260815104957_pr11_deferred_production_forward_fix_rollback.sql'
);
const cliEnvironment = {
  ...process.env,
  DO_NOT_TRACK: '1',
  PGCONNECT_TIMEOUT: '10',
  SUPABASE_TELEMETRY_DISABLED: '1',
};

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function supabaseCliInvocation(args) {
  const cliJavaScriptPath = process.env.SUPABASE_CLI_JS_PATH?.trim();
  if (!cliJavaScriptPath) {
    return { command: 'supabase', args };
  }

  invariant(
    path.isAbsolute(cliJavaScriptPath) &&
      path.extname(cliJavaScriptPath).toLowerCase() === '.js',
    'SUPABASE_CLI_JS_PATH must be an absolute JavaScript file path'
  );
  return {
    command: process.execPath,
    args: [cliJavaScriptPath, ...args],
  };
}

function runCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: cliEnvironment,
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeout ?? 180_000,
    windowsHide: true,
    input: options.input,
  });
}

function requireSuccess(result, label) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit ${String(result.status)}\n${result.stdout.trim()}\n${result.stderr.trim()}`
    );
  }
  return result.stdout;
}

function runSupabase(args, label, timeout = 180_000) {
  const invocation = supabaseCliInvocation(args);
  return requireSuccess(
    runCommand(invocation.command, invocation.args, { timeout }),
    label
  );
}

function readLocalDatabaseUrl() {
  const output = runSupabase(
    ['status', '--output', 'env'],
    'read local Supabase status',
    30_000
  );
  const values = new Map();

  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    const value =
      rawValue.startsWith('"') && rawValue.endsWith('"')
        ? JSON.parse(rawValue)
        : rawValue;
    values.set(key, value);
  }

  const dbUrl = values.get('DB_URL');
  invariant(
    typeof dbUrl === 'string' && dbUrl.length > 0,
    'Local Supabase status did not provide DB_URL'
  );
  const parsed = new URL(dbUrl);
  invariant(
    parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:',
    'Deferred verifier received an unsupported database protocol'
  );
  invariant(
    new Set(['127.0.0.1', 'localhost', '[::1]']).has(parsed.hostname),
    'Deferred verifier refuses a non-loopback database URL'
  );
  return parsed;
}

function runPsql(dbUrl, sql, label) {
  return requireSuccess(
    runCommand(
      'psql',
      [
        '--dbname',
        dbUrl.toString(),
        '--set',
        'ON_ERROR_STOP=1',
        '--tuples-only',
        '--no-align',
        '--no-psqlrc',
        '--file',
        '-',
      ],
      { input: sql, timeout: 120_000 }
    ),
    label
  );
}

function assertPinnedCli() {
  const expected = readPinnedSupabaseCliVersion();
  const actual = runSupabase(
    ['--version'],
    'read Supabase CLI version',
    30_000
  ).trim();
  invariant(
    actual === expected,
    `Supabase CLI version mismatch: expected ${expected}, received ${actual}`
  );
}

assertPinnedCli();
invariant(
  process.env[LOCAL_RESET_APPROVAL] === '1',
  `${LOCAL_RESET_APPROVAL}=1 is required because this verifier resets the local database`
);

const localDatabaseUrl = readLocalDatabaseUrl();
let localResetStarted = false;

try {
  localResetStarted = true;
  runSupabase(
    ['db', 'reset', '--local', '--version', BASELINE_VERSION, '--no-seed'],
    'replay PR-11 baseline',
    600_000
  );

  runSupabase(
    ['migration', 'repair', REPAIRED_VERSION, '--status', 'applied', '--local'],
    'repair skipped PR-11 migration history'
  );

  const deferredState = runPsql(
    localDatabaseUrl,
    `
      select
        count(*) filter (where version = '${REPAIRED_VERSION}'),
        (select count(*) from pg_proc where oid = to_regprocedure('app_private.get_current_accessible_clinic_ids()'))
          + (select count(*) from pg_class where oid in (
              to_regclass('public.customer_insurance_coverages_clinic_id_id_idx'),
              to_regclass('public.menu_billing_profiles_clinic_id_id_idx')
            ))
      from supabase_migrations.schema_migrations;
    `,
    'verify deferred artifact-free state'
  );
  invariant(
    deferredState.trim() === '1|0',
    'History repair did not reproduce the artifact-free deferred production state'
  );

  runSupabase(
    ['db', 'push', '--local', '--include-all', '--yes'],
    'apply deferred production sequence',
    600_000
  );

  const historyResult = runPsql(
    localDatabaseUrl,
    `
      select
        max(version),
        count(*) filter (where version = '${REPAIRED_VERSION}'),
        count(*) filter (where version = '${RECOVERY_VERSION}')
      from supabase_migrations.schema_migrations;
    `,
    'verify deferred migration history'
  );
  invariant(
    historyResult.trim() === `${RECOVERY_VERSION}|1|1`,
    'Deferred migration history did not reach the recovery head exactly once'
  );

  runSupabase(
    ['test', 'db', '--local'],
    'run pgTAP against deferred production sequence',
    600_000
  );

  runPsql(
    localDatabaseUrl,
    readFileSync(ROLLBACK_PATH, 'utf8'),
    'run deferred validation-only rollback guard'
  );

  console.log(
    JSON.stringify({
      ok: true,
      baselineVersion: BASELINE_VERSION,
      repairedVersion: REPAIRED_VERSION,
      recoveryVersion: RECOVERY_VERSION,
    })
  );
} finally {
  if (localResetStarted) {
    runSupabase(
      ['db', 'reset', '--local', '--no-seed'],
      'restore the local database to the full migration head',
      600_000
    );
  }
}
