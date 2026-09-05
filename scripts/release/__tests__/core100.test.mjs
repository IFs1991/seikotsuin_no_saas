import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  batches,
  clinicCompany,
  clinicId,
  completedPerDay,
  createManifest,
  createProfile,
  currentJstDate,
  dateAt,
  expectedCounts,
  fixtureId,
  reportFixture,
  reservationFixture,
  rootId,
  tableRows,
  userFixtures,
} from '../core100-profile.mjs';
import {
  assertExecutionAllowed,
  originOf,
  outputPaths,
  parseArguments,
  resolveTarget,
  restrictedFetch,
  saveJson,
} from '../core100-safety.mjs';
import {
  assertAggregate,
  assertDailyReport,
  assertReservation,
  evaluateApplicationSlo,
  operationFor,
  percentile,
  reservationInput,
  reservationPageCursor,
  runLoad,
  selectLoadUsers,
  summarizeMetrics,
  unwrapResponse,
} from '../core100-load.mjs';
import { assertDedicatedDatabase, seedDatabase } from '../core100-seed.mjs';
import { compareReportTotals, verifyData } from '../core100-verify.mjs';

const config = () => ({
  runId: 'core100-test-a',
  distribution: 'A',
  asOfDate: '2026-09-05',
  scale: 'smoke',
  targetId: 'local-test',
  approvedTargets: [
    {
      id: 'local-test',
      environment: 'local',
      appOrigin: 'http://127.0.0.1:3000',
      supabaseOrigin: 'http://127.0.0.1:54331',
      projectRef: 'local',
      dedicated: true,
      externalDeliveryBlocked: true,
    },
  ],
  productionAppOrigins: [],
  productionSupabaseOrigins: [],
  productionProjectRefs: [],
});
const profile = () => createProfile(config());
const target = () => resolveTarget(config());

test('standard profile freezes 10 roots, 100 operational clinics, 500 users, 100k customers and 1.5m reservations', () => {
  const standard = createProfile({ ...config(), scale: 'standard' });
  assert.equal(expectedCounts(standard).clinics, 110);
  assert.equal(expectedCounts(standard).authUsers, 500);
  assert.equal(expectedCounts(standard).customers, 100000);
  assert.equal(expectedCounts(standard).reservations, 1500000);
  assert.equal(expectedCounts(standard).daily_reports, 30000);
  assert.deepEqual(
    standard.phases.map(phase => [phase.vus, phase.seconds]),
    [
      [200, 300],
      [200, 1800],
      [400, 300],
      [200, 300],
    ]
  );
  assert.equal(standard.thinkMs, 10000);
});

test('A and B preserve clinic ordinals and data while changing only company allocation in separate run IDs', () => {
  const a = profile();
  const b = createProfile({
    ...config(),
    runId: 'core100-test-b',
    distribution: 'B',
  });
  assert.deepEqual(
    Array.from(
      { length: 10 },
      (_, company) =>
        Array.from({ length: 100 }, (_, clinic) => clinic).filter(
          clinic => clinicCompany(b, clinic) === company
        ).length
    ),
    [50, 6, 6, 6, 6, 6, 5, 5, 5, 5]
  );
  assert.equal(clinicCompany(a, 49), 4);
  assert.equal(clinicCompany(b, 49), 0);
  assert.notEqual(clinicId(a, 49), clinicId(b, 49));
  const r1 = reservationFixture(a, 49, 0, 1);
  const r2 = reservationFixture(b, 49, 0, 1);
  assert.equal(r1.start_time, r2.start_time);
  assert.equal(r1.price, r2.price);
  assert.equal(expectedCounts(a).totalRevenue, expectedCounts(b).totalRevenue);
});

