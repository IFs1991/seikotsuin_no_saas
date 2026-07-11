#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const TEST_PATH = path.join(
  REPO_ROOT,
  'src/__tests__/red-contracts/invite-atomicity.red.test.ts'
);
const EXPECTED_MARKER =
  'RED COMM-INVITE-003: PARTIAL_COMMIT_STATE_MISMATCH';
const jestCli = require.resolve('jest/bin/jest');
const result = spawnSync(
  process.execPath,
  [
    jestCli,
    '--config',
    path.join(REPO_ROOT, 'jest.commercial-red.config.js'),
    '--runInBand',
    '--runTestsByPath',
    TEST_PATH,
  ],
  {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
    windowsHide: true,
  }
);

if (result.error) throw result.error;
const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
if (result.status !== 0 && output.includes(EXPECTED_MARKER)) {
  console.log(
    'RED reproduced - invite acceptance partially commits before a later write failure'
  );
} else {
  console.error(
    'Invite RED contract did not fail for the expected reason (status=' +
      String(result.status) +
      ', marker=' +
      String(output.includes(EXPECTED_MARKER)) +
      ')'
  );
  process.exitCode = 1;
}
