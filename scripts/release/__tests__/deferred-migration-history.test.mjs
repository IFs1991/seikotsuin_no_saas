import assert from 'node:assert/strict';
import { mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertDeferredMigrationHistory,
  readExpectedMigrationVersions,
} from '../../commercial-hardening/deferred-migration-history.mjs';

const baseline = '20260716160402';
const repaired = '20260718011731';
const recovery = '20260815104957';
const required = [baseline, repaired, recovery];
const future = '20260906003219';

function result(versions, counts = '1|1') {
  return `${versions.at(-1)}|${counts}|${versions.join(',')}\n`;
}

function fixture(t, filenames) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'pd-deferred-history-'));
  t.after(() => {
    // このテストだけが作成した一時ディレクトリを後始末する。
    for (const filename of filenames) rmSync(path.join(directory, filename));
    rmdirSync(directory);
  });
  for (const filename of filenames)
    writeFileSync(path.join(directory, filename), '');
  return directory;
}

test('accepts a future append while preserving the fixed recovery count', () => {
  const expected = [...required, future];
  assert.doesNotThrow(() =>
    assertDeferredMigrationHistory(result(expected), expected, recovery)
  );
});

test('accepts the original complete recovery history', () => {
  assert.doesNotThrow(() =>
    assertDeferredMigrationHistory(result(required), required, recovery)
  );
});

test('rejects a missing non-head migration even when head and counts match', () => {
  const expected = ['20260601000000', ...required];
  assert.throws(() =>
    assertDeferredMigrationHistory(result(required), expected, recovery)
  );
});

test('rejects duplicate and unexpected non-head history', () => {
  for (const applied of [
    [baseline, baseline, repaired, recovery],
    ['20260601000000', ...required],
  ]) {
    assert.throws(() =>
      assertDeferredMigrationHistory(result(applied), required, recovery)
    );
  }
});

test('rejects missing or duplicate repaired/recovery entries and a wrong head', () => {
  for (const counts of ['0|1', '2|1', '1|0', '1|2']) {
    assert.throws(() =>
      assertDeferredMigrationHistory(
        result(required, counts),
        required,
        recovery
      )
    );
  }
  assert.throws(() =>
    assertDeferredMigrationHistory(
      result([...required, future]),
      required,
      recovery
    )
  );
});

test('reads all applicable SQL filenames in version order', t => {
  const directory = fixture(t, [
    `${future}_notification.sql`,
    ...required.map(version => `${version}_migration.sql`),
    'README.md',
  ]);
  assert.deepEqual(readExpectedMigrationVersions(directory, required), [
    ...required,
    future,
  ]);
});

test('rejects missing required migration, duplicate version and malformed SQL filename', t => {
  for (const filenames of [
    [`${recovery}_recovery.sql`],
    [
      ...required.map(version => `${version}_migration.sql`),
      `${recovery}_duplicate.sql`,
    ],
    [
      ...required.map(version => `${version}_migration.sql`),
      'bad_migration.sql',
    ],
  ]) {
    const directory = fixture(t, filenames);
    assert.throws(() => readExpectedMigrationVersions(directory, required));
  }
});
