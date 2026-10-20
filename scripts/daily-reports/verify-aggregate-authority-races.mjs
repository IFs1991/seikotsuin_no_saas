#!/usr/bin/env node
/**
 * OS-F2 (#146) daily report aggregate authority: real-DB race verification.
 *
 * Each race runs two psql sessions against a disposable LOCAL database. The
 * holder writes inside an open transaction and keeps it open until
 * pg_blocking_pids() proves the waiter is blocked by it, then commits. The
 * final state is asserted in the database. Only loopback hosts are accepted.
 *
 * Usage: node scripts/daily-reports/verify-aggregate-authority-races.mjs
 *          [--db-url postgresql://postgres:postgres@127.0.0.1:54332/postgres]
 * Spec: docs/stabilization/spec-os-daily-report-aggregate-authority-v0.1.md §6
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_DB_URL =
  'postgresql://postgres:postgres@127.0.0.1:54332/postgres';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const PREFIX = 'f1469000-0000-4000-8000-';
const id = suffix => `${PREFIX}${suffix}`;

const CLINIC = id('000000000001');
const USER = id('000000000010');
const CLAIMS = JSON.stringify({
  sub: USER,
  role: 'authenticated',
  app_metadata: { user_role: 'staff', clinic_scope_ids: [CLINIC] },
});

function parseArgs(argv) {
  if (argv.length === 0) return DEFAULT_DB_URL;
  if (argv.length === 2 && argv[0] === '--db-url' && argv[1]) return argv[1];
  throw new Error(
    'Usage: verify-aggregate-authority-races.mjs [--db-url <url>]'
  );
}

function assertLoopback(dbUrl) {
  const parsed = new URL(dbUrl);
  // libpq honours host/hostaddr/service in the query string over the URL host.
  if (parsed.search !== '' || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Refusing database URL "${parsed.hostname}${parsed.search}": only a loopback host without query parameters is accepted. This verifier writes fixtures and must only target a disposable local database.`
    );
  }
}

const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'os-f2-races-'));
const writtenFiles = [];
let fileCounter = 0;

function runSql(dbUrl, applicationName, sql) {
  fileCounter += 1;
  const filePath = path.join(tempDirectory, `${fileCounter}.sql`);
  writeFileSync(filePath, sql, 'utf8');
  writtenFiles.push(filePath);

  return new Promise((resolve, reject) => {
    const child = spawn(
      'psql',
      [
        '--dbname',
        dbUrl,
        '--no-psqlrc',
        '--set',
        'ON_ERROR_STOP=1',
        '--file',
        filePath,
      ],
      {
        env: {
          ...process.env,
          PGAPPNAME: applicationName,
          PGCONNECT_TIMEOUT: '10',
        },
        shell: false,
        windowsHide: true,
      }
    );
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
      raise exception 'OS-F2 hold timed out waiting for ${waiterApp} to block';
    end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
  raise notice 'HOLDER_SAW_WAITER_BLOCKED';
end
$hold$;
`;
}

function waitForHolder(holderApp) {
  return `
do $wait$
declare
  deadline timestamptz := pg_catalog.clock_timestamp() + interval '30 seconds';
begin
  loop
    perform pg_catalog.pg_stat_clear_snapshot();
    exit when exists (
      select 1 from pg_catalog.pg_stat_activity
      where application_name = '${holderApp}' and state = 'active'
        and pg_catalog.strpos(query, 'do $hold$') > 0
    );
    if pg_catalog.clock_timestamp() >= deadline then
      raise exception 'OS-F2 barrier timed out waiting for ${holderApp}';
    end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
end
$wait$;
`;
}

function saveCall(label, args) {
  const named = Object.entries({
    p_clinic_id: `'${CLINIC}'`,
    p_report_date: `'${args.date}'`,
    p_total_patients: args.totalPatients,
    p_new_patients: args.newPatients,
    p_total_revenue: args.totalRevenue,
    p_insurance_revenue: 0,
    p_private_revenue: args.totalRevenue,
    ...(args.reportId ? { p_report_id: `'${args.reportId}'` } : {}),
  })
    .map(([key, value]) => `${key} => ${String(value)}`)
    .join(', ');
  return `
do $call$
declare v public.daily_reports;
begin
  select * into v from public.save_daily_report(${named});
  raise notice '${label} ok total_patients=% new_patients=% total_revenue=% source=%',
    v.total_patients, v.new_patients, v.total_revenue, v.aggregate_source;
exception when others then
  raise notice '${label} error sqlstate=% message=%', sqlstate, sqlerrm;
end
$call$;
`;
}

function insertItem(itemId, date, fee, reportExpr) {
  return `insert into public.daily_report_items (
  id, clinic_id, daily_report_id, report_date, patient_name, treatment_name,
  fee, billing_type, revenue_context_code
) values ('${itemId}', '${CLINIC}', ${reportExpr}, '${date}', 'Synthetic race', 'Race fixture', ${fee}, 'private', 'private');\n`;
}

function insertReport(reportId, date, extra = '') {
  return `insert into public.daily_reports (id, clinic_id, report_date, total_patients, new_patients, total_revenue, insurance_revenue, private_revenue, report_text)
values ('${reportId}', '${CLINIC}', '${date}', 10, 0, 10000, 0, 10000, 'race fixture');\n${extra}`;
}

function assertReport(label, date, expected) {
  return `
do $assert$
declare v public.daily_reports; v_count integer;
begin
  select count(*) into v_count from public.daily_reports
  where clinic_id = '${CLINIC}' and report_date = '${date}';
  select * into v from public.daily_reports
  where clinic_id = '${CLINIC}' and report_date = '${date}';
  if v_count <> 1
     or v.aggregate_source is distinct from '${expected.source}'
     or v.total_patients is distinct from ${expected.totalPatients}
     or v.total_revenue is distinct from ${expected.totalRevenue}::numeric
     or v.new_patients is distinct from ${expected.newPatients} then
    raise exception '${label} final state mismatch: rows=% source=% total_patients=% total_revenue=% new_patients=%',
      v_count, v.aggregate_source, v.total_patients, v.total_revenue, v.new_patients;
  end if;
  raise notice '${label} final rows=1 source=% total_patients=% total_revenue=% new_patients=%',
    v.aggregate_source, v.total_patients, v.total_revenue, v.new_patients;
end
$assert$;
`;
}

const FIXTURE_SQL = `
insert into public.clinics (id, name) values ('${CLINIC}', 'OS-F2 race clinic');
insert into public.staff (id, clinic_id, name, role, email, password_hash)
values ('${USER}', '${CLINIC}', 'OS-F2 race user', 'staff', 'os-f2-race@example.invalid', 'not-used');
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud, role)
values ('${USER}', 'os-f2-race@example.invalid', 'not-used', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), 'authenticated', 'authenticated');
insert into public.profiles (user_id, clinic_id, email, full_name, role, is_active)
values ('${USER}', '${CLINIC}', 'os-f2-race@example.invalid', 'OS-F2 race user', 'staff', true);
insert into public.user_permissions (staff_id, username, hashed_password, role, clinic_id)
values ('${USER}', 'os-f2-race-user', 'not-used', 'staff', '${CLINIC}');
`;

const CLEANUP_SQL = `
delete from public.daily_report_items where clinic_id = '${CLINIC}';
delete from public.daily_reports where clinic_id = '${CLINIC}';
delete from public.user_permissions where staff_id = '${USER}';
delete from public.profiles where user_id = '${USER}';
delete from public.staff where id = '${USER}';
delete from auth.users where id = '${USER}';
delete from public.clinics where id = '${CLINIC}';
`;

const RACES = [
  {
    name: 'R1 manual decision, then first detail row INSERT',
    date: '2096-02-01',
    setup: insertReport(id('000000000101'), '2096-02-01'),
    holder: `${AUTH}begin;\n${saveCall('HOLDER', { date: '2096-02-01', reportId: id('000000000101'), totalPatients: 10, newPatients: 1, totalRevenue: 10000 })}`,
    waiter: `${SERVICE}${insertItem(id('000000000201'), '2096-02-01', 3000, `'${id('000000000101')}'`)}`,
    expectNotices: [/HOLDER ok .*source=manual/],
    expected: {
      source: 'items',
      totalPatients: 1,
      totalRevenue: 3000,
      newPatients: 1,
    },
  },
  {
    name: 'R1r first detail row INSERT, then stale save',
    date: '2096-02-02',
    setup: insertReport(id('000000000102'), '2096-02-02'),
    holder: `${SERVICE}begin;\n${insertItem(id('000000000202'), '2096-02-02', 2500, `'${id('000000000102')}'`)}`,
    waiter: `${AUTH}${saveCall('WAITER', { date: '2096-02-02', reportId: id('000000000102'), totalPatients: 10, newPatients: 0, totalRevenue: 10000 })}`,
    expectNotices: [
      /WAITER ok total_patients=1 new_patients=0 total_revenue=2500\.00 source=items/,
    ],
    expected: {
      source: 'items',
      totalPatients: 1,
      totalRevenue: 2500,
      newPatients: 0,
    },
  },
  {
    name: 'R2a last detail row DELETE, then stale save',
    date: '2096-02-03',
    setup:
      insertReport(id('000000000103'), '2096-02-03') +
      insertItem(
        id('000000000203'),
        '2096-02-03',
        4000,
        `'${id('000000000103')}'`
      ) +
      `update public.daily_reports set new_patients = 1 where id = '${id('000000000103')}';\n`,
    holder: `${SERVICE}begin;\ndelete from public.daily_report_items where id = '${id('000000000203')}';\n`,
    waiter: `${AUTH}${saveCall('WAITER', { date: '2096-02-03', reportId: id('000000000103'), totalPatients: 1, newPatients: 1, totalRevenue: 4000 })}`,
    expectNotices: [
      /WAITER error sqlstate=23514 message=DAILY_REPORT_NEW_PATIENTS_EXCEEDS_DERIVED_TOTAL/,
    ],
    expected: {
      source: 'items',
      totalPatients: 0,
      totalRevenue: 0,
      newPatients: 1,
    },
  },
  {
    name: 'R2b stale save, then last detail row DELETE',
    date: '2096-02-04',
    setup:
      insertReport(id('000000000104'), '2096-02-04') +
      insertItem(
        id('000000000204'),
        '2096-02-04',
        4000,
        `'${id('000000000104')}'`
      ),
    holder: `${AUTH}begin;\n${saveCall('HOLDER', { date: '2096-02-04', reportId: id('000000000104'), totalPatients: 5, newPatients: 1, totalRevenue: 9999 })}`,
    waiter: `${SERVICE}delete from public.daily_report_items where id = '${id('000000000204')}';\n`,
    expectNotices: [
      /HOLDER ok total_patients=1 new_patients=1 total_revenue=4000\.00 source=items/,
    ],
    expected: {
      source: 'items',
      totalPatients: 0,
      totalRevenue: 0,
      newPatients: 1,
    },
  },
  {
    name: 'R3a same-day first creation: save x save',
    date: '2096-02-05',
    setup: '',
    holder: `${AUTH}begin;\n${saveCall('HOLDER', { date: '2096-02-05', totalPatients: 3, newPatients: 1, totalRevenue: 3000 })}`,
    waiter: `${AUTH}${saveCall('WAITER', { date: '2096-02-05', totalPatients: 4, newPatients: 2, totalRevenue: 4000 })}`,
    expectNotices: [
      /HOLDER ok .*source=manual/,
      /WAITER ok total_patients=4 new_patients=2 total_revenue=4000\.00 source=manual/,
    ],
    expected: {
      source: 'manual',
      totalPatients: 4,
      totalRevenue: 4000,
      newPatients: 2,
    },
  },
  {
    name: 'R3b same-day first creation: save x detail API parent',
    date: '2096-02-06',
    setup: '',
    holder: `${AUTH}begin;\n${saveCall('HOLDER', { date: '2096-02-06', totalPatients: 9, newPatients: 0, totalRevenue: 9000 })}`,
    waiter: `${SERVICE}
do $ensure$
begin
  insert into public.daily_reports (clinic_id, report_date, total_patients, new_patients, total_revenue, insurance_revenue, private_revenue, report_text)
  values ('${CLINIC}', '2096-02-06', 0, 0, 0, 0, 0, '明細行から自動作成');
  raise notice 'ENSURE inserted';
exception when unique_violation then
  raise notice 'ENSURE conflict';
end
$ensure$;
${insertItem(id('000000000206'), '2096-02-06', 1200, `(select id from public.daily_reports where clinic_id = '${CLINIC}' and report_date = '2096-02-06')`)}`,
    expectNotices: [/HOLDER ok .*source=manual/, /ENSURE conflict/],
    expected: {
      source: 'items',
      totalPatients: 1,
      totalRevenue: 1200,
      newPatients: 0,
    },
  },
  {
    name: 'R4 concurrent detail row INSERTs (no lost update)',
    date: '2096-02-07',
    setup: `insert into public.daily_reports (id, clinic_id, report_date) values ('${id('000000000107')}', '${CLINIC}', '2096-02-07');\n`,
    holder: `${SERVICE}begin;\n${insertItem(id('000000000207'), '2096-02-07', 1000, `'${id('000000000107')}'`)}`,
    waiter: `${SERVICE}${insertItem(id('000000000208'), '2096-02-07', 2000, `'${id('000000000107')}'`)}`,
    expectNotices: [],
    expected: {
      source: 'items',
      totalPatients: 2,
      totalRevenue: 3000,
      newPatients: 0,
    },
  },
];

async function runRace(dbUrl, race, index) {
  const holderApp = `os_f2_race_${index}_holder`;
  const waiterApp = `os_f2_race_${index}_waiter`;
  if (race.setup) await runSql(dbUrl, `os_f2_race_${index}_setup`, race.setup);

  const [holder, waiter] = await Promise.all([
    runSql(
      dbUrl,
      holderApp,
      `${race.holder}${holdUntilBlocked(waiterApp)}commit;\n`
    ),
    runSql(dbUrl, waiterApp, `${waitForHolder(holderApp)}${race.waiter}`),
  ]);
  const notices = [...holder.notices, ...waiter.notices];
  if (!notices.includes('HOLDER_SAW_WAITER_BLOCKED')) {
    throw new Error(
      `${race.name}: waiter was never observed blocked by the holder`
    );
  }
  for (const pattern of race.expectNotices) {
    if (!notices.some(notice => pattern.test(notice))) {
      throw new Error(
        `${race.name}: missing ${String(pattern)}; notices=${JSON.stringify(notices)}`
      );
    }
  }
  const asserted = await runSql(
    dbUrl,
    `os_f2_race_${index}_assert`,
    assertReport(race.name.split(' ')[0], race.date, race.expected)
  );
  return [...notices, ...asserted.notices];
}

async function main() {
  const dbUrl = parseArgs(process.argv.slice(2));
  assertLoopback(dbUrl);

  let failures = 0;
  try {
    await runSql(dbUrl, 'os_f2_race_cleanup', CLEANUP_SQL);
    await runSql(dbUrl, 'os_f2_race_fixture', FIXTURE_SQL);
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
      await runSql(dbUrl, 'os_f2_race_cleanup', CLEANUP_SQL);
    } finally {
      for (const filePath of writtenFiles) unlinkSync(filePath);
      rmdirSync(tempDirectory);
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
