#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import { readPinnedSupabaseCliVersion } from '../verify-supabase-cli-version.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const PERMISSION_PROBE_ROLE = 'pr09_hook_permission_probe';
const AUTHORITY_CLAIMS = ['user_role', 'clinic_id', 'clinic_scope_ids'];

const cliEnvironment = {
  ...process.env,
  DO_NOT_TRACK: '1',
  PGCONNECT_TIMEOUT: '10',
  SUPABASE_TELEMETRY_DISABLED: '1',
};

function supabaseCliInvocation(args) {
  const cliJavaScriptPath = process.env.SUPABASE_CLI_JS_PATH?.trim();
  if (!cliJavaScriptPath) {
    return { args, command: 'supabase' };
  }

  invariant(
    path.isAbsolute(cliJavaScriptPath) &&
      path.extname(cliJavaScriptPath).toLowerCase() === '.js',
    'SUPABASE_CLI_JS_PATH must be an absolute JavaScript file path'
  );
  return {
    args: [cliJavaScriptPath, ...args],
    command: process.execPath,
  };
}

function runSupabaseCli(args, timeout = 60_000) {
  const invocation = supabaseCliInvocation(args);
  return spawnSync(invocation.command, invocation.args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: cliEnvironment,
    maxBuffer: 16 * 1024 * 1024,
    timeout,
    windowsHide: true,
  });
}

function assertSupabaseCliVersion() {
  const expected = readPinnedSupabaseCliVersion();
  const result = runSupabaseCli(['--version'], 30_000);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Failed to read Supabase CLI version (exit ${String(result.status)}): ${result.stderr.trim()}`
    );
  }

  const actual = result.stdout.trim();
  invariant(
    actual === expected,
    `Supabase CLI version mismatch: expected ${expected} from .supabase-cli-version, received ${actual}`
  );
  return expected;
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return String(error);
}

function readLocalRuntime() {
  const result = runSupabaseCli(['status', '--output', 'env']);

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Failed to read local Supabase status (exit ${String(result.status)}): ${result.stderr.trim()}`
    );
  }

  const values = new Map();
  for (const line of result.stdout.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;

    let value = rawValue;
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      value = JSON.parse(rawValue);
    }
    values.set(key, value);
  }

  for (const key of ['API_URL', 'ANON_KEY', 'DB_URL', 'SERVICE_ROLE_KEY']) {
    if (!values.get(key)) {
      throw new Error(`Local Supabase status did not provide ${key}`);
    }
  }

  const runtime = {
    apiUrl: values.get('API_URL'),
    anonKey: values.get('ANON_KEY'),
    dbUrl: values.get('DB_URL'),
    serviceRoleKey: values.get('SERVICE_ROLE_KEY'),
  };
  assertLoopbackRuntime(runtime);
  return runtime;
}

function assertLoopbackRuntime(runtime) {
  const apiUrl = new URL(runtime.apiUrl);
  const dbUrl = new URL(runtime.dbUrl);
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

  invariant(
    loopbackHosts.has(apiUrl.hostname),
    'PR-09 verifier refuses a non-loopback Supabase API URL'
  );
  invariant(
    loopbackHosts.has(dbUrl.hostname),
    'PR-09 verifier refuses a non-loopback Postgres URL'
  );
  invariant(
    apiUrl.protocol === 'http:' || apiUrl.protocol === 'https:',
    'PR-09 verifier received an unsupported local API protocol'
  );
  invariant(
    dbUrl.protocol === 'postgres:' || dbUrl.protocol === 'postgresql:',
    'PR-09 verifier received an unsupported local database protocol'
  );
}