test('IDs are deterministic, distinct by table and valid UUIDs', () => {
  const id = fixtureId('core100-test-a', 'customers', 123);
  assert.equal(id, fixtureId('core100-test-a', 'customers', 123));
  assert.match(
    id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
  assert.notEqual(id, fixtureId('core100-test-a', 'resources', 123));
  assert.notEqual(id, fixtureId('core100-test-b', 'customers', 123));
});

test('date arithmetic preserves JST month boundaries and rejects invalid dates and arbitrary scales', () => {
  assert.equal(dateAt('2026-03-01', -1), '2026-02-28');
  assert.equal(dateAt('2024-03-01', -1), '2024-02-29');
  assert.throws(
    () => createProfile({ ...config(), asOfDate: '2026-02-30' }),
    /INVALID_AS_OF_DATE/
  );
  assert.throws(
    () => createProfile({ ...config(), scale: 'tiny-but-call-it-standard' }),
    /INVALID_SCALE/
  );
});

test('fixture references stay in their operational clinic and resource slots never overlap', () => {
  const p = profile();
  const menus = new Map([...tableRows(p, 'menus')].map(row => [row.id, row]));
  const resources = new Map(
    [...tableRows(p, 'resources')].map(row => [row.id, row])
  );
  const customers = new Map(
    [...tableRows(p, 'customers')].map(row => [row.id, row])
  );
  const previousEnd = new Map();
  for (const row of tableRows(p, 'reservations')) {
    assert.equal(customers.get(row.customer_id).clinic_id, row.clinic_id);
    assert.equal(menus.get(row.menu_id).clinic_id, row.clinic_id);
    assert.equal(resources.get(row.staff_id).clinic_id, row.clinic_id);
    assert.ok(
      Date.parse(row.start_time) >= (previousEnd.get(row.staff_id) ?? 0)
    );
    previousEnd.set(row.staff_id, Date.parse(row.end_time));
  }
});

test('customer fixtures contain no reachable notification recipients or consents', () => {
  for (const customer of tableRows(profile(), 'customers')) {
    assert.equal(customer.email, null);
    assert.equal(customer.line_user_id, null);
    assert.equal(customer.consent_reminder, false);
    assert.equal(customer.consent_marketing, false);
  }
  assert.ok(
    userFixtures(profile()).every(user =>
      user.email.endsWith('@example.invalid')
    )
  );
});

test('normal users keep role permissions and negative fixtures remain excluded', () => {
  const users = userFixtures(profile());
  assert.equal(users.filter(user => user.role === 'admin').length, 10);
  assert.equal(users.filter(user => user.role === 'manager').length, 40);
  assert.equal(users.filter(user => user.role === 'staff').length, 450);
  for (const vus of [20, 200, 400]) {
    const selected = selectLoadUsers(profile(), vus);
    assert.equal(selected.length, vus);
    assert.equal(new Set(selected.map(user => user.id)).size, vus);
    assert.ok(selected.every(user => user.active && !user.assignmentsRevoked));
    assert.equal(
      selected.filter(user => user.role !== 'staff').length,
      vus / 10
    );
    assert.ok(
      selected
        .filter(user => user.role === 'manager')
        .every(user =>
          Array.from({ length: 90 }, (_, i) => operationFor(user, i)).every(
            operation => operation === 'aggregate'
          )
        )
    );
  }
});

test('business operation schedule preserves 45/25/15/5/10 allocation without granting manager writes', () => {
  const selected = selectLoadUsers(profile(), 200);
  const totals = new Map();
  for (const user of selected)
    for (let i = 0; i < 90; i++) {
      const operation = operationFor(user, i);
      totals.set(operation, (totals.get(operation) ?? 0) + 1);
    }
  assert.deepEqual(Object.fromEntries(totals), {
    aggregate: 1800,
    reservations_read: 8100,
    customer_search: 4500,
    reservation_write: 2700,
    daily_report: 900,
  });
});

test('load write slots isolate users, reserve change space and reject manager inputs', () => {
  const p = profile();
  const writers = userFixtures(p).filter(user => user.role === 'staff');
  const slots = new Set();
  for (const user of writers)
    for (let sequence = 0; sequence < 25; sequence++) {
      const input = reservationInput(p, user, sequence, 'test-load');
      const key = `${input.staffId}:${input.startTime}`;
      assert.ok(!slots.has(key));
      slots.add(key);
      assert.ok(
        Date.parse(input.startTime) > Date.parse(`${p.asOfDate}T23:59:59+09:00`)
      );
      assert.equal(
        Date.parse(input.endTime) - Date.parse(input.startTime),
        1800000
      );
    }
  assert.throws(
    () => reservationInput(p, userFixtures(p)[10], 0, 'test'),
    /WRITER_MUST_BE_CLINIC_STAFF/
  );
});

test('execution refuses missing approval, wrong target, production, ambient mismatch and missing delivery isolation', () => {
  const t = target();
  assert.throws(() => assertExecutionAllowed(t, {}, {}), /APPROVAL/);
  assert.throws(
    () =>
      assertExecutionAllowed(
        t,
        { execute: true, approvedTarget: 'different' },
        {}
      ),
    /APPROVAL/
  );
  assert.throws(
    () =>
      assertExecutionAllowed(
        t,
        { execute: true, approvedTarget: t.id },
        { VERCEL_ENV: 'production' }
      ),
    /PRODUCTION/
  );
  assert.throws(
    () =>
      assertExecutionAllowed(
        t,
        { execute: true, approvedTarget: t.id },
        { NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' }
      ),
    /MISMATCH/
  );
  assert.throws(
    () =>
      assertExecutionAllowed(
        { ...t, externalDeliveryBlocked: false },
        { execute: true, approvedTarget: t.id },
        {}
      ),
    /ISOLATED/
  );
  assert.doesNotThrow(() =>
    assertExecutionAllowed(t, { execute: true, approvedTarget: t.id }, {})
  );
});

test('allowlist resolves exact origins/project refs and refuses production refs even when labelled staging', () => {
  const remote = {
    ...config(),
    approvedTargets: [
      {
        id: 'local-test',
        environment: 'staging',
        appOrigin: 'https://stage.example.test',
        supabaseOrigin: 'https://abcdefghijklmnopqrst.supabase.co',
        projectRef: 'abcdefghijklmnopqrst',
        dedicated: true,
        externalDeliveryBlocked: true,
      },
    ],
    productionAppOrigins: ['https://prod.example.test'],
    productionSupabaseOrigins: ['https://zyxwvutsrqponmlkjihg.supabase.co'],
    productionProjectRefs: ['zyxwvutsrqponmlkjihg'],
  };
  assert.equal(resolveTarget(remote).projectRef, 'abcdefghijklmnopqrst');
  assert.throws(
    () =>
      resolveTarget({
        ...remote,
        productionProjectRefs: ['abcdefghijklmnopqrst'],
      }),
    /PRODUCTION/
  );
  assert.throws(
    () => resolveTarget({ ...remote, productionAppOrigins: [] }),
    /IDENTIFIED/
  );
  assert.throws(
    () =>
      resolveTarget({
        ...remote,
        approvedTargets: [
          { ...remote.approvedTargets[0], projectRef: 'other' },
        ],
      }),
    /MISMATCH/
  );
  assert.throws(
    () =>
      resolveTarget({
        ...config(),
        approvedTargets: [
          { ...config().approvedTargets[0], environment: 'production' },
        ],
      }),
    /PRODUCTION/
  );
  assert.throws(
    () => originOf('https://secret:password@example.test/'),
    /CREDENTIALS/
  );
  assert.throws(() => originOf('https://example.test/?token=secret'), /QUERY/);
});

test('outbound fetch refuses cross-origin before invoking transport and disables redirect following', async () => {
  let calls = 0;
  const safe = restrictedFetch(
    'https://stage.example.test',
    async (_input, init) => {
      calls++;
      assert.equal(init.redirect, 'error');
      return new Response('{}');
    }
  );
  await assert.rejects(() => safe('https://prod.example.test/'), /MISMATCH/);
  assert.equal(calls, 0);
  await safe('https://stage.example.test/api/health');
  assert.equal(calls, 1);
});

test('CLI plan and default seed dry-run work without installed SDK, credentials or a network transport', () => {
  const entry = fileURLToPath(new URL('../core100.mjs', import.meta.url));
  const example = fileURLToPath(
    new URL('../core100.example.json', import.meta.url)
  );
  for (const command of ['plan', 'seed']) {
    const result = spawnSync(
      process.execPath,
      [entry, command, '--config', example],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.mode, 'OFFLINE_DRY_RUN');
    assert.equal(plan.expected.reservations, 1500000);
    assert.equal(plan.target.dedicated, false);
  }
  assert.throws(
    () => parseArguments(['load', '--config', example, '--production']),
    /ARGUMENT/
  );
});

test('HTTP 200 business failure and 402/429 are failures, and endpoint latency is not diluted', () => {
  assert.throws(
    () => unwrapResponse(200, { success: false, error: 'business failure' }),
    /BUSINESS/
  );
  assert.throws(
    () => unwrapResponse(402, { success: true, data: {} }),
    /BUSINESS/
  );
  assert.throws(
    () => unwrapResponse(429, { success: true, data: {} }),
    /BUSINESS/
  );
  const events = Array.from({ length: 1000 }, () => ({
    phase: 'normal',
    endpoint: 'GET /api/customers',
    kind: 'read',
    status: 200,
    ok: true,
    latencyMs: 10,
  }));
  events.push({
    phase: 'normal',
    endpoint: 'GET /api/manager/dashboard',
    kind: 'aggregate',
    status: 200,
    ok: true,
    latencyMs: 6000,
  });
  const metrics = summarizeMetrics(events, profile());
  assert.equal(metrics.find(row => row.kind === 'aggregate').pass, false);
  assert.equal(percentile([10, 20, 30], 0.95), 30);
});

test('burst rate control is separate from unexpected normal failures', () => {
  const metrics = summarizeMetrics(
    ['normal', 'burst'].map(phase => ({
      phase,
      endpoint: 'POST /api/reservations',
      kind: 'write',
      status: 429,
      ok: false,
      latencyMs: 1,
    })),
    profile()
  );
  assert.equal(metrics.find(row => row.phase === 'normal').unexpectedErrors, 1);
  assert.equal(metrics.find(row => row.phase === 'burst').unexpectedErrors, 0);
  assert.equal(
    metrics.find(row => row.phase === 'burst').controlledRejections,
    1
  );
});

test('normal SLO fails for untracked operation errors and truncated list integrity even when HTTP metrics pass', () => {
  const metrics = ['normal', 'recovery'].flatMap(phase =>
    ['read', 'write', 'aggregate'].map(kind => ({ phase, kind, pass: true }))
  );
  const recovered = metrics.filter(metric => metric.phase === 'recovery');
  assert.equal(evaluateApplicationSlo(metrics, recovered, [], []).pass, true);
  const localFailure = [
    {
      phase: 'normal',
      operation: 'reservation_write',
      requestFailure: false,
      code: 'OPERATION_FAILED',
    },
  ];
  assert.equal(
    evaluateApplicationSlo(metrics, recovered, [], localFailure).pass,
    false
  );
  assert.equal(
    evaluateApplicationSlo(
      metrics,
      recovered,
      [
        {
          phase: 'normal',
          ok: false,
          reason: 'RESERVATION_LIST_COUNT_MISMATCH',
        },
      ],
      []
    ).pass,
    false
  );
});

test('readback validates reservation identity, scope, time and status', () => {
  const expected = reservationInput(
    profile(),
    userFixtures(profile())[50],
    0,
    'test-load'
  );
  const actual = {
    ...expected,
    id: fixtureId('core100-test-a', 'load', 1),
    status: 'confirmed',
  };
  assert.doesNotThrow(() =>
    assertReservation(actual, { ...expected, status: 'confirmed' })
  );
  assert.throws(
    () =>
      assertReservation(
        { ...actual, customerId: fixtureId('other', 'customers', 1) },
        expected
      ),
    /SCOPE/
  );
  assert.throws(
    () =>
      assertReservation(
        { ...actual, status: 'cancelled' },
        { ...expected, status: 'confirmed' }
      ),
    /STATUS/
  );
});

test('aggregate checks reject missing clinics, cross-company results and wrong revenue even on HTTP 200', () => {
  const p = profile();
  const user = userFixtures(p)[10];
  const count = completedPerDay(p);
  const data = {
    clinicCards: user.scopedClinicIndexes.map(index => ({
      clinicId: clinicId(p, index),
      todayRevenue: count * p.fee,
    })),
    summary: { todayRevenue: count * p.fee * 10, todayVisitCount: count * 10 },
  };
  assert.doesNotThrow(() => assertAggregate(data, p, user));
  assert.throws(
    () =>
      assertAggregate(
        { ...data, clinicCards: data.clinicCards.slice(1) },
        p,
        user
      ),
    /COUNT/
  );
  assert.throws(
    () =>
      assertAggregate(
        {
          ...data,
          clinicCards: data.clinicCards.map((row, i) =>
            i === 0 ? { ...row, clinicId: clinicId(p, 99) } : row
          ),
        },
        p,
        user
      ),
    /TENANT/
  );
  assert.throws(
    () =>
      assertAggregate(
        { ...data, summary: { ...data.summary, todayRevenue: 1 } },
        p,
        user
      ),
    /SUMMARY/
  );
});

test('report verification uses independent counts and totals rather than merely HTTP success', () => {
  const p = profile();
  const count = completedPerDay(p);
  const reports = Array.from({ length: p.operatingDays }, (_, day) => ({
    ...reportFixture(p, 0, day),
    total_patients: count,
    total_revenue: count * p.fee,
    private_revenue: count * p.fee,
  }));
  assert.equal(
    compareReportTotals(reports, p, 0),
    p.operatingDays * count * p.fee
  );
  assert.throws(
    () =>
      compareReportTotals(
        reports.map((row, i) => (i ? row : { ...row, total_revenue: 0 })),
        p,
        0
      ),
    /TOTAL/
  );
  assert.throws(() => compareReportTotals(reports.slice(1), p, 0), /COUNT/);
});

test('daily report POST and GET validate their different existing response contracts', () => {
  const expected = {
    id: fixtureId('test', 'daily_reports', 1),
    clinicId: fixtureId('test', 'clinics', 1),
    reportDate: '2026-09-05',
    revenue: 6000,
    patients: 1,
  };
  assert.doesNotThrow(() =>
    assertDailyReport(
      {
        id: expected.id,
        clinic_id: expected.clinicId,
        report_date: expected.reportDate,
        total_revenue: 6000,
        total_patients: 1,
      },
      expected
    )
  );
  assert.doesNotThrow(() =>
    assertDailyReport(
      {
        id: expected.id,
        reportDate: expected.reportDate,
        totalRevenue: 6000,
        totalPatients: 1,
      },
      expected,
      true
    )
  );
  assert.throws(
    () =>
      assertDailyReport(
        {
          id: expected.id,
          reportDate: expected.reportDate,
          totalRevenue: 0,
          totalPatients: 1,
        },
        expected,
        true
      ),
    /READBACK_MISMATCH/
  );
});

test('reservation pages use the current array data and top-level pagination contract', () => {
  const rows = [{ id: fixtureId('test', 'reservation', 1) }];
  assert.equal(
    reservationPageCursor(rows, {
      pagination: { has_more: true, next_cursor: 'abc_123' },
    }),
    'abc_123'
  );
  assert.equal(
    reservationPageCursor(rows, {
      pagination: { has_more: false, next_cursor: null },
    }),
    null
  );
  assert.throws(
    () => reservationPageCursor({ items: rows, nextCursor: null }, {}),
    /PAGINATION_INVALID/
  );
  assert.throws(
    () =>
      reservationPageCursor([], {
        pagination: { has_more: true, next_cursor: 'abc' },
      }),
    /PAGINATION_INVALID/
  );
  assert.throws(
    () =>
      reservationPageCursor(rows, {
        pagination: { has_more: false, next_cursor: 'abc' },
      }),
    /PAGINATION_INVALID/
  );
});

test('batches preserve bounded memory and reject unbounded sizes', () => {
  assert.deepEqual([...batches([1, 2, 3, 4, 5], 2)], [[1, 2], [3, 4], [5]]);
  assert.throws(() => [...batches([1], 1000000)], /BATCH/);
});

class MemoryDatabase {
  constructor() {
    this.tables = new Map();
    this.authUsers = new Map();
    this.writes = 0;
    this.rowCap = Infinity;
  }
  rows(table) {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table);
  }
  auth = {
    admin: {
      getUserById: async id =>
        this.authUsers.has(id)
          ? { data: { user: this.authUsers.get(id) }, error: null }
          : { data: { user: null }, error: { status: 404 } },
      createUser: async input => {
        const user = {
          id: input.id,
          email: input.email,
          app_metadata: input.app_metadata,
        };
        this.authUsers.set(user.id, user);
        return { data: { user }, error: null };
      },
      listUsers: async ({ page, perPage }) => ({
        data: {
          users: [...this.authUsers.values()].slice(
            (page - 1) * perPage,
            page * perPage
          ),
        },
        error: null,
      }),
    },
  };
  from(table) {
    const db = this;
    const filters = [];
    let countOnly = false;
    let includeCount = false;
    let start = 0;
    let end = Infinity;
    let insert;
    let conflict;
    let ignoreDuplicates;
    const query = {
      select(_columns, options) {
        countOnly = options?.head === true;
        includeCount = options?.count === 'exact';
        return query;
      },
      eq(column, value) {
        filters.push(row => row[column] === value);
        return query;
      },
      in(column, values) {
        filters.push(row => values.includes(row[column]));
        return query;
      },
      not(column, _operator, raw) {
        const ids = raw.slice(1, -1).split(',');
        filters.push(row => !ids.includes(row[column]));
        return query;
      },
      order() {
        return query;
      },
      range(first, last) {
        start = first;
        end = last + 1;
        return query;
      },
      limit(size) {
        end = size;
        return query;
      },
      upsert(rows, options) {
        insert = rows;
        conflict = options.onConflict;
        ignoreDuplicates = options.ignoreDuplicates;
        return query;
      },
      then(resolve, reject) {
        try {
          if (insert) {
            for (const row of insert) {
              const prior = db
                .rows(table)
                .findIndex(item => item[conflict] === row[conflict]);
              if (prior < 0) {
                db.rows(table).push({ ...row });
                db.writes++;
              } else if (!ignoreDuplicates) {
                db.rows(table)[prior] = { ...db.rows(table)[prior], ...row };
                db.writes++;
              }
            }
            // Model the existing DB report aggregate trigger, not the fixture expectation.
            if (table === 'daily_report_items') {
              for (const report of db.rows('daily_reports')) {
                const items = db
                  .rows('daily_report_items')
                  .filter(item => item.daily_report_id === report.id);
                report.total_patients = items.length;
                report.total_revenue = items.reduce(
                  (sum, item) => sum + item.fee,
                  0
                );
                report.private_revenue = report.total_revenue;
                report.insurance_revenue = 0;
              }
            }
            return Promise.resolve({ data: null, error: null }).then(
              resolve,
              reject
            );
          }
          const rows = db
            .rows(table)
            .filter(row => filters.every(filter => filter(row)));
          return Promise.resolve({
            data: countOnly
              ? null
              : rows.slice(start, Math.min(end, start + db.rowCap)),
            count: includeCount ? rows.length : null,
            error: null,
          }).then(resolve, reject);
        } catch (error) {
          return Promise.reject(error).then(resolve, reject);
        }
      },
    };
    return query;
  }
}

async function withFixtureEnvironment(action) {
  const names = [
    'CORE100_FIXTURE_PASSWORD',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_APP_ENV',
    'VERCEL_ENV',
  ];
  const previous = new Map(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  process.env.CORE100_FIXTURE_PASSWORD = 'test-fixture-password-only';
  try {
    return await action();
  } finally {
    for (const [name, value] of previous)
      value === undefined
        ? delete process.env[name]
        : (process.env[name] = value);
  }
}

test('seed refuses an unrelated clinic before creating auth users or writing table data', async () => {
  const db = new MemoryDatabase();
  db.rows('clinics').push({ id: fixtureId('unrelated', 'clinics', 1) });
  await assert.rejects(
    () => assertDedicatedDatabase(db, createManifest(profile(), target())),
    /OTHER_CLINICS/
  );
  assert.equal(db.writes, 0);
  assert.equal(db.authUsers.size, 0);
});

test('complete synthetic seed and read-only verifier round trip; report corruption fails instead of turning green', async () => {
  await withFixtureEnvironment(async () => {
    const p = profile();
    const t = target();
    const db = new MemoryDatabase();
    const directory = await mkdtemp(path.join(tmpdir(), 'core100-test-'));
    const paths = outputPaths(directory, p.runId);
    const flags = { execute: true, approvedTarget: t.id };
    const seeded = await seedDatabase({
      profile: p,
      target: t,
      flags,
      paths,
      client: db,
    });
    assert.equal(seeded.seedStatus, 'COMPLETE');
    assert.equal(db.authUsers.size, 500);
    const writesBeforeVerify = db.writes;
    const verified = await verifyData({
      profile: p,
      target: t,
      flags,
      paths,
      client: db,
    });
    assert.equal(
      verified.verificationStatus,
      'PASS',
      await readFile(verified.evidenceFile, 'utf8')
    );
    assert.equal(db.writes, writesBeforeVerify);
    assert.equal(verified.counts.reservations, 3000);
    await assert.rejects(
      () => seedDatabase({ profile: p, target: t, flags, paths, client: db }),
      /ALREADY_COMPLETE/
    );
    assert.equal(db.rows('reservations').length, 3000);
    db.rowCap = 2;
    const capped = await verifyData({
      profile: p,
      target: t,
      flags,
      paths,
      client: db,
    });
    assert.equal(
      capped.verificationStatus,
      'PASS',
      await readFile(capped.evidenceFile, 'utf8')
    );
    assert.equal(capped.counts.staff, 500);
    assert.equal(capped.counts.subscriptions, 10);
    db.rows('daily_reports')[0].total_revenue = 1;
    const failed = await verifyData({
      profile: p,
      target: t,
      flags,
      paths,
      client: db,
    });
    assert.equal(failed.verificationStatus, 'FAIL');
    assert.match(
      await readFile(failed.evidenceFile, 'utf8'),
      /DAILY_REPORT_TOTAL_MISMATCH/
    );
  });
});

test('an interrupted seed resumes the same journal without duplicating auth users or reservations', async () => {
  await withFixtureEnvironment(async () => {
    const p = profile();
    const t = target();
    const db = new MemoryDatabase();
    const directory = await mkdtemp(path.join(tmpdir(), 'core100-resume-'));
    const paths = outputPaths(directory, p.runId);
    const flags = { execute: true, approvedTarget: t.id };
    let interrupted = false;
    await assert.rejects(
      () =>
        seedDatabase({
          profile: p,
          target: t,
          flags,
          paths,
          client: db,
          onProgress: event => {
            if (!interrupted && event.stage === 'reservations') {
              interrupted = true;
              throw new Error('TEST_INTERRUPTION');
            }
          },
        }),
      /TEST_INTERRUPTION/
    );
    assert.equal(db.rows('reservations').length, 3000);
    await seedDatabase({ profile: p, target: t, flags, paths, client: db });
    assert.equal(db.authUsers.size, 500);
    assert.equal(db.rows('reservations').length, 3000);
    const manifest = JSON.parse(await readFile(paths.manifest, 'utf8'));
    assert.equal(manifest.seedStatus, 'COMPLETE');
  });
});

function fakeApplication(db, p, { truncateCalendar = false } = {}) {
  let nextId = 0;
  const users = new Map(userFixtures(p).map(user => [user.id, user]));
  const envelope = (data, status = 200) =>
    new Response(JSON.stringify({ success: true, data }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const denied = () =>
    new Response(JSON.stringify({ success: false }), { status: 403 });
  const reservationDto = row => ({
    id: row.id,
    customerId: row.customer_id,
    menuId: row.menu_id,
    staffId: row.staff_id,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
  });
  return async (input, init) => {
    const url = new URL(String(input));
    const user = users.get(init.headers.cookie.split('=', 2)[1]);
    assert.ok(user, 'normal user cookie must be passed');
    assert.equal(init.headers.origin, 'http://127.0.0.1:3000');
    assert.equal(
      init.headers.authorization,
      undefined,
      'service role must not enter application traffic'
    );
    if (!user.active || user.assignmentsRevoked) return denied();
    const allowed = user.scopedClinicIndexes.map(index => clinicId(p, index));
    const body = init.body ? JSON.parse(init.body) : null;
    const requestedClinic =
      body?.clinic_id ?? url.searchParams.get('clinic_id');
    if (requestedClinic && !allowed.includes(requestedClinic)) return denied();
    if (url.pathname === '/api/customers' && user.role === 'manager')
      return denied();
    if (url.pathname === '/api/customers')
      return envelope({
        items: db
          .rows('customers')
          .filter(row => row.clinic_id === requestedClinic)
          .slice(0, Number(url.searchParams.get('limit') ?? 50)),
        nextCursor: null,
      });
    if (url.pathname === '/api/reservations' && init.method === 'POST') {
      if (user.role === 'manager') return denied();
      const overlap = db
        .rows('reservations')
        .some(
          row =>
            row.staff_id === body.staffId &&
            row.status !== 'cancelled' &&
            Date.parse(row.start_time) < Date.parse(body.endTime) &&
            Date.parse(body.startTime) < Date.parse(row.end_time)
        );
      if (overlap)
        return new Response(JSON.stringify({ success: false }), {
          status: 409,
        });
      const row = {
        id: fixtureId(p.runId, 'load', nextId++),
        clinic_id: body.clinic_id,
        customer_id: body.customerId,
        menu_id: body.menuId,
        staff_id: body.staffId,
        start_time: body.startTime,
        end_time: body.endTime,
        status: 'unconfirmed',
        is_deleted: false,
      };
      db.rows('reservations').push(row);
      return envelope(reservationDto(row), 201);
    }
    if (url.pathname === '/api/reservations' && init.method === 'PATCH') {
      const row = db
        .rows('reservations')
        .find(row => row.id === body.id && row.clinic_id === requestedClinic);
      assert.ok(row);
      Object.assign(row, {
        start_time: body.startTime,
        end_time: body.endTime,
        status: body.status,
      });
      return envelope(reservationDto(row));
    }
    if (url.pathname === '/api/reservations') {
      const id = url.searchParams.get('id');
      const rows = db
        .rows('reservations')
        .filter(row => row.clinic_id === requestedClinic);
      if (id) return envelope(reservationDto(rows.find(row => row.id === id)));
      const start = Date.parse(url.searchParams.get('start_date'));
      const end = Date.parse(url.searchParams.get('end_date'));
      const matches = rows
        .filter(
          row =>
            Date.parse(row.start_time) >= start &&
            Date.parse(row.start_time) <= end &&
            !row.is_deleted
        )
        .map(reservationDto);
      const offset = Number(url.searchParams.get('cursor') ?? 0);
      const page = matches.slice(offset, offset + 4);
      const hasMore =
        !truncateCalendar && offset + page.length < matches.length;
      return new Response(
        JSON.stringify({
          success: true,
          data: page,
          pagination: {
            has_more: hasMore,
            next_cursor: hasMore ? String(offset + page.length) : null,
          },
        }),
        { status: 200 }
      );
    }
    if (url.pathname === '/api/daily-reports') {
      if (init.method === 'POST') {
        const row = db
          .rows('daily_reports')
          .find(
            row =>
              row.clinic_id === requestedClinic &&
              row.report_date === body.report_date
          );
        assert.ok(row);
        Object.assign(row, body);
        return envelope(row);
      }
      const row = db
        .rows('daily_reports')
        .find(
          row =>
            row.id === url.searchParams.get('id') &&
            row.clinic_id === requestedClinic
        );
      return envelope({
        id: row.id,
        reportDate: row.report_date,
        totalRevenue: row.total_revenue,
        totalPatients: row.total_patients,
      });
    }
    if (url.pathname === '/api/manager/dashboard') {
      const cards = allowed.map(id => ({
        clinicId: id,
        todayRevenue: db
          .rows('daily_reports')
          .find(row => row.clinic_id === id && row.report_date === p.asOfDate)
          .total_revenue,
      }));
      const reports = db
        .rows('daily_reports')
        .filter(
          row =>
            allowed.includes(row.clinic_id) && row.report_date === p.asOfDate
        );
      return envelope({
        clinicCards: cards,
        summary: {
          todayRevenue: reports.reduce(
            (sum, row) => sum + row.total_revenue,
            0
          ),
          todayVisitCount: reports.reduce(
            (sum, row) => sum + row.total_patients,
            0
          ),
        },
      });
    }
    if (url.pathname === '/api/admin/dashboard')
      return envelope({
        clinicsData: allowed.map(id => ({
          id,
          totalRevenue: db
            .rows('daily_reports')
            .filter(row => row.clinic_id === id)
            .reduce((sum, row) => sum + row.total_revenue, 0),
        })),
      });
    throw new Error('Unexpected application endpoint');
  };
}

test('native runner uses ordinary cookies, performs writes/readbacks and records data for post-load verification', async () => {
  await withFixtureEnvironment(async () => {
    const p = createProfile({ ...config(), asOfDate: currentJstDate() });
    const t = target();
    const db = new MemoryDatabase();
    const directory = await mkdtemp(path.join(tmpdir(), 'core100-runner-'));
    const paths = outputPaths(directory, p.runId);
    const flags = { execute: true, approvedTarget: t.id, smoke: true };
    await seedDatabase({ profile: p, target: t, flags, paths, client: db });
    const seedCheck = await verifyData({
      profile: p,
      target: t,
      flags,
      paths,
      client: db,
    });
    assert.equal(seedCheck.verificationStatus, 'PASS');
    let virtualTime = 0;
    const result = await runLoad({
      profile: p,
      target: t,
      flags,
      paths,
      runtime: {
        now: () => virtualTime,
        wait: async ms => {
          virtualTime += ms;
        },
        fetcher: fakeApplication(db, p),
        createSession: async (_target, user) => ({
          user,
          cookieJar: new Map([['testUser', user.id]]),
        }),
      },
    });
    const evidence = JSON.parse(await readFile(result.resultFile, 'utf8'));
    assert.equal(result.status, 'COMPLETE', JSON.stringify(evidence));
    assert.equal(result.applicationSloStatus, 'NOT_APPLICABLE');
    assert.equal(result.capacityStatus, 'BLOCKED');
    assert.equal(evidence.boundaryChecks.length, 34);
    assert.ok(
      evidence.metrics.some(row => row.endpoint === 'POST /api/daily-reports')
    );
    assert.ok(
      evidence.metrics.some(row => row.endpoint === 'PATCH /api/reservations')
    );
    assert.ok(evidence.mutations.length > 2);
    const verified = await verifyData({
      profile: p,
      target: t,
      flags: { ...flags, loadResultFile: result.resultFile },
      paths,
      client: db,
    });
    assert.equal(
      verified.verificationStatus,
      'PASS',
      await readFile(verified.evidenceFile, 'utf8')
    );
    // A lost acknowledged booking fails the actual DB reconciliation.
    db.tables.set(
      'reservations',
      db.rows('reservations').filter(row => row.id !== evidence.mutations[0].id)
    );
    const failed = await verifyData({
      profile: p,
      target: t,
      flags: { ...flags, loadResultFile: result.resultFile },
      paths,
      client: db,
    });
    assert.equal(failed.verificationStatus, 'FAIL');
  });
});

test('native runner records valid HTTP 200 but truncated final calendar pages as integrity failures', async () => {
  await withFixtureEnvironment(async () => {
    const p = createProfile({ ...config(), asOfDate: currentJstDate() });
    const t = target();
    const db = new MemoryDatabase();
    const directory = await mkdtemp(path.join(tmpdir(), 'core100-truncated-'));
    const paths = outputPaths(directory, p.runId);
    const flags = { execute: true, approvedTarget: t.id, smoke: true };
    await seedDatabase({ profile: p, target: t, flags, paths, client: db });
    assert.equal(
      (await verifyData({ profile: p, target: t, flags, paths, client: db }))
        .verificationStatus,
      'PASS'
    );
    let virtualTime = 0;
    const result = await runLoad({
      profile: p,
      target: t,
      flags,
      paths,
      runtime: {
        now: () => virtualTime,
        wait: async ms => {
          virtualTime += ms;
        },
        fetcher: fakeApplication(db, p, { truncateCalendar: true }),
        createSession: async (_target, user) => ({
          user,
          cookieJar: new Map([['testUser', user.id]]),
        }),
      },
    });
    const evidence = JSON.parse(await readFile(result.resultFile, 'utf8'));
    assert.equal(result.status, 'FAIL');
    assert.ok(evidence.integrityFailures > 0);
    assert.ok(
      evidence.operationFailures.some(
        failure =>
          failure.code === 'RESERVATION_LIST_COUNT_MISMATCH' &&
          failure.requestFailure
      )
    );
    assert.ok(
      evidence.metrics.some(
        metric =>
          metric.endpoint === 'GET /api/reservations' &&
          metric.unexpectedErrors > 0 &&
          metric.statuses['200'] > 0
      )
    );
  });
});
