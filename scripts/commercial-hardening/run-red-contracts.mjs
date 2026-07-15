#!/usr/bin/env node

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const CONTRACT_ROOT = path.join(SCRIPT_DIR, 'red-contracts');

const EXPECTED_CONTRACTS = new Map([
  [
    '01_exposed_tables_rls.sql',
    { marker: 'RED COMM-RLS-001', outcome: 'green' },
  ],
  [
    '02_default_client_privileges.sql',
    { marker: 'RED COMM-GRANT-001', outcome: 'green' },
  ],
  [
    '03_private_function_execute.sql',
    { marker: 'RED COMM-FUNCTION-001', outcome: 'green' },
  ],
  [
    '03b_function_search_path.sql',
    { marker: 'RED COMM-FUNCTION-002', outcome: 'green' },
  ],
  [
    '04_required_composite_fks.sql',
    { marker: 'RED COMM-FK-001', outcome: 'green' },
  ],
  [
    '04a_core_composite_fks.sql',
    { marker: 'RED COMM-FK-003', outcome: 'green' },
  ],
  [
    '04b_report_operational_composite_fks.sql',
    { marker: 'RED COMM-FK-004', outcome: 'green' },
  ],
  [
    '05_parent_rehome_fixture.sql',
    { marker: 'RED COMM-FK-002', outcome: 'green' },
  ],
  [
    '05b_report_parent_rehome_fixture.sql',
    { marker: 'RED COMM-FK-005', outcome: 'green' },
  ],
  [
    '06_clinic_settings_policy.sql',
    { marker: 'RED COMM-RLS-002', outcome: 'green' },
  ],
  [
    '06a_legacy_quarantine.sql',
    { marker: 'RED COMM-LEGACY-001', outcome: 'green' },
  ],
  [
    '07_atomic_staff_invite.sql',
    { marker: 'RED COMM-INVITE-001', outcome: 'green' },
  ],
  [
    '08_profile_self_escalation.sql',
    { marker: 'RED COMM-AUTH-001', outcome: 'green' },
  ],
  [
    '09_rls_policy_normalization.sql',
    { marker: 'RED COMM-RLS-003', outcome: 'green' },
  ],
]);

if (
  process.argv.length !== 2 &&
  !(process.argv.length === 3 && process.argv[2] === '--local')
) {
  throw new Error(
    'Usage: run-red-contracts.mjs [--local]. Linked databases are intentionally unsupported.'
  );
}

const files = readdirSync(CONTRACT_ROOT)
  .filter(file => file.endsWith('.sql'))
  .sort();
const results = [];

const unknownFiles = files.filter(file => !EXPECTED_CONTRACTS.has(file));
const missingFiles = [...EXPECTED_CONTRACTS.keys()].filter(
  file => !files.includes(file)
);
if (unknownFiles.length > 0 || missingFiles.length > 0) {
  throw new Error(
    'RED contract/marker map drift. Unknown: ' +
      (unknownFiles.join(', ') || 'none') +
      '; missing: ' +
      (missingFiles.join(', ') || 'none')
  );
}

for (const file of files) {
  const expectedContract = EXPECTED_CONTRACTS.get(file);
  if (!expectedContract) {
    throw new Error('Missing expected contract for ' + file);
  }

  const { marker: expectedMarker, outcome: expectedOutcome } = expectedContract;
  const result = spawnSync(
    'supabase',
    [
      'db',
      'query',
      '--local',
      '--file',
      path.join(CONTRACT_ROOT, file),
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
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  const reproduced = result.status !== 0 && output.includes(expectedMarker);
  const matched =
    expectedOutcome === 'green' ? result.status === 0 : reproduced;
  const outcome = matched
    ? expectedOutcome.toUpperCase() + ' matched'
    : result.status === 0
      ? 'UNEXPECTED GREEN'
      : reproduced
        ? 'UNEXPECTED RED'
        : 'CONTRACT ERROR';
  results.push({
    file,
    expectedMarker,
    expectedOutcome,
    matched,
    reproduced,
    status: result.status,
    signal: result.signal,
  });
  console.log(
    outcome +
      ' - ' +
      file +
      ' - expected ' +
      expectedOutcome.toUpperCase() +
      ' (' +
      expectedMarker +
      ')'
  );
}

const mismatches = results.filter(result => !result.matched);
if (mismatches.length > 0) {
  console.error(
    'Commercial contract phase verification failed: ' +
      mismatches
        .map(
          result =>
            result.file +
            ' (status=' +
            String(result.status) +
            ', signal=' +
            String(result.signal) +
            ', expected=' +
            result.expectedOutcome +
            ', marker=' +
            result.expectedMarker +
            ')'
        )
        .join(', ')
  );
  process.exitCode = 1;
} else {
  console.log(
    'All ' +
      String(results.length) +
      ' commercial contracts match the current phase expectations.'
  );
}
