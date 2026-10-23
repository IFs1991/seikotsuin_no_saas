#!/usr/bin/env node
/**
 * OS-F1 (#147) customer visit cache: real-DB race verification.
 *
 * Each race runs two psql sessions against a disposable LOCAL database. In
 * the blocking races the holder writes inside an open transaction and keeps
 * it open until pg_blocking_pids() proves the waiter is blocked by it, then
 * commits. In the snapshot races the waiter takes its snapshot first and
 * writes only after the holder has committed and disconnected. The final
 * cache is compared with literal expectations. Only loopback hosts are
 * accepted, and libpq variables that could redirect psql (PGHOSTADDR,
 * PGSERVICE, ...) are not passed to it (see ../daily-reports/local-psql.mjs).
 *
 * Usage: node scripts/customers/verify-customer-stat-races.mjs
 *          [--db-url postgresql://postgres:postgres@127.0.0.1:54332/postgres]
 * Spec: docs/stabilization/spec-os-customer-stat-authority-v0.1.md §5
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assertLoopbackDatabaseUrl,
  buildPsqlInvocation,
  findLibpqTargetOverrides,
} from '../daily-reports/local-psql.mjs';

const DEFAULT_DB_URL =
  'postgresql://postgres:postgres@127.0.0.1:54332/postgres';
const PREFIX = 'f1479000-0000-4000-8000-';
const id = suffix => `${PREFIX}${suffix}`;

const CLINIC = id('000000000001');
const USER = id('000000000010');
const MENU = id('000000000020');
const RESOURCE = id('000000000030');
const CLAIMS = JSON.stringify({
  sub: USER,
  role: 'authenticated',
  app_metadata: { user_role: 'staff', clinic_scope_ids: [CLINIC] },
});

function parseArgs(argv) {
  if (argv.length === 0) return DEFAULT_DB_URL;
  if (argv.length === 2 && argv[0] === '--db-url' && argv[1]) return argv[1];
  throw new Error('Usage: verify-customer-stat-races.mjs [--db-url <url>]');
}

let tempDirectory = null;
const writtenFiles = [];
let fileCounter = 0;

function runSql(dbUrl, applicationName, sql) {
  fileCounter += 1;
  tempDirectory ??= mkdtempSync(path.join(os.tmpdir(), 'os-f1-races-'));
  const filePath = path.join(tempDirectory, `${fileCounter}.sql`);
  writeFileSync(filePath, sql, 'utf8');
  writtenFiles.push(filePath);

  const { command, args, options } = buildPsqlInvocation(
    dbUrl,
    applicationName,
    filePath,
    process.env
  );
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => child.kill(), 90_000);
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
      const notices = [...stderr.matchAll(/NOTICE:\s+(.*)$/gm)].map(m =>
        m[1].trim()
      );
      if (code === 0) {
        resolve({ notices, stdout, stderr });
        return;
      }
      reject(
        new Error(`${applicationName} failed (exit ${String(code)})\n${stderr}`)
      );
    });
  });
}

const AUTH = `set role authenticated;\nselect set_config('request.jwt.claims', '${CLAIMS}', false);\n`;
const SERVICE = 'set role service_role;\n';

function holdUntilBlocked(waiterApp) {
  return `
do $hold$
declare
  deadline timestamptz := pg_catalog.clock_timestamp() + interval '30 seconds';
begin
  loop
    perform pg_catalog.pg_stat_clear_snapshot();
    exit when exists (
      select 1 from pg_catalog.pg_stat_activity activity
      where activity.application_name = '${waiterApp}'
        and pg_catalog.pg_backend_pid() = any (pg_catalog.pg_blocking_pids(activity.pid))
    );
    if pg_catalog.clock_timestamp() >= deadline then
      raise exception 'OS-F1 hold timed out waiting for ${waiterApp} to block';
    end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
  raise notice 'HOLDER_SAW_WAITER_BLOCKED';
end
$hold$;
`;
}

function waitForActive(otherApp, marker) {
  return `
do $wait$
declare
  deadline timestamptz := pg_catalog.clock_timestamp() + interval '30 seconds';
begin
  loop
    perform pg_catalog.pg_stat_clear_snapshot();
    exit when exists (
      select 1 from pg_catalog.pg_stat_activity
      where application_name = '${otherApp}' and state = 'active'
        and pg_catalog.strpos(query, '${marker}') > 0
    );
    if pg_catalog.clock_timestamp() >= deadline then
      raise exception 'OS-F1 barrier timed out waiting for ${otherApp}';
    end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
end
$wait$;
`;
}

// Snapshot races hand over through an advisory lock: the holder takes it
// first and releases it only after its commit, and only once the waiter
// (already holding its snapshot) is observed blocked on it.
const SNAPSHOT_LOCK_CLASS = 1470;

// Runs inside the waiter's open transaction, after its snapshot was taken:
// returns once the holder has committed and released the advisory lock.
function waitForHolderCommit(lockKey) {
  return `
do $snap$
declare
  deadline timestamptz := pg_catalog.clock_timestamp() + interval '30 seconds';
begin
  loop
    exit when exists (
      select 1 from pg_catalog.pg_locks lock_row
      where lock_row.locktype = 'advisory' and lock_row.granted
        and lock_row.classid = ${SNAPSHOT_LOCK_CLASS}::oid
        and lock_row.objid = ${lockKey}::oid and lock_row.objsubid = 2
    );
    if pg_catalog.clock_timestamp() >= deadline then
      raise exception 'OS-F1 snapshot barrier timed out waiting for the holder lock';
    end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
  perform pg_catalog.pg_advisory_lock(${SNAPSHOT_LOCK_CLASS}, ${lockKey});
  perform pg_catalog.pg_advisory_unlock(${SNAPSHOT_LOCK_CLASS}, ${lockKey});
end
$snap$;
`;
}

function reservation(suffix, customerSuffix, day, price, status = 'confirmed') {
  return `insert into public.reservations (id, clinic_id, customer_id, menu_id, staff_id, start_time, end_time, status, price)
values ('${id(suffix)}', '${CLINIC}', '${id(customerSuffix)}', '${MENU}', '${RESOURCE}',
        '${day} 01:00:00+00', '${day} 02:00:00+00', '${status}', ${price});\n`;
}

function customer(suffix) {
  return `insert into public.customers (id, clinic_id, name, phone)
values ('${id(suffix)}', '${CLINIC}', 'OS-F1 race customer ${suffix}', '000-0000-0000');\n`;
}

// The write is caught so the session reports the outcome as a NOTICE.
function attempt(label, statement) {
  return `
do $attempt$
begin
  ${statement};
  raise notice '${label} ok';
exception when others then
  raise notice '${label} error sqlstate=% message=%', sqlstate, sqlerrm;
end
$attempt$;
`;
}

function assertCaches(label, expected) {
  const checks = Object.entries(expected)
    .map(
      ([customerSuffix, cache]) => `
  select concat_ws('|', coalesce(total_visits::text, 'null'), coalesce(total_revenue::text, 'null'),
         coalesce(to_char(last_visit_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'null'))
  into v_cache from public.customers where id = '${id(customerSuffix)}';
  if v_cache is distinct from '${cache}' then
    raise exception '${label} cache mismatch for ${customerSuffix}: have % want ${cache}', v_cache;
  end if;
  raise notice '${label} final ${customerSuffix}=%', v_cache;`
    )
    .join('\n');
  return `
do $assert$
declare v_cache text;
begin
${checks}
end
$assert$;
`;
}

const FIXTURE_SQL = `
insert into public.clinics (id, name) values ('${CLINIC}', 'OS-F1 race clinic');
insert into public.staff (id, clinic_id, name, role, email, password_hash)
values ('${USER}', '${CLINIC}', 'OS-F1 race user', 'staff', 'os-f1-race@example.invalid', 'not-used');
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud, role)
values ('${USER}', 'os-f1-race@example.invalid', 'not-used', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), 'authenticated', 'authenticated');
insert into public.profiles (user_id, clinic_id, email, full_name, role, is_active)
values ('${USER}', '${CLINIC}', 'os-f1-race@example.invalid', 'OS-F1 race user', 'staff', true);
insert into public.user_permissions (staff_id, username, hashed_password, role, clinic_id)
values ('${USER}', 'os-f1-race-user', 'not-used', 'staff', '${CLINIC}');
insert into public.menus (id, clinic_id, name, price, duration_minutes)
values ('${MENU}', '${CLINIC}', 'OS-F1 race menu', 1000, 60);
insert into public.resources (id, clinic_id, name, type)
values ('${RESOURCE}', '${CLINIC}', 'OS-F1 race staff', 'staff');
`;

// The reservation history trigger rejects physical reservation deletes, so
// it is paused inside this cleanup transaction only (fixture rows of this
// script; history rows go with their reservations by FK cascade).
const CLEANUP_SQL = `
begin;
delete from public.daily_report_items where clinic_id = '${CLINIC}';
delete from public.daily_reports where clinic_id = '${CLINIC}';
alter table public.reservations disable trigger reservation_deleted_log;
delete from public.reservations where clinic_id = '${CLINIC}';
alter table public.reservations enable trigger reservation_deleted_log;
delete from public.customers where clinic_id = '${CLINIC}';
delete from public.resources where clinic_id = '${CLINIC}';
delete from public.menus where clinic_id = '${CLINIC}';
delete from public.user_permissions where staff_id = '${USER}';
delete from public.profiles where user_id = '${USER}';
delete from public.staff where id = '${USER}';
delete from auth.users where id = '${USER}';
delete from public.clinics where id = '${CLINIC}';
commit;
`;

const RACES = [
  {
    name: 'R1 two completions of one customer (RLS writer waits for the service writer)',
    mode: 'blocking',
    setup:
      customer('000000000101') +
      reservation('000000001011', '000000000101', '2097-01-01', 1000) +
      reservation('000000001012', '000000000101', '2097-01-02', 2000),
    holder: `${SERVICE}begin;\nupdate public.reservations set status = 'completed' where id = '${id('000000001011')}';\n`,
    waiter: `${AUTH}${attempt('WAITER', `update public.reservations set status = 'completed' where id = '${id('000000001012')}'`)}`,
    expectNotices: [/^WAITER ok$/],
    expected: { '000000000101': '2|3000.00|2097-01-02T02:00:00Z' },
  },
  {
    name: 'R2 newer visit completed first, older visit completed concurrently',
    mode: 'blocking',
    setup:
      customer('000000000102') +
      reservation('000000001021', '000000000102', '2097-03-10', 2000) +
      reservation('000000001022', '000000000102', '2097-02-10', 3000),
    holder: `${SERVICE}begin;\nupdate public.reservations set status = 'completed' where id = '${id('000000001021')}';\n`,
    waiter: `${SERVICE}${attempt('WAITER', `update public.reservations set status = 'completed' where id = '${id('000000001022')}'`)}`,
    expectNotices: [/^WAITER ok$/],
    expected: { '000000000102': '2|5000.00|2097-03-10T02:00:00Z' },
  },
  {
    name: 'R3 cancellation of a completed visit and a concurrent completion',
    mode: 'blocking',
    setup:
      customer('000000000103') +
      reservation(
        '000000001031',
        '000000000103',
        '2097-04-01',
        1000,
        'completed'
      ) +
      reservation('000000001032', '000000000103', '2097-04-02', 2000),
    holder: `${SERVICE}begin;\nupdate public.reservations set status = 'cancelled' where id = '${id('000000001031')}';\n`,
    waiter: `${SERVICE}${attempt('WAITER', `update public.reservations set status = 'completed' where id = '${id('000000001032')}'`)}`,
    expectNotices: [/^WAITER ok$/],
    expected: { '000000000103': '1|2000.00|2097-04-02T02:00:00Z' },
  },
  {
    name: 'R4 completed visit moved to another customer, concurrent completion there',
    mode: 'blocking',
    setup:
      customer('000000000104') +
      customer('000000000105') +
      reservation(
        '000000001041',
        '000000000104',
        '2097-05-01',
        1000,
        'completed'
      ) +
      reservation('000000001051', '000000000105', '2097-05-02', 2000),
    holder: `${SERVICE}begin;\nupdate public.reservations set customer_id = '${id('000000000105')}' where id = '${id('000000001041')}';\n`,
    waiter: `${SERVICE}${attempt('WAITER', `update public.reservations set status = 'completed' where id = '${id('000000001051')}'`)}`,
    expectNotices: [/^WAITER ok$/],
    expected: {
      '000000000104': '0|0.00|null',
      '000000000105': '2|3000.00|2097-05-02T02:00:00Z',
    },
  },
  {
    // Both statements touch both customers; the trigger locks them in id
    // order, so the waiter queues behind the holder instead of deadlocking.
    name: 'R5 two multi-row statements over the same two customers',
    mode: 'blocking',
    setup:
      customer('000000000106') +
      customer('000000000107') +
      reservation('000000001061', '000000000106', '2097-06-01', 1000) +
      reservation('000000001071', '000000000107', '2097-06-02', 2000) +
      reservation('000000001062', '000000000106', '2097-06-03', 3000) +
      reservation('000000001072', '000000000107', '2097-06-04', 4000),
    holder: `${SERVICE}begin;\nupdate public.reservations set status = 'completed' where id in ('${id('000000001061')}', '${id('000000001071')}');\n`,
    waiter: `${SERVICE}${attempt('WAITER', `update public.reservations set status = 'completed' where id in ('${id('000000001072')}', '${id('000000001062')}')`)}`,
    expectNotices: [/^WAITER ok$/],
    expected: {
      '000000000106': '2|4000.00|2097-06-03T02:00:00Z',
      '000000000107': '2|6000.00|2097-06-04T02:00:00Z',
    },
  },
  {
    // The holder reschedules a counted visit without changing the totals (a
    // later visit dominates), so it never rewrites the customer row. A READ
    // COMMITTED waiter recomputes with a fresh snapshot and sees it.
    name: 'R6 READ COMMITTED writer after a total-neutral concurrent change',
    mode: 'snapshot',
    isolation: 'read committed',
    setup:
      customer('000000000108') +
      reservation(
        '000000001081',
        '000000000108',
        '2097-07-05',
        1000,
        'completed'
      ) +
      reservation(
        '000000001082',
        '000000000108',
        '2097-07-01',
        2000,
        'completed'
      ),
    holder: `${SERVICE}begin;\nupdate public.reservations set start_time = '2097-06-30 01:00:00+00', end_time = '2097-06-30 02:00:00+00' where id = '${id('000000001082')}';\n`,
    waiter: attempt(
      'WAITER',
      `update public.reservations set status = 'cancelled' where id = '${id('000000001081')}'`
    ),
    expectNotices: [/^WAITER ok$/],
    expected: { '000000000108': '1|2000.00|2097-06-30T02:00:00Z' },
  },
  {
    // Same interleaving under REPEATABLE READ: the waiter's snapshot predates
    // the holder's commit, so recomputing from it would cache the old
    // end_time. The rebuild locks the counted rows and fails with 40001.
    name: 'R7 REPEATABLE READ writer with a stale snapshot fails closed',
    mode: 'snapshot',
    isolation: 'repeatable read',
    setup:
      customer('000000000109') +
      reservation(
        '000000001091',
        '000000000109',
        '2097-08-05',
        1000,
        'completed'
      ) +
      reservation(
        '000000001092',
        '000000000109',
        '2097-08-01',
        2000,
        'completed'
      ),
    holder: `${SERVICE}begin;\nupdate public.reservations set start_time = '2097-07-30 01:00:00+00', end_time = '2097-07-30 02:00:00+00' where id = '${id('000000001092')}';\n`,
    waiter: attempt(
      'WAITER',
      `update public.reservations set status = 'cancelled' where id = '${id('000000001091')}'`
    ),
    expectNotices: [/^WAITER error sqlstate=40001 /],
    expected: { '000000000109': '2|3000.00|2097-08-05T02:00:00Z' },
  },
];

async function runBlockingRace(dbUrl, race, index) {
  const holderApp = `os_f1_race_${index}_holder`;
  const waiterApp = `os_f1_race_${index}_waiter`;
  const [holder, waiter] = await Promise.all([
    runSql(
      dbUrl,
      holderApp,
      `${race.holder}${holdUntilBlocked(waiterApp)}commit;\n`
    ),
    runSql(
      dbUrl,
      waiterApp,
      `${waitForActive(holderApp, 'do $hold$')}${race.waiter}`
    ),
  ]);
  const notices = [...holder.notices, ...waiter.notices];
  if (!notices.includes('HOLDER_SAW_WAITER_BLOCKED')) {
    throw new Error(
      `${race.name}: waiter was never observed blocked by the holder`
    );
  }
  return notices;
}

async function runSnapshotRace(dbUrl, race, index) {
  const holderApp = `os_f1_race_${index}_holder`;
  const waiterApp = `os_f1_race_${index}_waiter`;
  // The waiter's first statement fixes its snapshot (REPEATABLE READ) before
  // the holder writes; it writes only after the holder's commit.
  const [holder, waiter] = await Promise.all([
    runSql(
      dbUrl,
      holderApp,
      `select pg_catalog.pg_advisory_lock(${SNAPSHOT_LOCK_CLASS}, ${index});\n${holdUntilBlocked(waiterApp)}${race.holder}commit;\nreset role;\nselect pg_catalog.pg_advisory_unlock(${SNAPSHOT_LOCK_CLASS}, ${index});\n`
    ),
    runSql(
      dbUrl,
      waiterApp,
      `begin isolation level ${race.isolation};\nselect count(*) from public.reservations where customer_id = '${id(Object.keys(race.expected)[0])}';\n${waitForHolderCommit(index)}set local role service_role;\n${race.waiter}commit;\n`
    ),
  ]);
  if (!holder.notices.includes('HOLDER_SAW_WAITER_BLOCKED')) {
    throw new Error(
      `${race.name}: waiter was never observed waiting for the holder commit`
    );
  }
  return [...holder.notices, ...waiter.notices];
}

async function runRace(dbUrl, race, index) {
  if (race.setup) await runSql(dbUrl, `os_f1_race_${index}_setup`, race.setup);
  const notices =
    race.mode === 'snapshot'
      ? await runSnapshotRace(dbUrl, race, index)
      : await runBlockingRace(dbUrl, race, index);
  for (const pattern of race.expectNotices) {
    if (!notices.some(notice => pattern.test(notice))) {
      throw new Error(
        `${race.name}: missing ${String(pattern)}; notices=${JSON.stringify(notices)}`
      );
    }
  }
  const asserted = await runSql(
    dbUrl,
    `os_f1_race_${index}_assert`,
    assertCaches(race.name.split(' ')[0], race.expected)
  );
  return [...notices, ...asserted.notices];
}

async function main() {
  const dbUrl = parseArgs(process.argv.slice(2));
  assertLoopbackDatabaseUrl(dbUrl);
  const ignored = findLibpqTargetOverrides(process.env);
  if (ignored.length > 0) {
    console.error(
      `Not passing ${ignored.join(', ')} to psql: the database URL alone selects the target.`
    );
  }

  let failures = 0;
  try {
    await runSql(dbUrl, 'os_f1_race_cleanup', CLEANUP_SQL);
    await runSql(dbUrl, 'os_f1_race_fixture', FIXTURE_SQL);
    for (const [index, race] of RACES.entries()) {
      try {
        const notices = await runRace(dbUrl, race, index);
        console.log(`PASS ${race.name}`);
        for (const notice of notices) console.log(`  ${notice}`);
      } catch (error) {
        failures += 1;
        console.error(
          `FAIL ${race.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } finally {
    try {
      await runSql(dbUrl, 'os_f1_race_cleanup', CLEANUP_SQL);
    } finally {
      for (const filePath of writtenFiles) unlinkSync(filePath);
      if (tempDirectory) rmdirSync(tempDirectory);
    }
  }

  if (failures > 0) {
    console.error(
      `${String(failures)}/${String(RACES.length)} race checks failed`
    );
    process.exit(1);
  }
  console.log(
    `${String(RACES.length)}/${String(RACES.length)} race checks passed`
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
