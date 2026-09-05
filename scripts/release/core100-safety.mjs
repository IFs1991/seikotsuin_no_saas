import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  createManifest,
  createProfile,
  invariant,
  profileHash,
} from './core100-profile.mjs';

export function originOf(value) {
  invariant(typeof value === 'string', 'TARGET_ORIGIN_REQUIRED');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('INVALID_TARGET_ORIGIN');
  }
  invariant(
    !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === '/',
    'ORIGIN_MUST_NOT_CONTAIN_CREDENTIALS_PATH_OR_QUERY'
  );
  invariant(
    url.protocol === 'http:' || url.protocol === 'https:',
    'INVALID_TARGET_PROTOCOL'
  );
  return url.origin;
}

function loopback(origin) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname);
}

function originList(value, code) {
  invariant(Array.isArray(value), code);
  return value.map(originOf);
}

export function resolveTarget(config) {
  invariant(
    config && typeof config === 'object' && !Array.isArray(config),
    'CONFIG_REQUIRED'
  );
  invariant(
    typeof config.targetId === 'string' &&
      /^[a-zA-Z0-9_-]{1,50}$/.test(config.targetId),
    'INVALID_TARGET_ID'
  );
  invariant(Array.isArray(config.approvedTargets), 'APPROVED_TARGETS_REQUIRED');
  const targets = config.approvedTargets.filter(
    target => target && target.id === config.targetId
  );
  invariant(targets.length === 1, 'TARGET_NOT_UNIQUELY_ALLOWLISTED');
  const source = targets[0];
  invariant(
    source.environment === 'local' || source.environment === 'staging',
    'PRODUCTION_TARGET_REFUSED'
  );
  const appOrigin = originOf(source.appOrigin);
  const supabaseOrigin = originOf(source.supabaseOrigin);
  invariant(
    typeof source.projectRef === 'string' &&
      /^[a-z0-9-]{1,40}$/.test(source.projectRef),
    'INVALID_PROJECT_REF'
  );
  const productionApps = originList(
    config.productionAppOrigins,
    'PRODUCTION_APP_DENYLIST_REQUIRED'
  );
  const productionDatabases = originList(
    config.productionSupabaseOrigins,
    'PRODUCTION_DB_DENYLIST_REQUIRED'
  );
  invariant(
    Array.isArray(config.productionProjectRefs) &&
      config.productionProjectRefs.every(
        ref => typeof ref === 'string' && ref.length > 0
      ),
    'PRODUCTION_REF_DENYLIST_REQUIRED'
  );
  invariant(
    !productionApps.includes(appOrigin) &&
      !productionDatabases.includes(supabaseOrigin) &&
      !config.productionProjectRefs.includes(source.projectRef),
    'PRODUCTION_TARGET_REFUSED'
  );
  if (source.environment === 'local') {
    invariant(
      loopback(appOrigin) &&
        loopback(supabaseOrigin) &&
        source.projectRef === 'local',
      'LOCAL_TARGET_MUST_BE_LOOPBACK'
    );
  } else {
    invariant(
      !loopback(appOrigin) &&
        appOrigin.startsWith('https://') &&
        supabaseOrigin === `https://${source.projectRef}.supabase.co`,
      'STAGING_ORIGIN_REF_MISMATCH'
    );
    invariant(
      productionApps.length > 0 &&
        productionDatabases.length > 0 &&
        config.productionProjectRefs.length > 0,
      'REMOTE_PRODUCTION_TARGETS_MUST_BE_IDENTIFIED'
    );
  }
  return {
    id: source.id,
    environment: source.environment,
    appOrigin,
    supabaseOrigin,
    projectRef: source.projectRef,
    dedicated: source.dedicated === true,
    externalDeliveryBlocked: source.externalDeliveryBlocked === true,
  };
}

export function assertExecutionAllowed(target, flags, env = process.env) {
  invariant(
    flags.execute === true && flags.approvedTarget === target.id,
    'BLOCKED_EXECUTION_APPROVAL_REQUIRED'
  );
  invariant(
    target.dedicated && target.externalDeliveryBlocked,
    'BLOCKED_DEDICATED_ISOLATED_TARGET_REQUIRED'
  );
  invariant(
    env.VERCEL_ENV !== 'production' && env.NEXT_PUBLIC_APP_ENV !== 'production',
    'PRODUCTION_RUNTIME_REFUSED'
  );
  if (env.NEXT_PUBLIC_SUPABASE_URL)
    invariant(
      originOf(env.NEXT_PUBLIC_SUPABASE_URL) === target.supabaseOrigin,
      'AMBIENT_SUPABASE_TARGET_MISMATCH'
    );
  if (env.NEXT_PUBLIC_APP_URL)
    invariant(
      originOf(env.NEXT_PUBLIC_APP_URL) === target.appOrigin,
      'AMBIENT_APP_TARGET_MISMATCH'
    );
}

