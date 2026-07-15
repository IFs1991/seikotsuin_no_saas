#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertPinnedSupabaseCliVersion } from '../verify-supabase-cli-version.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const FIXTURE_PREFIX = 'f8180000-0000-4000-8000-';
const tempDirectory = mkdtempSync(
  path.join(os.tmpdir(), 'commercial-pr08-invite-')
);
const writtenFiles = [];

const cliEnvironment = {
  ...process.env,
  DO_NOT_TRACK: '1',
  PGCONNECT_TIMEOUT: '10',
  SUPABASE_TELEMETRY_DISABLED: '1',
};
let localRuntime;

function readLocalRuntime() {
  const result = spawnSync('supabase', ['status', '--output', 'env'], {
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

  const requiredKeys = [
    'API_URL',
    'ANON_KEY',
    'DB_URL',
    'SERVICE_ROLE_KEY',
    'JWT_SECRET',
  ];
  for (const key of requiredKeys) {
    if (!values.get(key)) {
      throw new Error(`Local Supabase status did not provide ${key}`);
    }
  }

  return {
    apiUrl: values.get('API_URL'),
    anonKey: values.get('ANON_KEY'),
    dbUrl: values.get('DB_URL'),
    serviceRoleKey: values.get('SERVICE_ROLE_KEY'),
    jwtSecret: values.get('JWT_SECRET'),
  };
}

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createAuthenticatedJwt(secret) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const encodedHeader = encodeJwtPart({ alg: 'HS256', typ: 'JWT' });
  const encodedPayload = encodeJwtPart({
    aud: 'authenticated',
    exp: issuedAt + 3600,
    iat: issuedAt,
    iss: 'supabase-demo',
    role: 'authenticated',
    sub: fixtureId('000000000090'),
  });
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', secret)
    .update(unsignedToken)
    .digest('base64url');
  return `${unsignedToken}.${signature}`;
}

async function callAtomicRpc(runtime, bearerToken, apiKey = runtime.anonKey) {
  const response = await fetch(
    `${runtime.apiUrl}/rest/v1/rpc/accept_staff_invite_atomic`,
    {
      method: 'POST',
      headers: {
        apikey: apiKey,
        authorization: `Bearer ${bearerToken}`,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        p_token: fixtureId('000000000299'),
        p_user_id: fixtureId('000000000090'),
        p_account_email: 'nobody@example.invalid',
      }),
    }
  );
  const body = await response.text();
  return { body, status: response.status };
}

async function verifyRestExecutionBoundary(runtime) {
  const authenticatedJwt = createAuthenticatedJwt(runtime.jwtSecret);
  const anonResult = await callAtomicRpc(runtime, runtime.anonKey);
  const authenticatedResult = await callAtomicRpc(runtime, authenticatedJwt);

  for (const [role, result] of [
    ['anon', anonResult],
    ['authenticated', authenticatedResult],
  ]) {
    if (![401, 403, 404].includes(result.status)) {
      throw new Error(
        `PR-08 ${role} REST denial failed: HTTP ${String(result.status)} ${result.body}`
      );
    }
  }

  const serviceResult = await callAtomicRpc(
    runtime,
    runtime.serviceRoleKey,
    runtime.serviceRoleKey
  );
  if (serviceResult.status !== 200) {
    throw new Error(
      `PR-08 service_role REST execution failed: HTTP ${String(serviceResult.status)} ${serviceResult.body}`
    );
  }

  let serviceBody;
  try {
    serviceBody = JSON.parse(serviceResult.body);
  } catch {
    throw new Error('PR-08 service_role REST response was not JSON');
  }

  if (
    typeof serviceBody !== 'object' ||
    serviceBody === null ||
    Array.isArray(serviceBody) ||
    serviceBody.success !== false ||
    serviceBody.error_code !== 'INVITE_NOT_FOUND'
  ) {
    throw new Error('PR-08 service_role REST response contract drifted');
  }
}

function fixtureId(suffix) {
  return `${FIXTURE_PREFIX}${suffix}`;
}

function writeSqlFile(label, sql) {
  const filePath = path.join(tempDirectory, `${label}.sql`);
  writeFileSync(filePath, sql, 'utf8');
  writtenFiles.push(filePath);
  return filePath;
}

