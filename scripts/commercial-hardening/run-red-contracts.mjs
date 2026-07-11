#!/usr/bin/env node

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const CONTRACT_ROOT = path.join(SCRIPT_DIR, 'red-contracts');

const EXPECTED_MARKERS = new Map([
  ['01_exposed_tables_rls.sql', 'RED COMM-RLS-001'],
  ['02_default_client_privileges.sql', 'RED COMM-GRANT-001'],
  ['03_private_function_execute.sql', 'RED COMM-FUNCTION-001'],
  ['03b_function_search_path.sql', 'RED COMM-FUNCTION-002'],
  ['04_required_composite_fks.sql', 'RED COMM-FK-001'],
  ['05_parent_rehome_fixture.sql', 'RED COMM-FK-002'],
  ['06_clinic_settings_policy.sql', 'RED COMM-RLS-002'],
  ['07_atomic_staff_invite.sql', 'RED COMM-INVITE-001'],
  ['08_profile_self_escalation.sql', 'RED COMM-AUTH-001'],
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

const unknownFiles = files.filter(file => !EXPECTED_MARKERS.has(file));
const missingFiles = [...EXPECTED_MARKERS.keys()].filter(
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
  const expectedMarker = EXPECTED_MARKERS.get(file);
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
  const outcome =
    result.status === 0
      ? 'UNEXPECTED GREEN'
      : reproduced
        ? 'RED reproduced'
        : 'CONTRACT ERROR';
  results.push({
    file,
    expectedMarker,
    reproduced,
    status: result.status,
    signal: result.signal,
  });
  console.log(outcome + ' - ' + file + ' - expected ' + expectedMarker);
}

const missingRed = results.filter(result => !result.reproduced);
if (missingRed.length > 0) {
  console.error(
    'RED contract verification failed: ' +
      missingRed
        .map(
          result =>
            result.file +
            ' (status=' +
            String(result.status) +
            ', signal=' +
            String(result.signal) +
            ', missing=' +
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
      ' PR-00 contracts failed on the current implementation as expected.'
  );
}
