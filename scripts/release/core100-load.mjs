import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import {
  clinicId,
  completedPerDay,
  currentJstDate,
  dateAt,
  fixtureId,
  invariant,
  profileHash,
  reservationFixture,
  userFixtures,
} from './core100-profile.mjs';
import {
  assertExecutionAllowed,
  fixturePassword,
  readManifest,
  restrictedFetch,
  saveJson,
  secretFromEnv,
} from './core100-safety.mjs';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isRecord = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

class RequestFailure extends Error {
  constructor(code, status) {
    super(`${code}:${status}`);
    this.code = code;
    this.status = status;
  }
}

export function evaluateApplicationSlo(
  metrics,
  recoveryMetrics,
  events,
  operationFailures
) {
  const normal = metrics.filter(metric => metric.phase === 'normal');
  const requiredKinds = ['read', 'write', 'aggregate'];
  const coverage = [normal, recoveryMetrics].every(rows =>
    requiredKinds.every(kind => rows.some(metric => metric.kind === kind))
  );
  const integrityFailures = events.filter(
    event =>
      !event.ok && /MISMATCH|INVALID|EMPTY|DUPLICATE|LOOP/.test(event.reason)
  ).length;
  const untrackedOperationFailures = operationFailures.filter(
    failure => !failure.requestFailure
  ).length;
  return {
    integrityFailures,
    untrackedOperationFailures,
    pass:
      coverage &&
      normal.every(metric => metric.pass) &&
      recoveryMetrics.every(metric => metric.pass) &&
      integrityFailures === 0 &&
      untrackedOperationFailures === 0,
  };
}

export function selectLoadUsers(profile, vus) {
  invariant(
    Number.isInteger(vus) && vus >= 2 && vus <= 400,
    'INVALID_VU_COUNT'
  );
  const users = userFixtures(profile).filter(
    user => user.active && !user.assignmentsRevoked
  );
  const aggregateCount = Math.max(1, Math.floor(vus / 10));
  const admins = users.filter(user => user.role === 'admin');
  const managers = users.filter(user => user.role === 'manager');
  // Alternate HQ and manager accounts so small smoke runs exercise both forms.
  const aggregates = [];
  for (let i = 0; i < Math.max(admins.length, managers.length); i++) {
    if (admins[i]) aggregates.push(admins[i]);
    if (managers[i]) aggregates.push(managers[i]);
  }
  return [
    ...aggregates.slice(0, aggregateCount),
    ...users
      .filter(user => user.role === 'staff')
      .slice(0, vus - aggregateCount),
  ];
}

export function operationFor(user, iteration) {
  if (user.role === 'admin' || user.role === 'manager') return 'aggregate';
  const draw = (iteration * 17 + user.index * 37) % 90;
  return draw < 45
    ? 'reservations_read'
    : draw < 70
      ? 'customer_search'
      : draw < 85
        ? 'reservation_write'
        : 'daily_report';
}