function runPsql(runtime, label, sql) {
  const result = spawnSync(
    'psql',
    [
      '--dbname',
      runtime.dbUrl,
      '--set',
      'ON_ERROR_STOP=1',
      '--no-psqlrc',
      '--tuples-only',
      '--no-align',
      '--command',
      sql,
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: cliEnvironment,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 60_000,
      windowsHide: true,
    }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit code ${String(result.status)}\n${result.stdout.trim()}\n${result.stderr.trim()}`
    );
  }
  return result.stdout.trim();
}

function recoverPermissionProbe(runtime) {
  runPsql(
    runtime,
    'PR-09 hook permission-probe recovery',
    `
do $recovery$
begin
  if to_regrole('${PERMISSION_PROBE_ROLE}') is not null
     and pg_get_userbyid(
       (
         select proowner
         from pg_proc
         where oid = 'app_private.custom_access_token_hook(jsonb)'::regprocedure
       )
     ) = '${PERMISSION_PROBE_ROLE}'
  then
    execute 'alter function app_private.custom_access_token_hook(jsonb) owner to postgres';
  end if;

  if to_regrole('${PERMISSION_PROBE_ROLE}') is not null then
    execute 'revoke usage, create on schema app_private from ${PERMISSION_PROBE_ROLE}';
    execute 'revoke ${PERMISSION_PROBE_ROLE} from postgres';
  end if;
end
$recovery$;
drop role if exists ${PERMISSION_PROBE_ROLE};
`
  );
}

function readHookState(runtime) {
  const output = runPsql(
    runtime,
    'PR-09 hook state inspection',
    `
select json_build_object(
  'owner', pg_get_userbyid(proowner),
  'acl', coalesce(proacl::text, ''),
  'security_definer', prosecdef,
  'volatility', provolatile,
  'configuration', coalesce(array_to_string(proconfig, E'\\n'), '')
)::text
from pg_proc
where oid = 'app_private.custom_access_token_hook(jsonb)'::regprocedure;
`
  );

  invariant(output.length > 0, 'PR-09 custom access token hook is missing');
  const state = JSON.parse(output);
  invariant(
    typeof state === 'object' && state !== null && !Array.isArray(state),
    'PR-09 custom access token hook state was malformed'
  );
  return state;
}

function installPermissionProbe(runtime) {
  runPsql(
    runtime,
    'PR-09 hook permission-probe installation',
    `
create role ${PERMISSION_PROBE_ROLE}
  nologin nosuperuser nocreatedb nocreaterole noinherit;

do $privilege$
begin
  if has_table_privilege(
    '${PERMISSION_PROBE_ROLE}',
    'public.user_permissions',
    'select'
  )
  then
    raise exception 'permission probe unexpectedly has user_permissions SELECT';
  end if;
end
$privilege$;

grant ${PERMISSION_PROBE_ROLE} to postgres;
grant usage, create on schema app_private to ${PERMISSION_PROBE_ROLE};

alter function app_private.custom_access_token_hook(jsonb)
  owner to ${PERMISSION_PROBE_ROLE};
`
  );
}

function restorePermissionProbe(runtime) {
  recoverPermissionProbe(runtime);
}

function decodeJwt(accessToken) {
  const parts = accessToken.split('.');
  invariant(parts.length === 3, 'Supabase Auth returned a malformed JWT');

  const payload = JSON.parse(
    Buffer.from(parts[1], 'base64url').toString('utf8')
  );
  invariant(
    typeof payload === 'object' && payload !== null && !Array.isArray(payload),
    'Supabase Auth returned a non-object JWT payload'
  );
  return payload;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertAuthorityClaims(accessToken, expected) {
  const claims = decodeJwt(accessToken);
  invariant(
    claims.sub === expected.userId,
    `${expected.label}: JWT subject drifted`
  );
  invariant(
    claims.role === 'authenticated',
    `${expected.label}: standard JWT role drifted`
  );
  invariant(
    claims.user_role === expected.role,
    `${expected.label}: top-level DB authority role was not issued`
  );
  invariant(
    claims.clinic_id === expected.clinicId,
    `${expected.label}: top-level DB authority clinic was not issued`
  );
  invariant(
    Array.isArray(claims.clinic_scope_ids) &&
      claims.clinic_scope_ids.length === 1 &&
      claims.clinic_scope_ids[0] === expected.clinicId,
    `${expected.label}: top-level DB authority scope was not issued`
  );

  const appMetadata = claims.app_metadata;
  invariant(
    typeof appMetadata === 'object' &&
      appMetadata !== null &&
      !Array.isArray(appMetadata),
    `${expected.label}: app_metadata was malformed`
  );
  const metadataHasAuthority = AUTHORITY_CLAIMS.some(key =>
    hasOwn(appMetadata, key)
  );
  if (metadataHasAuthority) {
    invariant(
      appMetadata.user_role === expected.role &&
        appMetadata.clinic_id === expected.clinicId &&
        Array.isArray(appMetadata.clinic_scope_ids) &&
        appMetadata.clinic_scope_ids.length === 1 &&
        appMetadata.clinic_scope_ids[0] === expected.clinicId,
      `${expected.label}: app_metadata authority contradicted top-level DB authority`
    );
  }
}

function assertAuthorityCleared(accessToken, expected) {
  const claims = decodeJwt(accessToken);
  invariant(
    claims.sub === expected.userId,
    `${expected.label}: JWT subject drifted`
  );
  invariant(
    claims.role === 'authenticated',
    `${expected.label}: standard JWT role drifted`
  );

  for (const key of AUTHORITY_CLAIMS) {
    invariant(
      !hasOwn(claims, key),
      `${expected.label}: stale top-level ${key} authority survived refresh`
    );
  }

  const appMetadata = claims.app_metadata;
  invariant(
    typeof appMetadata === 'object' &&
      appMetadata !== null &&
      !Array.isArray(appMetadata),
    `${expected.label}: app_metadata was malformed`
  );
  for (const key of ['user_role', 'role', 'clinic_id', 'clinic_scope_ids']) {
    invariant(
      !hasOwn(appMetadata, key),
      `${expected.label}: stale app_metadata ${key} authority survived refresh`
    );
  }
}

function createSupabaseClients(runtime) {
  const commonAuthOptions = {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  };

  return {
    service: createClient(runtime.apiUrl, runtime.serviceRoleKey, {
      auth: commonAuthOptions,
    }),
    staff: createClient(runtime.apiUrl, runtime.anonKey, {
      auth: commonAuthOptions,
    }),
    manager: createClient(runtime.apiUrl, runtime.anonKey, {
      auth: commonAuthOptions,
    }),
  };
}

async function requireResult(promise, label) {
  const result = await promise;
  if (result.error) {
    throw new Error(`${label}: ${errorMessage(result.error)}`);
  }
  return result.data;
}

async function refreshSession(client, session, label) {
  const data = await requireResult(
    client.auth.refreshSession({ refresh_token: session.refresh_token }),
    label
  );
  invariant(data.session !== null, `${label}: refresh returned no session`);
  invariant(
    data.session.access_token !== session.access_token,
    `${label}: refresh reused the previous access token`
  );
  return data.session;
}

async function assertRlsVisibility(runtime, accessToken, feedbackId, expected) {
  const scopedClient = createClient(runtime.apiUrl, runtime.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: { authorization: `Bearer ${accessToken}` },
    },
  });
  const data = await requireResult(
    scopedClient.from('beta_feedback').select('id').eq('id', feedbackId),
    'PR-09 authenticated PostgREST/RLS query'
  );
  const rows = data ?? [];

  if (expected) {
    invariant(
      rows.length === 1 && rows[0]?.id === feedbackId,
      'PR-09 RLS unexpectedly hid the in-scope feedback row'
    );
    return;
  }
  invariant(rows.length === 0, 'PR-09 RLS exposed a denied feedback row');
}

async function createAuthorityFixture(service, fixture) {
  const created = await requireResult(
    service.auth.admin.createUser({
      email: fixture.email,
      email_confirm: true,
      password: fixture.password,
    }),
    `${fixture.label}: create local Auth user`
  );
  invariant(
    created.user !== null,
    `${fixture.label}: Auth user was not created`
  );
  fixture.userId = created.user.id;

  await requireResult(
    service.from('staff').insert({
      clinic_id: fixture.clinicId,
      email: fixture.email,
      id: fixture.userId,
      name: fixture.displayName,
      password_hash: 'managed_by_supabase',
      role: fixture.role,
    }),
    `${fixture.label}: create staff authority row`
  );
  await requireResult(
    service.from('profiles').insert({
      clinic_id: fixture.clinicId,
      email: fixture.email,
      full_name: fixture.displayName,
      is_active: true,
      role: fixture.role,
      user_id: fixture.userId,
    }),
    `${fixture.label}: create active profile`
  );
  await requireResult(
    service.from('user_permissions').insert({
      clinic_id: fixture.clinicId,
      hashed_password: 'managed_by_supabase',
      role: fixture.role,
      staff_id: fixture.userId,
      username: fixture.username,
    }),
    `${fixture.label}: create DB permission authority`
  );
}

async function insertPermission(service, fixture) {
  await requireResult(
    service.from('user_permissions').insert({
      clinic_id: fixture.clinicId,
      hashed_password: 'managed_by_supabase',
      role: fixture.role,
      staff_id: fixture.userId,
      username: fixture.username,
    }),
    `${fixture.label}: restore DB permission authority`
  );
}

async function signIn(client, fixture) {
  const data = await requireResult(
    client.auth.signInWithPassword({
      email: fixture.email,
      password: fixture.password,
    }),
    `${fixture.label}: password sign-in through local GoTrue`
  );
  invariant(
    data.session !== null,
    `${fixture.label}: sign-in returned no session`
  );
  invariant(
    data.user.id === fixture.userId,
    `${fixture.label}: signed-in user drifted`
  );
  fixture.latestAccessToken = data.session.access_token;
  return data.session;
}

async function verifyStaffAuthority(options) {
  const { client, fixture, feedbackId, runtime, service } = options;
  let session = await signIn(client, fixture);
  assertAuthorityClaims(session.access_token, fixture);
  await assertRlsVisibility(runtime, session.access_token, feedbackId, true);

  await requireResult(
    service
      .from('profiles')
      .update({ is_active: false })
      .eq('user_id', fixture.userId)
      .select('user_id')
      .single(),
    `${fixture.label}: deactivate profile`
  );
  assertAuthorityClaims(session.access_token, fixture);
  await assertRlsVisibility(runtime, session.access_token, feedbackId, false);

  session = await refreshSession(
    client,
    session,
    `${fixture.label}: inactive refresh`
  );
  fixture.latestAccessToken = session.access_token;
  assertAuthorityCleared(session.access_token, fixture);
  await assertRlsVisibility(runtime, session.access_token, feedbackId, false);

  await requireResult(
    service
      .from('profiles')
      .update({ is_active: true })
      .eq('user_id', fixture.userId)
      .select('user_id')
      .single(),
    `${fixture.label}: reactivate profile`
  );
  session = await refreshSession(
    client,
    session,
    `${fixture.label}: reactivated refresh`
  );
  fixture.latestAccessToken = session.access_token;
  assertAuthorityClaims(session.access_token, fixture);
  await assertRlsVisibility(runtime, session.access_token, feedbackId, true);

  await requireResult(
    service
      .from('user_permissions')
      .delete()
      .eq('staff_id', fixture.userId)
      .select('staff_id')
      .single(),
    `${fixture.label}: delete DB permission authority`
  );
  assertAuthorityClaims(session.access_token, fixture);
  await assertRlsVisibility(runtime, session.access_token, feedbackId, false);

  session = await refreshSession(
    client,
    session,
    `${fixture.label}: missing-permission refresh`
  );
  fixture.latestAccessToken = session.access_token;
  assertAuthorityCleared(session.access_token, fixture);
  await assertRlsVisibility(runtime, session.access_token, feedbackId, false);

  await insertPermission(service, fixture);
  session = await refreshSession(
    client,
    session,
    `${fixture.label}: restored-permission refresh`
  );
  fixture.latestAccessToken = session.access_token;
  assertAuthorityClaims(session.access_token, fixture);
  await assertRlsVisibility(runtime, session.access_token, feedbackId, true);
  return session;
}

async function verifyManagerRevocation(options) {
  const { client, fixture, feedbackId, runtime, service } = options;
  await requireResult(
    service.from('manager_clinic_assignments').insert({
      assigned_by: fixture.userId,
      clinic_id: fixture.clinicId,
      manager_user_id: fixture.userId,
    }),
    `${fixture.label}: create active manager assignment`
  );

  let session = await signIn(client, fixture);
  assertAuthorityClaims(session.access_token, fixture);
  await assertRlsVisibility(runtime, session.access_token, feedbackId, true);

  await requireResult(
    service
      .from('manager_clinic_assignments')
      .update({
        revoke_reason: 'commercial-pr09-local-auth-verifier',
        revoked_at: new Date().toISOString(),
        revoked_by: fixture.userId,
      })
      .eq('manager_user_id', fixture.userId)
      .eq('clinic_id', fixture.clinicId)
      .is('revoked_at', null)
      .select('id')
      .single(),
    `${fixture.label}: revoke manager assignment`
  );

  assertAuthorityClaims(session.access_token, fixture);
  await assertRlsVisibility(runtime, session.access_token, feedbackId, false);

  session = await refreshSession(
    client,
    session,
    `${fixture.label}: revoked-assignment refresh`
  );
  fixture.latestAccessToken = session.access_token;
  assertAuthorityCleared(session.access_token, fixture);
  await assertRlsVisibility(runtime, session.access_token, feedbackId, false);
  return session;
}

async function verifyPermissionQueryFailure(options) {
  const { baselineHookState, client, fixture, runtime, session } = options;
  let probeInstalled = false;
  let primaryError;

  try {
    installPermissionProbe(runtime);
    probeInstalled = true;

    const probeState = readHookState(runtime);
    invariant(
      probeState.owner === PERMISSION_PROBE_ROLE,
      'PR-09 permission probe did not become the hook execution owner'
    );

    const result = await client.auth.refreshSession({
      refresh_token: session.refresh_token,
    });
    invariant(
      result.error !== null,
      'PR-09 GoTrue refresh minted a token after the hook DB permission query failed'
    );
    invariant(
      result.data.session === null,
      'PR-09 GoTrue returned a session after the hook DB permission query failed'
    );
  } catch (error) {
    primaryError = error;
  } finally {
    if (probeInstalled) {
      try {
        restorePermissionProbe(runtime);
      } catch (restoreError) {
        if (!primaryError) {
          primaryError = restoreError;
        } else {
          primaryError = new Error(
            `${errorMessage(primaryError)}; hook restoration also failed: ${errorMessage(restoreError)}`
          );
        }
      }
    }
  }

  if (primaryError) throw primaryError;

  const restoredHookState = readHookState(runtime);
  invariant(
    JSON.stringify(restoredHookState) === JSON.stringify(baselineHookState),
    'PR-09 hook owner or execution contract was not restored exactly'
  );

  const recoveredSession = await signIn(client, fixture);
  assertAuthorityClaims(recoveredSession.access_token, fixture);
  return recoveredSession;
}

async function bestEffortDelete(service, table, column, value, failures) {
  const result = await service.from(table).delete().eq(column, value);
  if (result.error) {
    failures.push(`${table}: ${errorMessage(result.error)}`);
  }
}

async function cleanupFixtures(options) {
  const { feedbackId, fixtures, rootClinicId, service } = options;
  const failures = [];

  for (const fixture of fixtures) {
    const token = fixture.latestAccessToken;
    if (!token) continue;
    const result = await service.auth.admin.signOut(token, 'global');
    if (result.error) {
      failures.push(`Auth session revocation: ${errorMessage(result.error)}`);
    }
  }

  await bestEffortDelete(service, 'beta_feedback', 'id', feedbackId, failures);
  for (const fixture of fixtures) {
    if (!fixture.userId) continue;
    await bestEffortDelete(
      service,
      'manager_clinic_assignments',
      'manager_user_id',
      fixture.userId,
      failures
    );
    await bestEffortDelete(
      service,
      'user_permissions',
      'staff_id',
      fixture.userId,
      failures
    );
    await bestEffortDelete(
      service,
      'profiles',
      'user_id',
      fixture.userId,
      failures
    );
    await bestEffortDelete(service, 'staff', 'id', fixture.userId, failures);

    const result = await service.auth.admin.deleteUser(fixture.userId);
    if (result.error && !/not found/i.test(errorMessage(result.error))) {
      failures.push(
        `Auth user ${fixture.label}: ${errorMessage(result.error)}`
      );
    }
  }
  await bestEffortDelete(
    service,
    'clinics',
    'id',
    fixtures[0].clinicId,
    failures
  );
  await bestEffortDelete(service, 'clinics', 'id', rootClinicId, failures);

  if (failures.length > 0) {
    throw new Error(`PR-09 fixture cleanup failed: ${failures.join('; ')}`);
  }
}

function buildFixture(role, clinicId, runId) {
  const label = `PR-09 local ${role}`;
  return {
    clinicId,
    displayName: label,
    email: `commercial-pr09-${role}-${runId}@example.invalid`,
    label,
    latestAccessToken: null,
    password: `Pr09-${randomUUID()}-A9!`,
    role,
    userId: null,
    username: `commercial_pr09_${role}_${runId}`,
  };
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--local') {
    throw new Error(
      'Usage: verify-pr09-auth-integration.mjs --local (linked databases are unsupported)'
    );
  }

  const cliVersion = assertSupabaseCliVersion();
  const runtime = readLocalRuntime();
  recoverPermissionProbe(runtime);

  const baselineHookState = readHookState(runtime);
  invariant(
    baselineHookState.owner === 'postgres' &&
      baselineHookState.security_definer === true,
    'PR-09 hook owner/security-definer contract drifted before integration test'
  );

  const { manager, service, staff } = createSupabaseClients(runtime);
  const runId = randomUUID().replaceAll('-', '').slice(0, 16);
  const rootClinicId = randomUUID();
  const clinicId = randomUUID();
  const feedbackId = randomUUID();
  const staffFixture = buildFixture('staff', clinicId, runId);
  const managerFixture = buildFixture('manager', clinicId, runId);
  const fixtures = [staffFixture, managerFixture];
  let primaryError;

  try {
    await requireResult(
      service.from('clinics').insert([
        {
          id: rootClinicId,
          is_active: true,
          name: `__commercial_pr09_auth_root_${runId}__`,
        },
        {
          id: clinicId,
          is_active: true,
          name: `__commercial_pr09_auth_child_${runId}__`,
          parent_id: rootClinicId,
        },
      ]),
      'PR-09 create isolated clinic fixture'
    );
    await createAuthorityFixture(service, staffFixture);
    await createAuthorityFixture(service, managerFixture);
    await requireResult(
      service.from('beta_feedback').insert({
        category: 'other',
        clinic_id: clinicId,
        description: 'Local GoTrue and PostgREST/RLS integration fixture',
        id: feedbackId,
        severity: 'low',
        title: `__commercial_pr09_auth_${runId}__`,
        user_id: staffFixture.userId,
        user_name: staffFixture.displayName,
      }),
      'PR-09 create isolated RLS fixture'
    );

    let staffSession = await verifyStaffAuthority({
      client: staff,
      feedbackId,
      fixture: staffFixture,
      runtime,
      service,
    });
    await verifyManagerRevocation({
      client: manager,
      feedbackId,
      fixture: managerFixture,
      runtime,
      service,
    });

    staffSession = await verifyPermissionQueryFailure({
      baselineHookState,
      client: staff,
      fixture: staffFixture,
      runtime,
      session: staffSession,
    });
    console.log(
      `PR-09 local Auth authority verified with Supabase CLI ${cliVersion}: GoTrue sign-in/refresh, DB-issued claims, stale-token DB denial, inactive-profile clearing, missing-permission clearing, revoked-manager clearing, PostgREST RLS denial, and fail-closed hook DB permission error.`
    );
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      restorePermissionProbe(runtime);
    } catch (restoreError) {
      if (!primaryError) {
        primaryError = restoreError;
      } else {
        primaryError = new Error(
          `${errorMessage(primaryError)}; final hook restoration also failed: ${errorMessage(restoreError)}`
        );
      }
    }

    try {
      await cleanupFixtures({
        feedbackId,
        fixtures,
        rootClinicId,
        service,
      });
    } catch (cleanupError) {
      if (!primaryError) {
        primaryError = cleanupError;
      } else {
        primaryError = new Error(
          `${errorMessage(primaryError)}; fixture cleanup also failed: ${errorMessage(cleanupError)}`
        );
      }
    }
  }

  if (primaryError) throw primaryError;
}

main().catch(error => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
