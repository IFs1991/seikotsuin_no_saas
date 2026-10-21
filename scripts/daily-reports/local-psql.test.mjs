import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIBPQ_TARGET_ENV_KEYS,
  assertLoopbackDatabaseUrl,
  buildPsqlInvocation,
  findLibpqTargetOverrides,
} from './local-psql.mjs';

const LOCAL_URL = 'postgresql://postgres:postgres@127.0.0.1:54332/postgres';

test('psql does not inherit variables that choose another connection target', () => {
  const parentEnv = {
    PATH: '/usr/bin',
    PGHOSTADDR: '203.0.113.7',
    PGHOST: 'db.example.invalid',
    PGPORT: '6543',
    PGDATABASE: 'production',
    PGUSER: 'admin',
    PGSERVICE: 'production',
    PGSERVICEFILE: '/etc/pg_service.conf',
    PGSYSCONFDIR: '/etc/postgresql-common',
    PGPASSWORD: 'kept-for-auth',
    PGSSLMODE: 'disable',
  };

  const { command, args, options } = buildPsqlInvocation(
    LOCAL_URL,
    'os_f2_test',
    '/tmp/1.sql',
    parentEnv
  );

  assert.equal(command, 'psql');
  assert.deepEqual(args, [
    '--dbname',
    LOCAL_URL,
    '--no-psqlrc',
    '--set',
    'ON_ERROR_STOP=1',
    '--file',
    '/tmp/1.sql',
  ]);
  assert.equal(options.shell, false);
  for (const key of LIBPQ_TARGET_ENV_KEYS) {
    assert.equal(options.env[key], undefined, `${key} must not reach psql`);
  }
  assert.deepEqual(options.env, {
    PATH: '/usr/bin',
    PGPASSWORD: 'kept-for-auth',
    PGSSLMODE: 'disable',
    PGAPPNAME: 'os_f2_test',
    PGCONNECT_TIMEOUT: '10',
  });
  assert.equal(parentEnv.PGHOSTADDR, '203.0.113.7', 'parent env is untouched');
});

test('Windows-cased names are matched case-insensitively and other variables are kept', () => {
  const { options } = buildPsqlInvocation(
    LOCAL_URL,
    'os_f2_test',
    'C:\\1.sql',
    {
      Path: 'C:\\Windows\\system32',
      SystemRoot: 'C:\\Windows',
      ComSpec: 'C:\\Windows\\system32\\cmd.exe',
      PgHostAddr: '203.0.113.7',
      pgservice: 'production',
      pgappname: 'parent-app',
    }
  );

  assert.deepEqual(options.env, {
    Path: 'C:\\Windows\\system32',
    SystemRoot: 'C:\\Windows',
    ComSpec: 'C:\\Windows\\system32\\cmd.exe',
    PGAPPNAME: 'os_f2_test',
    PGCONNECT_TIMEOUT: '10',
  });
});

test('overrides are reported by name only', () => {
  assert.deepEqual(
    findLibpqTargetOverrides({
      PATH: '/usr/bin',
      PGHOSTADDR: '203.0.113.7',
      pgservice: 'production',
      PGPASSWORD: 'secret',
    }),
    ['PGHOSTADDR', 'pgservice']
  );
});

test('only loopback URLs without query parameters are accepted', () => {
  for (const url of [
    LOCAL_URL,
    'postgresql://postgres@localhost:54332/postgres',
    'postgresql://postgres@[::1]:54332/postgres',
  ]) {
    assert.doesNotThrow(() => assertLoopbackDatabaseUrl(url), url);
  }
  for (const url of [
    'postgresql://postgres@db.example.invalid:5432/postgres',
    'postgresql://postgres@10.0.0.5:5432/postgres',
    'postgresql://postgres@127.0.0.1:54332/postgres?hostaddr=203.0.113.7',
    'postgresql://postgres@127.0.0.1:54332/postgres?service=production',
  ]) {
    assert.throws(() => assertLoopbackDatabaseUrl(url), /Refusing/, url);
    assert.throws(
      () => buildPsqlInvocation(url, 'os_f2_test', '/tmp/1.sql', {}),
      /Refusing/,
      url
    );
  }
});

test('a raw # is refused because libpq keeps parsing what follows it', () => {
  for (const url of [
    // URL() hides "?hostaddr=..." in .hash; libpq reads it as parameters.
    'postgresql://postgres:postgres@127.0.0.1:54332/postgres#?hostaddr=203.0.113.7&dbname=postgres',
    // A trailing empty fragment leaves .hash === '' in URL().
    'postgresql://postgres:postgres@127.0.0.1:54332/postgres#',
    'postgresql://postgres:pa#ss@127.0.0.1:54332/postgres',
  ]) {
    assert.throws(() => assertLoopbackDatabaseUrl(url), /Refusing/, url);
    assert.throws(
      () => buildPsqlInvocation(url, 'os_f2_test', '/tmp/1.sql', {}),
      /Refusing/,
      url
    );
  }
});

test('a percent-encoded %23 in the credentials is still accepted', () => {
  const url = 'postgresql://postgres:pa%23ss@127.0.0.1:54332/postgres';
  assert.doesNotThrow(() => assertLoopbackDatabaseUrl(url));
  assert.equal(
    buildPsqlInvocation(url, 'os_f2_test', '/tmp/1.sql', {}).args[1],
    url
  );
});