function runSqlFile(label, filePath) {
  if (!localRuntime) {
    return Promise.reject(
      new Error('Local Supabase runtime must be loaded before SQL execution')
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      'psql',
      [
        '--dbname',
        localRuntime.dbUrl,
        '--set',
        'ON_ERROR_STOP=1',
        '--no-psqlrc',
        '--file',
        filePath,
      ],
      {
        cwd: REPO_ROOT,
        env: cliEnvironment,
        shell: false,
        windowsHide: true,
      }
    );
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
    }, 120_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${label} failed with exit code ${String(code)}\n${stdout}\n${stderr}`
        )
      );
    });
  });
}

function buildWaitForHolderSql(applicationName) {
  return `
do $wait$
declare
  deadline timestamptz := pg_catalog.clock_timestamp() + interval '35 seconds';
begin
  loop
    perform pg_catalog.pg_stat_clear_snapshot();

    exit when exists (
      select 1
      from pg_catalog.pg_stat_activity
      where application_name = '${applicationName}'
        and state = 'active'
        and pg_catalog.strpos(query, 'do $hold$') > 0
    );

    if pg_catalog.clock_timestamp() >= deadline then
      raise exception 'PR-08 concurrency barrier timed out: ${applicationName}';
    end if;

    perform pg_catalog.pg_sleep(0.05);
  end loop;
end
$wait$;
`;
}

function buildHoldUntilBlockedSql(secondApplicationName, expiryToken) {
  const expiryWaitSql = expiryToken
    ? `
  loop
    exit when exists (
      select 1
      from public.staff_invites
      where token = '${expiryToken}'
        and expires_at <= pg_catalog.clock_timestamp()
    );

    if pg_catalog.clock_timestamp() >= deadline then
      raise exception 'PR-08 expiry hold timed out: ${secondApplicationName}';
    end if;

    perform pg_catalog.pg_sleep(0.05);
  end loop;
`
    : '';

  return `
do $hold$
-- PR08_HOLDER_READY
declare
  deadline timestamptz := pg_catalog.clock_timestamp() + interval '30 seconds';
begin
  loop
    perform pg_catalog.pg_stat_clear_snapshot();

    exit when exists (
      select 1
      from pg_catalog.pg_stat_activity activity
      where activity.application_name = '${secondApplicationName}'
        and pg_catalog.pg_backend_pid()
          = any (pg_catalog.pg_blocking_pids(activity.pid))
    );

    if pg_catalog.clock_timestamp() >= deadline then
      raise exception 'PR-08 blocked-caller hold timed out: ${secondApplicationName}';
    end if;

    perform pg_catalog.pg_sleep(0.05);
  end loop;
${expiryWaitSql}
end
$hold$;
`;
}

const clinicId = fixtureId('000000000001');
const sameUserId = fixtureId('000000000010');
const winnerUserId = fixtureId('000000000011');
const loserUserId = fixtureId('000000000012');
const expiryUserId = fixtureId('000000000013');
const sameInviteId = fixtureId('000000000101');
const differentInviteId = fixtureId('000000000102');
const expiryInviteId = fixtureId('000000000103');
const sameToken = fixtureId('000000000201');
const differentToken = fixtureId('000000000202');
const expiryToken = fixtureId('000000000203');

const setupFile = writeSqlFile(
  '00_setup',
  `
begin;
set local search_path = pg_catalog, extensions, public, auth;

drop table if exists app_private.pr08_concurrency_results;
create table app_private.pr08_concurrency_results (
  scenario text not null,
  actor text not null,
  result jsonb not null,
  primary key (scenario, actor)
);

delete from public.security_events
where user_id in ('${sameUserId}', '${winnerUserId}', '${loserUserId}', '${expiryUserId}');
delete from public.user_permissions
where staff_id in ('${sameUserId}', '${winnerUserId}', '${loserUserId}', '${expiryUserId}');
delete from public.profiles
where user_id in ('${sameUserId}', '${winnerUserId}', '${loserUserId}', '${expiryUserId}');
delete from public.staff_invites
where id in ('${sameInviteId}', '${differentInviteId}', '${expiryInviteId}');
delete from public.staff
where id in ('${sameUserId}', '${winnerUserId}', '${loserUserId}', '${expiryUserId}');
delete from auth.users
where id in ('${sameUserId}', '${winnerUserId}', '${loserUserId}', '${expiryUserId}');
delete from public.clinics where id = '${clinicId}';

insert into public.clinics (id, name)
values ('${clinicId}', '__commercial_pr08_concurrency_clinic__');

insert into auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  aud,
  role
)
values
  ('${sameUserId}', 'pr08-same@example.invalid', extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
  ('${winnerUserId}', 'pr08-winner@example.invalid', extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
  ('${loserUserId}', 'pr08-loser@example.invalid', extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
  ('${expiryUserId}', 'pr08-expiry@example.invalid', extensions.crypt('synthetic-not-a-secret', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), 'authenticated', 'authenticated');

insert into public.staff (id, clinic_id, name, role, email, password_hash)
values
  ('${sameUserId}', '${clinicId}', '__commercial_pr08_same__', 'staff', 'pr08-same@example.invalid', 'managed_by_supabase'),
  ('${winnerUserId}', '${clinicId}', '__commercial_pr08_winner__', 'staff', 'pr08-winner@example.invalid', 'managed_by_supabase'),
  ('${loserUserId}', '${clinicId}', '__commercial_pr08_loser__', 'staff', 'pr08-loser@example.invalid', 'managed_by_supabase'),
  ('${expiryUserId}', '${clinicId}', '__commercial_pr08_expiry__', 'staff', 'pr08-expiry@example.invalid', 'managed_by_supabase');

insert into public.staff_invites (
  id,
  clinic_id,
  email,
  role,
  token,
  expires_at,
  created_by
)
values
  ('${sameInviteId}', '${clinicId}', 'pr08-same@example.invalid', 'manager', '${sameToken}', '2099-01-01T00:00:00Z', '${sameUserId}'),
  ('${differentInviteId}', '${clinicId}', 'pr08-winner@example.invalid', 'therapist', '${differentToken}', '2099-01-01T00:00:00Z', '${sameUserId}'),
  ('${expiryInviteId}', '${clinicId}', 'pr08-expiry@example.invalid', 'staff', '${expiryToken}', '2099-01-01T00:00:00Z', '${sameUserId}');
commit;
`
);

const sameFirstFile = writeSqlFile(
  '10_same_first',
  `
set application_name = 'pr08_same_first';
begin;
with call_result as (
  select public.accept_staff_invite_atomic(
    '${sameToken}',
    '${sameUserId}',
    'pr08-same@example.invalid'
  ) as result
)
insert into app_private.pr08_concurrency_results (scenario, actor, result)
select 'same', 'first', result from call_result;
${buildHoldUntilBlockedSql('pr08_same_second')}
commit;
`
);

const sameWaitFile = writeSqlFile(
  '11_same_wait',
  buildWaitForHolderSql('pr08_same_first')
);

const sameSecondFile = writeSqlFile(
  '12_same_second',
  `
set application_name = 'pr08_same_second';
begin;
with call_result as (
  select public.accept_staff_invite_atomic(
    '${sameToken}',
    '${sameUserId}',
    'pr08-same@example.invalid'
  ) as result
)
insert into app_private.pr08_concurrency_results (scenario, actor, result)
select 'same', 'second', result from call_result;
commit;
`
);

const differentFirstFile = writeSqlFile(
  '20_different_first',
  `
set application_name = 'pr08_different_first';
begin;
with call_result as (
  select public.accept_staff_invite_atomic(
    '${differentToken}',
    '${winnerUserId}',
    'pr08-winner@example.invalid'
  ) as result
)
insert into app_private.pr08_concurrency_results (scenario, actor, result)
select 'different', 'winner', result from call_result;
${buildHoldUntilBlockedSql('pr08_different_second')}
commit;
`
);

const differentWaitFile = writeSqlFile(
  '21_different_wait',
  buildWaitForHolderSql('pr08_different_first')
);

const differentSecondFile = writeSqlFile(
  '22_different_second',
  `
set application_name = 'pr08_different_second';
begin;
with call_result as (
  select public.accept_staff_invite_atomic(
    '${differentToken}',
    '${loserUserId}',
    'pr08-loser@example.invalid'
  ) as result
)
insert into app_private.pr08_concurrency_results (scenario, actor, result)
select 'different', 'loser', result from call_result;
commit;
`
);

const expiryHolderFile = writeSqlFile(
  '31_expiry_holder',
  `
set application_name = 'pr08_expiry_holder';
begin;
select id
from public.staff_invites
where token = '${expiryToken}'
for update;
update public.staff_invites
set expires_at = pg_catalog.clock_timestamp() + interval '1 second'
where token = '${expiryToken}';
${buildHoldUntilBlockedSql('pr08_expiry_claim', expiryToken)}
commit;
`
);

const expiryWaitFile = writeSqlFile(
  '32_expiry_wait',
  buildWaitForHolderSql('pr08_expiry_holder')
);

const expiryClaimFile = writeSqlFile(
  '33_expiry_claim',
  `
set application_name = 'pr08_expiry_claim';
begin;
with call_result as (
  select public.accept_staff_invite_atomic(
    '${expiryToken}',
    '${expiryUserId}',
    'pr08-expiry@example.invalid'
  ) as result
)
insert into app_private.pr08_concurrency_results (scenario, actor, result)
select 'expiry', 'claimant', result from call_result;
commit;
`
);

const verifyFile = writeSqlFile(
  '90_verify',
  `
do $verify$
begin
  if (
    select count(*)
    from app_private.pr08_concurrency_results
    where scenario = 'same'
      and result @> '{"success":true,"idempotent":false}'::jsonb
  ) <> 1
    or (
      select count(*)
      from app_private.pr08_concurrency_results
      where scenario = 'same'
        and result @> '{"success":true,"idempotent":true}'::jsonb
    ) <> 1
  then
    raise exception 'PR-08 same-user race contract failed';
  end if;

  if (
    select count(*)
    from app_private.pr08_concurrency_results
    where scenario = 'different'
      and result @> '{"success":true,"idempotent":false}'::jsonb
  ) <> 1
    or (
      select count(*)
      from app_private.pr08_concurrency_results
      where scenario = 'different'
        and result ->> 'error_code' = 'INVITE_ALREADY_ACCEPTED'
    ) <> 1
  then
    raise exception 'PR-08 different-user race contract failed';
  end if;

  if (
    select count(*)
    from app_private.pr08_concurrency_results
    where scenario = 'expiry'
      and result ->> 'error_code' = 'INVITE_EXPIRED'
  ) <> 1
  then
    raise exception 'PR-08 expiry-during-lock contract failed';
  end if;

  if not exists (
    select 1
    from public.staff_invites
    where token = '${sameToken}'
      and accepted_by = '${sameUserId}'
      and accepted_at is not null
  )
    or not exists (
      select 1
      from public.staff_invites
      where token = '${differentToken}'
        and accepted_by = '${winnerUserId}'
        and accepted_at is not null
    )
    or exists (
      select 1
      from public.staff_invites
      where token = '${expiryToken}'
        and (accepted_at is not null or accepted_by is not null)
    )
  then
    raise exception 'PR-08 final invite claim state failed';
  end if;

  if exists (
    select 1 from public.profiles where user_id in ('${loserUserId}', '${expiryUserId}')
  )
    or exists (
      select 1 from public.user_permissions where staff_id in ('${loserUserId}', '${expiryUserId}')
    )
  then
    raise exception 'PR-08 losing or expired caller retained partial authority';
  end if;

  if (
    select count(*)
    from public.security_events
    where source_component = 'accept_staff_invite_atomic'
      and event_data ->> 'invite_id' in ('${sameInviteId}', '${differentInviteId}')
  ) <> 2
    or exists (
      select 1
      from public.security_events
      where source_component = 'accept_staff_invite_atomic'
        and event_data ->> 'invite_id' = '${expiryInviteId}'
    )
  then
    raise exception 'PR-08 concurrency audit cardinality failed';
  end if;
end
$verify$;
`
);

const cleanupFile = writeSqlFile(
  '99_cleanup',
  `
begin;
set local search_path = pg_catalog, public, auth;
drop table if exists app_private.pr08_concurrency_results;
delete from public.security_events
where user_id in ('${sameUserId}', '${winnerUserId}', '${loserUserId}', '${expiryUserId}');
delete from public.user_permissions
where staff_id in ('${sameUserId}', '${winnerUserId}', '${loserUserId}', '${expiryUserId}');
delete from public.profiles
where user_id in ('${sameUserId}', '${winnerUserId}', '${loserUserId}', '${expiryUserId}');
delete from public.staff_invites
where id in ('${sameInviteId}', '${differentInviteId}', '${expiryInviteId}');
delete from public.staff
where id in ('${sameUserId}', '${winnerUserId}', '${loserUserId}', '${expiryUserId}');
delete from auth.users
where id in ('${sameUserId}', '${winnerUserId}', '${loserUserId}', '${expiryUserId}');
delete from public.clinics where id = '${clinicId}';
commit;
`
);

async function runSerializedRace(options) {
  const firstOutcome = runSqlFile(
    `${options.label} first caller`,
    options.firstFile
  ).then(
    value => ({ ok: true, value }),
    error => ({ error, ok: false })
  );
  const readinessOutcome = runSqlFile(
    `${options.label} concurrency barrier`,
    options.waitFile
  ).then(
    value => ({ ok: true, value }),
    error => ({ error, ok: false })
  );
  const firstOrReadiness = await Promise.race([
    firstOutcome.then(outcome => ({ outcome, source: 'first' })),
    readinessOutcome.then(outcome => ({ outcome, source: 'readiness' })),
  ]);

  if (firstOrReadiness.source === 'first') {
    if (!firstOrReadiness.outcome.ok) {
      throw firstOrReadiness.outcome.error;
    }

    throw new Error(
      `${options.label} first caller completed before the readiness barrier observed its holder marker`
    );
  }

  if (!firstOrReadiness.outcome.ok) {
    throw firstOrReadiness.outcome.error;
  }

  const secondOutcome = runSqlFile(
    `${options.label} second caller`,
    options.secondFile
  ).then(
    value => ({ ok: true, value }),
    error => ({ error, ok: false })
  );
  const [firstResult, secondResult] = await Promise.all([
    firstOutcome,
    secondOutcome,
  ]);

  if (!firstResult.ok) throw firstResult.error;
  if (!secondResult.ok) throw secondResult.error;
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--local') {
    throw new Error(
      'Usage: verify-atomic-staff-invite.mjs --local (linked databases are unsupported)'
    );
  }

  const cliVersion = assertPinnedSupabaseCliVersion();
  localRuntime = readLocalRuntime();
  let setupCompleted = false;
  let primaryError;

  try {
    await verifyRestExecutionBoundary(localRuntime);
    await runSqlFile('PR-08 concurrency fixture setup', setupFile);
    setupCompleted = true;

    await runSerializedRace({
      label: 'same-user race',
      firstFile: sameFirstFile,
      waitFile: sameWaitFile,
      secondFile: sameSecondFile,
    });
    await runSerializedRace({
      label: 'different-user race',
      firstFile: differentFirstFile,
      waitFile: differentWaitFile,
      secondFile: differentSecondFile,
    });

    await runSerializedRace({
      label: 'expiry-during-lock race',
      firstFile: expiryHolderFile,
      waitFile: expiryWaitFile,
      secondFile: expiryClaimFile,
    });

    await runSqlFile('PR-08 concurrency verification', verifyFile);
    console.log(
      `Atomic staff invite boundary verified with Supabase CLI ${cliVersion}: REST role denial, service execution, same-user idempotency, different-user exclusion, and expiry during row-lock wait.`
    );
  } catch (error) {
    primaryError = error;
  } finally {
    if (setupCompleted) {
      try {
        await runSqlFile('PR-08 concurrency fixture cleanup', cleanupFile);
      } catch (cleanupError) {
        if (!primaryError) {
          primaryError = cleanupError;
        } else {
          console.error(
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError)
          );
        }
      }
    }

    for (const filePath of writtenFiles) {
      unlinkSync(filePath);
    }
    rmdirSync(tempDirectory);
  }

  if (primaryError) {
    throw primaryError;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