export function percentile(samples, fraction) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function summarizeMetrics(events, profile) {
  const groups = new Map();
  for (const event of events) {
    const key = `${event.phase}:${event.endpoint}:${event.kind}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return [...groups.values()].map(rows => {
    const first = rows[0];
    const unexpected = rows.filter(
      row => !row.ok && !(first.phase === 'burst' && row.status === 429)
    ).length;
    const threshold =
      first.kind === 'aggregate'
        ? profile.thresholds.aggregateP95Ms
        : first.kind === 'write'
          ? profile.thresholds.writeP95Ms
          : profile.thresholds.readP95Ms;
    const p95Ms = percentile(
      rows.map(row => row.latencyMs),
      0.95
    );
    const p99Ms = percentile(
      rows.map(row => row.latencyMs),
      0.99
    );
    return {
      phase: first.phase,
      endpoint: first.endpoint,
      kind: first.kind,
      requests: rows.length,
      successes: rows.filter(row => row.ok).length,
      unexpectedErrors: unexpected,
      controlledRejections:
        first.phase === 'burst'
          ? rows.filter(row => row.status === 429).length
          : 0,
      unexpectedErrorRatio: unexpected / rows.length,
      p95Ms,
      p99Ms,
      statuses: Object.fromEntries(
        [...new Set(rows.map(row => row.status))].map(status => [
          status,
          rows.filter(row => row.status === status).length,
        ])
      ),
      pass:
        unexpected / rows.length < profile.thresholds.unexpectedErrorRatio &&
        p95Ms <= threshold,
    };
  });
}

async function authenticatedSession(target, user, password) {
  const { createServerClient } = await import('@supabase/ssr');
  const cookieJar = new Map();
  const client = createServerClient(
    target.supabaseOrigin,
    secretFromEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      global: { fetch: restrictedFetch(target.supabaseOrigin) },
      cookies: {
        getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
        setAll: updates => {
          for (const cookie of updates)
            cookie.value
              ? cookieJar.set(cookie.name, cookie.value)
              : cookieJar.delete(cookie.name);
        },
      },
    }
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password,
  });
  invariant(
    !error && data?.user?.id === user.id,
    'BLOCKED_NORMAL_USER_SIGN_IN_FAILED'
  );
  invariant(cookieJar.size > 0, 'BLOCKED_SESSION_COOKIES_NOT_CREATED');
  return { user, cookieJar, client };
}

function absorbCookies(response, jar) {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0];
    const equals = pair.indexOf('=');
    if (equals < 1) continue;
    const name = pair.slice(0, equals);
    const value = pair.slice(equals + 1);
    if (!value || /(?:^|;)\s*max-age=0(?:;|$)/i.test(cookie)) jar.delete(name);
    else jar.set(name, value);
  }
}

export function unwrapResponse(status, body) {
  invariant(
    status >= 200 &&
      status < 300 &&
      isRecord(body) &&
      body.success === true &&
      Object.hasOwn(body, 'data'),
    'HTTP_OR_BUSINESS_FAILURE'
  );
  return body.data;
}

export function reservationPageCursor(data, envelope) {
  invariant(
    Array.isArray(data) && isRecord(envelope?.pagination),
    'RESERVATION_PAGINATION_INVALID'
  );
  const pagination = envelope.pagination;
  invariant(
    typeof pagination.has_more === 'boolean',
    'RESERVATION_PAGINATION_INVALID'
  );
  if (!pagination.has_more) {
    invariant(
      pagination.next_cursor === null,
      'RESERVATION_PAGINATION_INVALID'
    );
    return null;
  }
  invariant(
    data.length > 0 &&
      typeof pagination.next_cursor === 'string' &&
      /^[A-Za-z0-9_-]{1,2048}$/.test(pagination.next_cursor),
    'RESERVATION_PAGINATION_INVALID'
  );
  return pagination.next_cursor;
}

export function assertReservation(data, expected) {
  invariant(
    isRecord(data) && typeof data.id === 'string' && UUID.test(data.id),
    'RESERVATION_RESPONSE_INVALID'
  );
  if (expected.id)
    invariant(data.id === expected.id, 'RESERVATION_ID_MISMATCH');
  invariant(
    data.customerId === expected.customerId &&
      data.menuId === expected.menuId &&
      data.staffId === expected.staffId,
    'RESERVATION_SCOPE_OR_REFERENCE_MISMATCH'
  );
  if (expected.status)
    invariant(data.status === expected.status, 'RESERVATION_STATUS_MISMATCH');
  if (expected.startTime)
    invariant(
      Date.parse(data.startTime) === Date.parse(expected.startTime),
      'RESERVATION_START_MISMATCH'
    );
  return data;
}

export function reservationInput(profile, user, sequence, loadId) {
  invariant(
    user.role === 'staff' && user.clinicIndex !== null,
    'WRITER_MUST_BE_CLINIC_STAFF'
  );
  const clinic = user.clinicIndex;
  const staffSlot = Math.floor((user.index - 50) / 100);
  // Each normal user owns a resource lane and each request owns a one-hour slot.
  const day = dateAt(profile.asOfDate, 1 + Math.floor(sequence / 10));
  const start = new Date(`${day}T08:00:00+09:00`);
  start.setTime(start.getTime() + (sequence % 10) * 3600000);
  return {
    clinic_id: clinicId(profile, clinic),
    customerId: fixtureId(
      profile.runId,
      'customers',
      clinic * profile.customersPerClinic +
        (sequence % profile.customersPerClinic)
    ),
    menuId: fixtureId(profile.runId, 'menus', clinic),
    staffId: fixtureId(profile.runId, 'resources', clinic * 5 + staffSlot),
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 30 * 60000).toISOString(),
    channel: 'phone',
    notes: `CORE100 ${profile.runId} load ${loadId} user ${user.index} seq ${sequence}`,
  };
}

export function assertAggregate(data, profile, user) {
  invariant(isRecord(data), 'AGGREGATE_RESPONSE_INVALID');
  const expectedIds = user.scopedClinicIndexes.map(i => clinicId(profile, i));
  const rows = user.role === 'manager' ? data.clinicCards : data.clinicsData;
  invariant(
    Array.isArray(rows) && rows.length === expectedIds.length,
    'AGGREGATE_CLINIC_COUNT_MISMATCH'
  );
  const actualIds = rows.map(row =>
    user.role === 'manager' ? row.clinicId : row.id
  );
  invariant(
    new Set(actualIds).size === actualIds.length &&
      actualIds.every(id => expectedIds.includes(id)),
    'AGGREGATE_TENANT_SCOPE_MISMATCH'
  );
  const completed = completedPerDay(profile);
  const perClinicRevenue =
    completed *
    profile.fee *
    (user.role === 'manager' ? 1 : profile.operatingDays);
  for (const row of rows)
    invariant(
      (user.role === 'manager' ? row.todayRevenue : row.totalRevenue) ===
        perClinicRevenue,
      'AGGREGATE_REVENUE_MISMATCH'
    );
  if (user.role === 'manager') {
    invariant(
      isRecord(data.summary) &&
        data.summary.todayRevenue === perClinicRevenue * expectedIds.length &&
        data.summary.todayVisitCount === completed * expectedIds.length,
      'MANAGER_SUMMARY_MISMATCH'
    );
  }
}

export function assertDailyReport(data, expected, readback = false) {
  invariant(
    isRecord(data) && data.id === expected.id,
    'DAILY_REPORT_ID_MISMATCH'
  );
  if (readback) {
    invariant(
      data.reportDate === expected.reportDate &&
        data.totalRevenue === expected.revenue &&
        data.totalPatients === expected.patients,
      'DAILY_REPORT_READBACK_MISMATCH'
    );
  } else {
    invariant(
      data.clinic_id === expected.clinicId &&
        data.report_date === expected.reportDate &&
        data.total_revenue === expected.revenue &&
        data.total_patients === expected.patients,
      'DAILY_REPORT_WRITE_MISMATCH'
    );
  }
}

export async function runLoad({
  profile,
  target,
  flags,
  paths,
  onProgress = () => {},
  runtime = {},
}) {
  const now = runtime.now ?? (() => performance.now());
  const wait = runtime.wait ?? delay;
  const createSession = runtime.createSession ?? authenticatedSession;
  assertExecutionAllowed(target, flags);
  invariant(
    flags.smoke || profile.scale === 'standard',
    'STANDARD_LOAD_REQUIRES_STANDARD_DATASET'
  );
  invariant(
    profile.asOfDate === currentJstDate(),
    'BLOCKED_DATASET_DATE_MUST_MATCH_CURRENT_JST_DAY'
  );
  const manifest = await readManifest(paths.manifest, profile, target);
  invariant(
    manifest.seedStatus === 'COMPLETE' &&
      manifest.seedVerification?.status === 'PASS',
    'BLOCKED_SUCCESSFUL_SEED_VERIFICATION_REQUIRED'
  );
  invariant(
    !manifest.loadStartedAt,
    'BLOCKED_RUN_ALREADY_USED_CREATE_NEW_RUN_OR_APPROVED_CLEANUP'
  );
  const password = fixturePassword();
  const loadId = randomUUID();
  const resultFile = path.join(paths.root, `load-${loadId}.json`);
  const result = {
    formatVersion: 1,
    loadId,
    runId: profile.runId,
    profileHash: profileHash(profile),
    target,
    smoke: flags.smoke,
    startedAt: new Date().toISOString(),
    status: 'IN_PROGRESS',
    applicationSloStatus: 'NOT_RUN',
    capacityStatus: 'BLOCKED',
    blockers: [
      'Production-equivalent hosting/DB plans, region, Data API limit and connection settings need recorded verification.',
      'Single-runner source IP does not reproduce 100 clinic shared IPs; rate limiting remains enabled.',
      'DB CPU/connections/locks/queue recovery and external integrations require separate operator evidence.',
      'Unpaid-company normal-session rejection needs isolated billing fixture evidence; the measured ten-company dataset uses active synthetic subscriptions.',
      'Post-load verify-data must pass; local smoke cannot qualify 100-clinic capacity.',
    ],
    seedExpected: manifest.expected,
    plannedPhases: flags.smoke
      ? [{ name: 'smoke', vus: 20, seconds: 30 }]
      : profile.phases,
    thresholds: profile.thresholds,
    thinkMs: profile.thinkMs,
    boundaryChecks: [],
    phases: [],
    metrics: [],
    operationFailures: [],
    mutations: [],
    mutationJournalFile: `load-${loadId}-mutations.ndjson`,
  };
  await saveJson(resultFile, result, { exclusive: true });
  const sessions = new Map();
  const events = [];
  const sequences = new Map();
  const fetchApp = restrictedFetch(target.appOrigin, runtime.fetcher);
  let activePhase = 'preflight';
  let phaseStarted = now();
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  let journalQueue = Promise.resolve();
  const persistMutation = mutation => {
    journalQueue = journalQueue.then(() =>
      appendFile(
        path.join(paths.root, result.mutationJournalFile),
        `${JSON.stringify({ profileHash: result.profileHash, loadId, mutation })}\n`,
        { mode: 0o600 }
      )
    );
    return journalQueue;
  };
  const sessionFor = async user => {
    if (!sessions.has(user.id))
      sessions.set(user.id, await createSession(target, user, password));
    return sessions.get(user.id);
  };
  const request = async (
    session,
    route,
    {
      method = 'GET',
      body,
      kind = 'read',
      validate,
      expectedStatus,
      measured = true,
    } = {}
  ) => {
    const started = now();
    const endpoint = `${method} ${route.split('?')[0]}`;
    let status = 0;
    let ok = false;
    let data;
    let reason = 'REQUEST_FAILED';
    try {
      invariant(!interrupted, 'LOAD_INTERRUPTED');
      if (method !== 'GET' && !manifest.loadStartedAt) {
        manifest.loadStartedAt = new Date().toISOString();
        manifest.loadResultFile = path.basename(resultFile);
        await saveJson(paths.manifest, manifest);
      }
      const response = await fetchApp(new URL(route, target.appOrigin), {
        method,
        headers: {
          cookie: [...session.cookieJar]
            .map(([name, value]) => `${name}=${value}`)
            .join('; '),
          origin: target.appOrigin,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
      status = response.status;
      absorbCookies(response, session.cookieJar);
      const parsed = await response.json().catch(() => null);
      if (expectedStatus !== undefined) {
        invariant(status === expectedStatus, 'EXPECTED_STATUS_MISMATCH');
        data = parsed;
      } else {
        data = unwrapResponse(status, parsed);
        if (validate) validate(data, parsed);
      }
      ok = true;
      reason = '';
    } catch (error) {
      reason =
        error instanceof Error && /^[A-Z_]+$/.test(error.message)
          ? error.message
          : 'REQUEST_OR_RESPONSE_FAILED';
    }
    if (measured)
      events.push({
        phase: activePhase,
        phaseElapsedMs: now() - phaseStarted,
        endpoint,
        kind,
        status,
        ok,
        reason,
        latencyMs: now() - started,
      });
    if (!ok) throw new RequestFailure(reason, status);
    return data;
  };
  const checkpoint = async () => {
    result.metrics = summarizeMetrics(events, profile);
    await saveJson(resultFile, result);
  };
  const nextSequence = user => {
    const value = sequences.get(user.id) ?? 0;
    sequences.set(user.id, value + 1);
    return value;
  };
  const createReservation = async (session, sequence) => {
    const input = reservationInput(profile, session.user, sequence, loadId);
    const reservation = await request(session, '/api/reservations', {
      method: 'POST',
      body: input,
      kind: 'write',
      validate: data => assertReservation(data, input),
    });
    const mutation = {
      id: reservation.id,
      clinicId: input.clinic_id,
      customerId: input.customerId,
      menuId: input.menuId,
      staffId: input.staffId,
      startTime: input.startTime,
      endTime: input.endTime,
      status: reservation.status,
    };
    result.mutations.push(mutation);
    await persistMutation(mutation);
    return { input, mutation };
  };
  const runOperation = async (session, iteration) => {
    const user = session.user;
    const operation = operationFor(user, iteration);
    if (operation === 'aggregate') {
      await request(
        session,
        user.role === 'manager'
          ? '/api/manager/dashboard'
          : '/api/admin/dashboard',
        {
          kind: 'aggregate',
          validate: data => assertAggregate(data, profile, user),
        }
      );
      return operation;
    }
    const clinic = user.clinicIndex;
    const id = clinicId(profile, clinic);
    if (operation === 'customer_search') {
      const customers = new Set(
        Array.from({ length: profile.customersPerClinic }, (_, i) =>
          fixtureId(
            profile.runId,
            'customers',
            clinic * profile.customersPerClinic + i
          )
        )
      );
      await request(
        session,
        `/api/customers?clinic_id=${id}&q=CORE100&limit=50`,
        {
          validate: data => {
            invariant(
              isRecord(data) &&
                Array.isArray(data.items) &&
                data.items.length > 0,
              'CUSTOMER_SEARCH_EMPTY_OR_INVALID'
            );
            invariant(
              data.items.every(row => isRecord(row) && customers.has(row.id)),
              'CUSTOMER_SCOPE_MISMATCH'
            );
          },
        }
      );
    } else if (operation === 'reservations_read') {
      // A monthly calendar sample exercises >1,000 rows using the same API contract.
      const days = iteration % 10 === 0 ? 28 : 1;
      const start = encodeURIComponent(
        `${dateAt(profile.asOfDate, 1 - days)}T00:00:00+09:00`
      );
      const end = encodeURIComponent(`${profile.asOfDate}T23:59:59+09:00`);
      let cursor = null;
      const seenCursors = new Set();
      const seenIds = new Set();
      const deletedPerDay = profile.reservationsPerDay >= 50 ? 1 : 0;
      const expectedCount =
        Math.min(days, profile.operatingDays) *
        (profile.reservationsPerDay - deletedPerDay);
      do {
        const cursorQuery = cursor
          ? `&cursor=${encodeURIComponent(cursor)}`
          : '';
        await request(
          session,
          `/api/reservations?clinic_id=${id}&start_date=${start}&end_date=${end}&limit=100${cursorQuery}`,
          {
            validate: (rows, envelope) => {
              cursor = reservationPageCursor(rows, envelope);
              invariant(rows.length > 0, 'RESERVATION_LIST_EMPTY_OR_INVALID');
              invariant(
                rows.every(
                  row =>
                    isRecord(row) &&
                    row.menuId === fixtureId(profile.runId, 'menus', clinic) &&
                    Array.from({ length: 5 }, (_, i) =>
                      fixtureId(profile.runId, 'resources', clinic * 5 + i)
                    ).includes(row.staffId)
                ),
                'RESERVATION_LIST_SCOPE_MISMATCH'
              );
              for (const row of rows) {
                invariant(
                  !seenIds.has(row.id),
                  'RESERVATION_PAGINATION_DUPLICATE'
                );
                seenIds.add(row.id);
              }
              if (cursor) {
                invariant(
                  !seenCursors.has(cursor) && seenCursors.size < 100,
                  'RESERVATION_PAGINATION_LOOP'
                );
                seenCursors.add(cursor);
              } else
                invariant(
                  seenIds.size === expectedCount,
                  'RESERVATION_LIST_COUNT_MISMATCH'
                );
            },
          }
        );
      } while (cursor);
    } else if (operation === 'daily_report') {
      const count = completedPerDay(profile);
      const body = {
        clinic_id: id,
        staff_id: user.id,
        report_date: profile.asOfDate,
        total_patients: count,
        new_patients: 0,
        total_revenue: count * profile.fee,
        insurance_revenue: 0,
        private_revenue: count * profile.fee,
        report_text: `CORE100 ${profile.runId}`,
      };
      const expected = {
        id: fixtureId(
          profile.runId,
          'daily_reports',
          clinic * profile.operatingDays + profile.operatingDays - 1
        ),
        clinicId: id,
        reportDate: profile.asOfDate,
        revenue: body.total_revenue,
        patients: count,
      };
      const report = await request(session, '/api/daily-reports', {
        method: 'POST',
        body,
        kind: 'write',
        validate: data => assertDailyReport(data, expected),
      });
      await request(
        session,
        `/api/daily-reports?clinic_id=${id}&id=${report.id}`,
        { validate: data => assertDailyReport(data, expected, true) }
      );
    } else {
      const sequence = nextSequence(user);
      const { input, mutation } = await createReservation(session, sequence);
      const startTime = new Date(
        Date.parse(input.startTime) + 30 * 60000
      ).toISOString();
      const endTime = new Date(
        Date.parse(input.endTime) + 30 * 60000
      ).toISOString();
      const status = sequence % 5 === 0 ? 'cancelled' : 'confirmed';
      await request(session, '/api/reservations', {
        method: 'PATCH',
        body: { clinic_id: id, id: mutation.id, startTime, endTime, status },
        kind: 'write',
        validate: data =>
          assertReservation(data, {
            ...input,
            id: mutation.id,
            startTime,
            status,
          }),
      });
      Object.assign(mutation, { startTime, endTime, status });
      await persistMutation(mutation);
      await request(
        session,
        `/api/reservations?clinic_id=${id}&id=${mutation.id}`,
        { validate: data => assertReservation(data, mutation) }
      );
    }
    return operation;
  };
  try {
    // Prepare sessions once; authentication traffic is excluded from business metrics.
    const largest = Math.max(...result.plannedPhases.map(phase => phase.vus));
    const selected = selectLoadUsers(profile, largest);
    for (let i = 0; i < selected.length; i++) {
      await sessionFor(selected[i]);
      if (i % 20 === 0)
        onProgress({ stage: 'session-preparation', accounts: i + 1 });
    }
    const allUsers = userFixtures(profile);
    const reservationWitness = index => {
      const row = reservationFixture(profile, index, 0, 0);
      return {
        row,
        url: `/api/reservations?clinic_id=${row.clinic_id}&id=${row.id}`,
      };
    };
    for (let company = 0; company < 10; company++) {
      for (const role of ['admin', 'manager', 'staff']) {
        const user = allUsers.find(
          candidate =>
            candidate.company === company &&
            candidate.role === role &&
            candidate.active &&
            !candidate.assignmentsRevoked
        );
        const other = allUsers.find(
          candidate =>
            candidate.company !== company && candidate.role === 'staff'
        );
        invariant(user && other, 'BOUNDARY_FIXTURE_MISSING');
        const session = await sessionFor(user);
        const witness = reservationWitness(user.scopedClinicIndexes[0]);
        await request(session, witness.url, {
          measured: false,
          validate: data =>
            invariant(
              isRecord(data) &&
                data.id === witness.row.id &&
                data.customerId === witness.row.customer_id,
              'BOUNDARY_POSITIVE_CONTROL_FAILED'
            ),
        });
        await request(
          session,
          reservationWitness(other.scopedClinicIndexes[0]).url,
          {
            expectedStatus: 403,
            measured: false,
          }
        );
        // Patient access is a separate manager role restriction, not evidence of
        // tenant isolation: even an active assigned manager must be denied here.
        if (role === 'manager') {
          await request(
            session,
            `/api/customers?clinic_id=${witness.row.clinic_id}`,
            {
              expectedStatus: 403,
              measured: false,
            }
          );
        }
        result.boundaryChecks.push({
          company,
          role,
          scenario: 'other-company-read',
          status: 'PASS',
        });
      }
    }
    for (const user of allUsers.filter(
      user => !user.active || user.assignmentsRevoked
    )) {
      await request(
        await sessionFor(user),
        reservationWitness(user.scopedClinicIndexes[0]).url,
        { expectedStatus: 403, measured: false }
      );
      result.boundaryChecks.push({
        role: user.role,
        scenario: user.active ? 'revoked-manager' : 'inactive-account',
        status: 'PASS',
      });
    }
    const boundaryStaff = allUsers.find(user => user.role === 'staff');
    const unassigned = Array.from({ length: 100 }, (_, i) => i).find(
      i =>
        !boundaryStaff.scopedClinicIndexes.includes(i) &&
        allUsers.find(user => user.clinicIndex === i)?.company ===
          boundaryStaff.company
    );
    invariant(unassigned !== undefined, 'UNASSIGNED_CLINIC_FIXTURE_MISSING');
    await request(
      await sessionFor(boundaryStaff),
      `/api/customers?clinic_id=${clinicId(profile, unassigned)}`,
      { expectedStatus: 403, measured: false }
    );
    result.boundaryChecks.push({
      role: 'staff',
      scenario: 'same-company-unassigned-clinic',
      status: 'PASS',
    });
    // Two explicit parallel requests, separate from the normal-error denominator.
    const conflictSession = await sessionFor(boundaryStaff);
    const conflictInput = reservationInput(
      profile,
      boundaryStaff,
      nextSequence(boundaryStaff),
      loadId
    );
    const conflictResults = await Promise.allSettled(
      [0, 1].map(() =>
        request(conflictSession, '/api/reservations', {
          method: 'POST',
          body: conflictInput,
          kind: 'write',
          measured: false,
          validate: data => assertReservation(data, conflictInput),
        })
      )
    );
    const confirmed = conflictResults.filter(
      item => item.status === 'fulfilled'
    );
    for (const outcome of confirmed) {
      const mutation = {
        id: outcome.value.id,
        clinicId: conflictInput.clinic_id,
        customerId: conflictInput.customerId,
        menuId: conflictInput.menuId,
        staffId: conflictInput.staffId,
        startTime: conflictInput.startTime,
        endTime: conflictInput.endTime,
        status: outcome.value.status,
      };
      result.mutations.push(mutation);
      await persistMutation(mutation);
    }
    invariant(
      confirmed.length === 1 &&
        conflictResults.some(
          item =>
            item.status === 'rejected' &&
            item.reason instanceof Error &&
            item.reason.message.endsWith(':409')
        ),
      'RESERVATION_CONCURRENCY_FAILED'
    );
    result.boundaryChecks.push({
      scenario: 'same-slot-concurrent-create',
      status: 'PASS',
    });
    await checkpoint();
    // Successful representative writes/readbacks must precede measurement.
    for (const user of selected.filter(user => user.role !== 'staff'))
      await runOperation(await sessionFor(user), 0);
    const smokeStaff = selected.find(user => user.role === 'staff');
    for (let i = 0; i < 90; i++) {
      if (
        ['reservation_write', 'daily_report'].includes(
          operationFor(smokeStaff, i)
        )
      )
        await runOperation(await sessionFor(smokeStaff), i);
      if (
        result.mutations.length > 2 &&
        events.some(
          event => event.endpoint === 'POST /api/daily-reports' && event.ok
        )
      )
        break;
    }
    for (const phase of result.plannedPhases) {
      activePhase = phase.name;
      const started = now();
      phaseStarted = started;
      const deadline = started + phase.seconds * 1000;
      const phaseRecord = {
        name: phase.name,
        vus: phase.vus,
        startedAt: new Date().toISOString(),
        operations: {},
        failedOperations: 0,
      };
      onProgress({ stage: phase.name, vus: phase.vus, seconds: phase.seconds });
      const heartbeat = setInterval(
        () =>
          onProgress({
            stage: phase.name,
            elapsedSeconds: Math.round((now() - started) / 1000),
          }),
        30000
      );
      try {
        await Promise.all(
          selectLoadUsers(profile, phase.vus).map(async user => {
            const session = sessions.get(user.id);
            invariant(session, 'PREPARED_SESSION_MISSING');
            let iteration = 0;
            // Small deterministic staggering avoids creating an artificial request burst.
            await wait((user.index % 20) * 25);
            while (!interrupted && now() < deadline) {
              const operation = operationFor(user, iteration);
              phaseRecord.operations[operation] =
                (phaseRecord.operations[operation] ?? 0) + 1;
              try {
                await runOperation(session, iteration++);
              } catch (error) {
                phaseRecord.failedOperations++;
                result.operationFailures.push({
                  phase: phase.name,
                  operation,
                  requestFailure: error instanceof RequestFailure,
                  code:
                    error instanceof RequestFailure
                      ? error.code
                      : error instanceof Error &&
                          /^[A-Z_]+$/.test(error.message)
                        ? error.message
                        : 'OPERATION_FAILED',
                });
              }
              const remaining = deadline - now();
              if (remaining > 0)
                await wait(Math.min(profile.thinkMs, remaining));
            }
          })
        );
      } finally {
        clearInterval(heartbeat);
      }
      invariant(!interrupted, 'LOAD_INTERRUPTED');
      const seconds = (now() - started) / 1000;
      const requests = events.filter(
        event => event.phase === phase.name
      ).length;
      const operations = Object.values(phaseRecord.operations).reduce(
        (sum, value) => sum + value,
        0
      );
      result.phases.push({
        ...phaseRecord,
        durationSeconds: seconds,
        operationsPerSecond: operations / seconds,
        httpRequests: requests,
        httpRequestsPerSecond: requests / seconds,
      });
      await checkpoint();
    }
    result.recoveryWindows = Array.from({ length: 5 }, (_, minute) => ({
      minute: minute + 1,
      metrics: summarizeMetrics(
        events.filter(
          event =>
            event.phase === 'recovery' &&
            event.phaseElapsedMs >= minute * 60000 &&
            event.phaseElapsedMs < (minute + 1) * 60000
        ),
        profile
      ),
    }));
    const recovered = result.recoveryWindows[4].metrics;
    const slo = evaluateApplicationSlo(
      result.metrics,
      recovered,
      events,
      result.operationFailures
    );
    result.integrityFailures = slo.integrityFailures;
    result.untrackedOperationFailures = slo.untrackedOperationFailures;
    result.applicationSloStatus = flags.smoke
      ? 'NOT_APPLICABLE'
      : slo.pass
        ? 'PASS'
        : 'FAIL';
    const burstFailures = result.metrics
      .filter(metric => metric.phase === 'burst')
      .reduce((total, metric) => total + metric.unexpectedErrors, 0);
    result.status =
      (flags.smoke &&
        result.phases.some(phase => phase.failedOperations > 0)) ||
      result.applicationSloStatus === 'FAIL' ||
      result.integrityFailures > 0 ||
      result.untrackedOperationFailures > 0 ||
      burstFailures > 0
        ? 'FAIL'
        : 'COMPLETE';
  } catch (error) {
    result.failureCode =
      error instanceof Error && /^[A-Z_]+(?::\d+)?$/.test(error.message)
        ? error.message
        : 'LOAD_EXECUTION_FAILED';
    result.status =
      result.failureCode.startsWith('BLOCKED_') ||
      result.failureCode === 'LOAD_INTERRUPTED'
        ? 'BLOCKED'
        : 'FAIL';
    result.applicationSloStatus = result.status === 'FAIL' ? 'FAIL' : 'NOT_RUN';
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    result.completedAt = new Date().toISOString();
    await checkpoint();
  }
  return {
    status: result.status,
    applicationSloStatus: result.applicationSloStatus,
    capacityStatus: 'BLOCKED',
    resultFile,
    mutations: result.mutations.length,
  };
}