export function secretFromEnv(name, env = process.env) {
  const value = env[name];
  invariant(
    typeof value === 'string' && value.length > 0,
    `BLOCKED_MISSING_${name}`
  );
  return value;
}

export function fixturePassword(env = process.env) {
  const value = secretFromEnv('CORE100_FIXTURE_PASSWORD', env);
  invariant(value.length >= 16, 'FIXTURE_PASSWORD_MINIMUM_16_CHARACTERS');
  return value;
}

export function parseArguments(argv) {
  const [command, ...rest] = argv;
  invariant(
    ['plan', 'seed', 'load', 'verify-data'].includes(command),
    'USAGE_core100.mjs_plan_seed_load_verify-data'
  );
  const result = { command, execute: false, smoke: false };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--execute' || arg === '--smoke') {
      result[arg === '--execute' ? 'execute' : 'smoke'] = true;
    } else {
      const keys = {
        '--config': 'configFile',
        '--output': 'outputDirectory',
        '--approved-target': 'approvedTarget',
        '--load-result': 'loadResultFile',
      };
      invariant(
        Object.hasOwn(keys, arg) &&
          typeof rest[i + 1] === 'string' &&
          !rest[i + 1].startsWith('--'),
        'UNKNOWN_OR_INCOMPLETE_ARGUMENT'
      );
      const key = keys[arg];
      invariant(result[key] === undefined, 'DUPLICATE_ARGUMENT');
      result[key] = rest[++i];
    }
  }
  invariant(typeof result.configFile === 'string', 'CONFIG_FILE_REQUIRED');
  return result;
}

export async function readConfiguration(file) {
  const config = JSON.parse(await readFile(file, 'utf8'));
  const profile = createProfile(config);
  const target = resolveTarget(config);
  return { profile, target };
}

export function outputPaths(directory, runId) {
  const root = path.resolve(
    directory ?? path.join('artifacts', 'core100', runId)
  );
  return {
    root,
    manifest: path.join(root, 'manifest.json'),
    journal: path.join(root, 'seed-journal.ndjson'),
  };
}

export async function saveJson(file, value, { exclusive = false } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, {
    flag: exclusive ? 'wx' : 'w',
    mode: 0o600,
  });
}

export async function readManifest(file, profile, target) {
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  const expected = createManifest(profile, target);
  invariant(
    manifest.formatVersion === 1 &&
      manifest.profileHash === profileHash(profile),
    'MANIFEST_PROFILE_MISMATCH'
  );
  invariant(
    JSON.stringify(manifest.profile) === JSON.stringify(profile) &&
      JSON.stringify(manifest.target) === JSON.stringify(target),
    'MANIFEST_TARGET_OR_PROFILE_MISMATCH'
  );
  invariant(
    JSON.stringify(manifest.rootIds) === JSON.stringify(expected.rootIds) &&
      JSON.stringify(manifest.clinicIds) ===
        JSON.stringify(expected.clinicIds) &&
      JSON.stringify(manifest.users) === JSON.stringify(expected.users),
    'MANIFEST_FIXTURE_INVENTORY_MISMATCH'
  );
  return manifest;
}

export function databaseFailure(error, stage) {
  const code =
    error &&
    typeof error === 'object' &&
    typeof error.code === 'string' &&
    /^[A-Za-z0-9_]{1,30}$/.test(error.code)
      ? error.code
      : 'UNCLASSIFIED';
  return new Error(`DATABASE_${stage}_${code}`);
}

export function restrictedFetch(origin, fetcher = fetch) {
  return async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    invariant(
      url.origin === origin && !url.username && !url.password,
      'OUTBOUND_TARGET_MISMATCH'
    );
    return fetcher(input, {
      ...init,
      redirect: 'error',
      signal: init.signal ?? AbortSignal.timeout(30000),
    });
  };
}

export async function createSeedClient(target) {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    target.supabaseOrigin,
    secretFromEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: restrictedFetch(target.supabaseOrigin) },
    }
  );
}
