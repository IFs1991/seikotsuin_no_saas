#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const FIXTURE_PATH = path.join(
  REPO_ROOT,
  'supabase/tests/commercial_auth_authority_rollback_guard_negative_test.sql'
);
const ROLLBACK_PATH = path.join(
  REPO_ROOT,
  'supabase/rollbacks/20260715083609_commercial_auth_authority_fail_closed_rollback.sql'
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

function runSupabaseCli(args) {
  const invocation = supabaseCliInvocation(args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: cliEnvironment,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 60_000,
    windowsHide: true,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Failed to read local Supabase status (exit ${String(result.status)}): ${result.stderr.trim()}`
    );
  }
  return result.stdout;
}

function readLocalDatabaseUrl() {
  const output = runSupabaseCli(['status', '--output', 'env']);
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
    'PR-09 rollback verifier received an unsupported database protocol'
  );
  invariant(
    new Set(['127.0.0.1', 'localhost', '[::1]']).has(parsed.hostname),
    'PR-09 rollback verifier refuses a non-loopback database URL'
  );
  return dbUrl;
}

function runPsql(dbUrl, input, variableName = null) {
  const args = [
    '--dbname',
    dbUrl,
    '--set',
    'ON_ERROR_STOP=1',
    '--no-psqlrc',
    '--file',
    '-',
  ];
  if (variableName) {
    args.splice(4, 0, '--set', `${variableName}=1`);
  }

  return spawnSync('psql', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: cliEnvironment,
    input,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60_000,
    windowsHide: true,
  });
}

function requireSuccessfulGuard(result, label) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit ${String(result.status)}\n${result.stdout.trim()}\n${result.stderr.trim()}`
    );
  }
}

function requireExpectedGuardFailure(result, label, expectedMessage) {
  if (result.error) throw result.error;
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  invariant(
    result.status !== 0,
    `${label} unexpectedly passed; the rollback guard accepted unsafe drift`
  );
  invariant(
    output.includes(expectedMessage),
    `${label} failed for the wrong reason (exit ${String(result.status)}):\n${output.trim()}`
  );
}

if (
  process.argv.length !== 2 &&
  !(process.argv.length === 3 && process.argv[2] === '--local')
) {
  throw new Error(
    'Usage: verify-pr09-rollback-guard-negative.mjs [--local]. Linked databases are intentionally unsupported.'
  );
}

const fixtureSql = readFileSync(FIXTURE_PATH, 'utf8');
const rollbackSql = readFileSync(ROLLBACK_PATH, 'utf8');
invariant(
  !rollbackSql.includes('__PR09_'),
  'PR-09 rollback contract still contains an unresolved hash placeholder'
);

const dbUrl = readLocalDatabaseUrl();
requireSuccessfulGuard(
  runPsql(dbUrl, rollbackSql),
  'PR-09 positive rollback guard'
);

for (const testCase of [
  {
    label: 'policy drift negative guard',
    variableName: 'pr09_run_rollback_guard_negative_policy',
    expectedMessage:
      'PR-09 recovery guard: policy identity/role/command/expression drift',
  },
  {
    label: 'unexpected policy negative guard',
    variableName: 'pr09_run_rollback_guard_negative_extra_policy',
    expectedMessage: 'PR-09 recovery guard: staff or feature policy set drift',
  },
  {
    label: 'column ACL negative guard',
    variableName: 'pr09_run_rollback_guard_negative_column_acl',
    expectedMessage:
      'PR-09 recovery guard: authenticated staff or feature column write ACL returned',
  },
  {
    label: 'function drift negative guard',
    variableName: 'pr09_run_rollback_guard_negative_function',
    expectedMessage:
      'PR-09 recovery guard: authority function definition/owner/config drift',
  },
]) {
  requireExpectedGuardFailure(
    runPsql(dbUrl, `${fixtureSql}\n${rollbackSql}`, testCase.variableName),
    `PR-09 ${testCase.label}`,
    testCase.expectedMessage
  );
}

requireSuccessfulGuard(
  runPsql(dbUrl, rollbackSql),
  'PR-09 post-negative rollback guard'
);

console.log(
  'PASS - PR-09 local rollback guard accepted the exact contract, rejected expression, policy-set, column-ACL, and function drift, and retained the exact contract afterward.'
);
