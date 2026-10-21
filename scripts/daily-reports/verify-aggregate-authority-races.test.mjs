import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(
  new URL('./verify-aggregate-authority-races.mjs', import.meta.url)
);
const DEFAULT_URL = 'postgresql://postgres:postgres@127.0.0.1:54332/postgres';

// Runs the real verifier with a recording `psql` first on PATH: no database
// is contacted. The stub records what each child received and fails, so the
// verifier stops after its cleanup attempts.
test(
  'a parent PGHOSTADDR or PGSERVICE cannot redirect the loopback psql sessions',
  {
    skip:
      process.platform === 'win32'
        ? 'a shebang psql stub cannot be executed without a shell on Windows; local-psql.test.mjs covers the child environment there'
        : false,
  },
  () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'os-f2-psql-stub-'));
    const stubPath = path.join(directory, 'psql');
    const recordPath = path.join(directory, 'calls.jsonl');
    writeFileSync(
      stubPath,
      `#!${process.execPath}
const fs = require('node:fs');
const pg = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => /^pg/i.test(key))
);
fs.appendFileSync(
  process.env.OS_F2_PSQL_STUB_RECORD,
  JSON.stringify({ argv: process.argv.slice(2), pg }) + '\\n'
);
process.exit(1);
`
    );
    chmodSync(stubPath, 0o755);

    try {
      const result = spawnSync(process.execPath, [SCRIPT], {
        encoding: 'utf8',
        timeout: 60_000,
        env: {
          ...process.env,
          PATH: `${directory}${path.delimiter}${process.env.PATH ?? ''}`,
          PGHOSTADDR: '203.0.113.7',
          PGSERVICE: 'production',
          PGHOST: 'db.example.invalid',
          PGPORT: '6543',
          PGPASSWORD: 'kept-for-auth',
          OS_F2_PSQL_STUB_RECORD: recordPath,
        },
      });

      assert.equal(result.status, 1, result.stderr);
      const calls = readFileSync(recordPath, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      assert.ok(calls.length >= 1, 'psql was invoked');
      for (const call of calls) {
        assert.deepEqual(call.argv.slice(0, 2), ['--dbname', DEFAULT_URL]);
        assert.equal(call.pg.PGHOSTADDR, undefined);
        assert.equal(call.pg.PGSERVICE, undefined);
        assert.equal(call.pg.PGHOST, undefined);
        assert.equal(call.pg.PGPORT, undefined);
        assert.equal(call.pg.PGPASSWORD, 'kept-for-auth');
        assert.match(call.pg.PGAPPNAME, /^os_f2_race_/);
      }
      assert.match(result.stderr, /Not passing .*PGHOSTADDR/);
      assert.doesNotMatch(result.stderr, /203\.0\.113\.7/);
    } finally {
      for (const filePath of [stubPath, recordPath]) {
        if (existsSync(filePath)) rmSync(filePath);
      }
      rmdirSync(directory);
    }
  }
);

test('a non-loopback URL is refused before psql runs', () => {
  const result = spawnSync(
    process.execPath,
    [SCRIPT, '--db-url', 'postgresql://postgres@10.0.0.5:5432/postgres'],
    { encoding: 'utf8', timeout: 60_000 }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing database URL "10\.0\.0\.5"/);
});
