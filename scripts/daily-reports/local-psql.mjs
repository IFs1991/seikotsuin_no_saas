/**
 * Connection guard for verifiers that write fixtures through psql and must
 * only ever reach a disposable LOCAL database.
 *
 * The URL check alone is not enough: libpq fills every connection parameter
 * the URL leaves unset from the environment, and PGHOSTADDR (or a PGSERVICE
 * entry with hostaddr=) makes psql connect to that address even though the
 * URL names 127.0.0.1. The child therefore gets the parent environment minus
 * the variables that choose the connection target; everything else (PATH,
 * SystemRoot, PGPASSWORD, SSL settings, ...) is passed through unchanged.
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export const LIBPQ_TARGET_ENV_KEYS = Object.freeze([
  'PGHOST',
  'PGHOSTADDR',
  'PGPORT',
  'PGDATABASE',
  'PGUSER',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGSYSCONFDIR',
]);

// Set by buildPsqlEnv itself; a differently cased parent copy is dropped so
// Windows (case-insensitive names) never sees two values.
const OWNED_ENV_KEYS = ['PGAPPNAME', 'PGCONNECT_TIMEOUT'];
const DROPPED_ENV_KEYS = new Set([...LIBPQ_TARGET_ENV_KEYS, ...OWNED_ENV_KEYS]);

export function assertLoopbackDatabaseUrl(dbUrl) {
  // URL() treats '#' as a fragment (hiding "#?hostaddr=..." in .hash, and a
  // bare trailing '#' leaves .hash empty), but libpq keeps parsing past it.
  // Check the raw string before parsing; an encoded %23 stays allowed.
  if (dbUrl.includes('#')) {
    throw new Error(
      `Refusing database URL: '#' is not accepted (libpq does not treat it as a fragment). Percent-encode it as %23 inside credentials.`
    );
  }
  const parsed = new URL(dbUrl);
  // libpq honours host/hostaddr/service in the query string over the URL host.
  if (parsed.search !== '' || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      // The query is not echoed: it may carry password=... or another host.
      `Refusing database URL "${parsed.hostname}"${parsed.search === '' ? '' : ' with query parameters'}: only a loopback host without query parameters is accepted. This verifier writes fixtures and must only target a disposable local database.`
    );
  }
}

/** Names (never values) of parent variables that would redirect psql. */
export function findLibpqTargetOverrides(parentEnv) {
  return Object.keys(parentEnv).filter(key =>
    LIBPQ_TARGET_ENV_KEYS.includes(key.toUpperCase())
  );
}

export function buildPsqlEnv(parentEnv, applicationName) {
  const env = {};
  for (const [key, value] of Object.entries(parentEnv)) {
    if (!DROPPED_ENV_KEYS.has(key.toUpperCase())) env[key] = value;
  }
  env.PGAPPNAME = applicationName;
  env.PGCONNECT_TIMEOUT = '10';
  return env;
}

export function buildPsqlInvocation(
  dbUrl,
  applicationName,
  filePath,
  parentEnv
) {
  assertLoopbackDatabaseUrl(dbUrl);
  return {
    command: 'psql',
    args: [
      '--dbname',
      dbUrl,
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '--file',
      filePath,
    ],
    options: {
      env: buildPsqlEnv(parentEnv, applicationName),
      shell: false,
      windowsHide: true,
    },
  };
}
