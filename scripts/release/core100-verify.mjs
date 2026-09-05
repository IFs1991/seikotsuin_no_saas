import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  clinicId,
  completedPerDay,
  fixtureId,
  invariant,
  profileHash,
  reportFixture,
  reservationFixture,
  rootId,
  tableRows,
  userFixtures,
} from './core100-profile.mjs';
import {
  assertExecutionAllowed,
  createSeedClient,
  databaseFailure,
  readManifest,
  saveJson,
} from './core100-safety.mjs';
import { assertDedicatedDatabase } from './core100-seed.mjs';

async function count(client, table, column, ids) {
  const { count: total, error } = await client
    .from(table)
    .select('id', { count: 'exact', head: true })
    .in(column, ids);
  if (error) throw databaseFailure(error, `VERIFY_${table.toUpperCase()}`);
  invariant(Number.isInteger(total) && total >= 0, 'COUNT_RESPONSE_MISSING');
  return total;
}

async function rowsByIds(client, table, select, ids, idColumn = 'id') {
  const all = [];
  // A manager ID may match many assignments; page by returned count even when
  // the target Data API cap is lower than the requested range.
  for (let offset = 0; offset < ids.length; offset += 50) {
    let returned = 0;
    let expected;
    do {
      const {
        data,
        count: total,
        error,
      } = await client
        .from(table)
        .select(select, { count: 'exact' })
        .in(idColumn, ids.slice(offset, offset + 50))
        .order(idColumn)
        .order('id')
        .range(returned, returned + 249);
      if (error) throw databaseFailure(error, `VERIFY_${table.toUpperCase()}`);
      invariant(
        Array.isArray(data) && Number.isInteger(total),
        'ROW_OR_EXACT_COUNT_RESPONSE_MISSING'
      );
      invariant(
        expected === undefined || expected === total,
        'VERIFY_SNAPSHOT_COUNT_CHANGED'
      );
      expected = total;
      invariant(
        data.length > 0 || returned === total,
        'BLOCKED_DATA_API_PAGE_INCOMPLETE'
      );
      all.push(...data);
      returned += data.length;
      invariant(
        returned <= total && returned <= 100000,
        'UNEXPECTED_ROW_VOLUME'
      );
    } while (returned < expected);
  }
  return all;
}

async function reportRows(client, id) {
  const result = [];
  let expected;
  for (;;) {
    const {
      data,
      count: total,
      error,
    } = await client
      .from('daily_reports')
      .select(
        'id,clinic_id,report_date,total_patients,total_revenue,insurance_revenue,private_revenue',
        { count: 'exact' }
      )
      .eq('clinic_id', id)
      .order('report_date')
      .order('id')
      .range(result.length, result.length + 249);
    if (error) throw databaseFailure(error, 'VERIFY_REPORTS');
    invariant(
      Array.isArray(data) && Number.isInteger(total),
      'REPORT_OR_EXACT_COUNT_RESPONSE_MISSING'
    );
    invariant(
      expected === undefined || expected === total,
      'VERIFY_SNAPSHOT_COUNT_CHANGED'
    );
    expected = total;
    invariant(
      data.length > 0 || result.length === total,
      'BLOCKED_DATA_API_PAGE_INCOMPLETE'
    );
    result.push(...data);
    invariant(
      result.length <= total && result.length <= 100000,
      'UNEXPECTED_REPORT_VOLUME'
    );
    if (result.length === total) return result;
  }
}

export function compareReportTotals(rows, profile, clinicIndex) {
  invariant(
    rows.length === profile.operatingDays,
    'DAILY_REPORT_COUNT_MISMATCH'
  );
  const countPerDay = completedPerDay(profile);
  const expected = new Map(
    Array.from({ length: profile.operatingDays }, (_, day) => {
      const row = reportFixture(profile, clinicIndex, day);
      return [row.id, row];
    })
  );
  const seen = new Set();
  for (const row of rows) {
    const planned = expected.get(row.id);
    invariant(planned && !seen.has(row.id), 'DAILY_REPORT_ID_MISMATCH');
    seen.add(row.id);
    invariant(
      row.clinic_id === planned.clinic_id &&
        row.report_date === planned.report_date,
      'DAILY_REPORT_SCOPE_OR_DATE_MISMATCH'
    );
    invariant(
      row.total_patients === countPerDay &&
        row.total_revenue === countPerDay * profile.fee &&
        row.private_revenue === countPerDay * profile.fee &&
        row.insurance_revenue === 0,
      'DAILY_REPORT_TOTAL_MISMATCH'
    );
  }
  return rows.reduce((total, row) => total + row.total_revenue, 0);
}

function compareReservation(row, expected) {
  invariant(
    row &&
      row.id === expected.id &&
      row.clinic_id === expected.clinic_id &&
      row.customer_id === expected.customer_id &&
      row.menu_id === expected.menu_id &&
      row.staff_id === expected.staff_id,
    'RESERVATION_ID_OR_SCOPE_MISMATCH'
  );
  invariant(
    row.status === expected.status &&
      Date.parse(row.start_time) === Date.parse(expected.start_time) &&
      Date.parse(row.end_time) === Date.parse(expected.end_time),
    'RESERVATION_STATUS_OR_TIME_MISMATCH'
  );
  if (expected.is_deleted !== undefined)
    invariant(
      row.is_deleted === expected.is_deleted,
      'RESERVATION_DELETION_MISMATCH'
    );
}

export async function verifyData({
  profile,
  target,
  flags,
  paths,
  client: suppliedClient,
  onProgress = () => {},
}) {
  assertExecutionAllowed(target, flags);
  const manifest = await readManifest(paths.manifest, profile, target);
  invariant(
    manifest.seedStatus === 'COMPLETE',
    'BLOCKED_COMPLETE_SEED_REQUIRED'
  );
  const client = suppliedClient ?? (await createSeedClient(target));
  let load;
  if (flags.loadResultFile) {
    load = JSON.parse(await readFile(flags.loadResultFile, 'utf8'));
    invariant(
      load.formatVersion === 1 &&
        load.profileHash === profileHash(profile) &&
        JSON.stringify(load.target) === JSON.stringify(target) &&
        Array.isArray(load.mutations),
      'LOAD_RESULT_TARGET_OR_PROFILE_MISMATCH'
    );
  } else
    invariant(
      !manifest.loadStartedAt,
      'BLOCKED_POST_LOAD_REQUIRES_LOAD_RESULT'
    );
  if (load?.mutationJournalFile) {
    invariant(
      typeof load.loadId === 'string' &&
        /^[0-9a-f-]{36}$/i.test(load.loadId) &&
        load.mutationJournalFile === `load-${load.loadId}-mutations.ndjson`,
      'LOAD_JOURNAL_PATH_INVALID'
    );
    const latest = new Map();
    try {
      const journal = await readFile(
        path.join(paths.root, load.mutationJournalFile),
        'utf8'
      );
      for (const line of journal.split('\n').filter(Boolean)) {
        const entry = JSON.parse(line);
        invariant(
          entry.profileHash === manifest.profileHash &&
            entry.loadId === load.loadId &&
            entry.mutation,
          'LOAD_JOURNAL_IDENTITY_MISMATCH'
        );
        latest.set(entry.mutation.id, entry.mutation);
      }
      load.mutations = [...latest.values()];
    } catch (error) {
      if (
        !error ||
        typeof error !== 'object' ||
        error.code !== 'ENOENT' ||
        load.mutations.length > 0
      )
        throw error;
    }
  }
  const mutations = load?.mutations ?? [];
  invariant(
    new Set(mutations.map(item => item.id)).size === mutations.length,
    'DUPLICATE_LOAD_RESERVATION_ID'
  );
  invariant(
    mutations.every(
      item =>
        item &&
        typeof item.id === 'string' &&
        /^[0-9a-f-]{36}$/i.test(item.id) &&
        manifest.clinicIds.includes(item.clinicId)
    ),
    'LOAD_MUTATION_SCOPE_INVALID'
  );
  const evidence = {
    formatVersion: 1,
    runId: profile.runId,
    profileHash: profileHash(profile),
    target,
    stage: load ? 'post-load' : 'post-seed',
    startedAt: new Date().toISOString(),
    status: 'IN_PROGRESS',
    checks: [],
    counts: {},
    totalRevenue: 0,
  };
  const evidenceFile = path.join(
    paths.root,
    load ? `verify-${load.loadId}.json` : 'verify-seed.json'
  );
  try {
    await assertDedicatedDatabase(client, manifest);
    const clinics = await rowsByIds(client, 'clinics', 'id,parent_id', [
      ...manifest.rootIds,
      ...manifest.clinicIds,
    ]);
    invariant(clinics.length === 110, 'CLINIC_COUNT_MISMATCH');
    for (let company = 0; company < 10; company++)
      invariant(
        clinics.some(
          row => row.id === rootId(profile, company) && row.parent_id === null
        ),
        'ORGANIZATION_ROOT_MISMATCH'
      );
    for (let clinic = 0; clinic < 100; clinic++) {
      const user = manifest.users.find(
        candidate => candidate.clinicIndex === clinic
      );
      invariant(
        user &&
          clinics.some(
            row =>
              row.id === clinicId(profile, clinic) &&
              row.parent_id === rootId(profile, user.company)
          ),
        'CLINIC_COMPANY_MISMATCH'
      );
    }
    evidence.checks.push({
      id: 'roots-and-operational-clinics',
      status: 'PASS',
    });
    const users = userFixtures(profile);
    const profiles = await rowsByIds(
      client,
      'profiles',
      'user_id,clinic_id,role,is_active',
      users.map(user => user.id),
      'user_id'
    );
    invariant(profiles.length === 500, 'PROFILE_COUNT_MISMATCH');
    for (const user of users)
      invariant(
        profiles.some(
          row =>
            row.user_id === user.id &&
            row.clinic_id === user.clinicId &&
            row.role === user.role &&
            row.is_active === user.active
        ),
        'PROFILE_SCOPE_ROLE_OR_ACTIVE_MISMATCH'
      );
    const permissions = await rowsByIds(
      client,
      'user_permissions',
      'staff_id,clinic_id,role',
      users.map(user => user.id),
      'staff_id'
    );
    invariant(permissions.length === 500, 'PERMISSION_COUNT_MISMATCH');
    for (const user of users)
      invariant(
        permissions.some(
          row =>
            row.staff_id === user.id &&
            row.clinic_id === user.clinicId &&
            row.role === user.role
        ),
        'PERMISSION_SCOPE_OR_ROLE_MISMATCH'
      );
    const staff = await rowsByIds(
      client,
      'staff',
      'id,clinic_id,role',
      users.map(user => user.id)
    );
    invariant(
      staff.length === 500 &&
        users.every(user =>
          staff.some(
            row =>
              row.id === user.id &&
              row.clinic_id === user.clinicId &&
              row.role === user.role
          )
        ),
      'STAFF_COUNT_SCOPE_OR_ROLE_MISMATCH'
    );
    const subscriptions = await rowsByIds(
      client,
      'subscriptions',
      'id,org_root_clinic_id,plan_code,billing_state,stripe_status,included_store_quantity,paid_extra_store_quantity',
      manifest.rootIds,
      'org_root_clinic_id'
    );
    invariant(subscriptions.length === 10, 'SUBSCRIPTION_COUNT_MISMATCH');
    for (const planned of tableRows(profile, 'subscriptions'))
      invariant(
        subscriptions.some(
          row =>
            row.id === planned.id &&
            row.org_root_clinic_id === planned.org_root_clinic_id &&
            row.plan_code === planned.plan_code &&
            row.billing_state === planned.billing_state &&
            row.stripe_status === planned.stripe_status &&
            row.included_store_quantity === planned.included_store_quantity &&
            row.paid_extra_store_quantity === planned.paid_extra_store_quantity
        ),
        'SUBSCRIPTION_ENTITLEMENT_MISMATCH'
      );
    evidence.counts.staff = staff.length;
    evidence.counts.subscriptions = subscriptions.length;
    const authIds = new Set();
    for (let page = 1; ; page++) {
      const { data, error } = await client.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) throw databaseFailure(error, 'VERIFY_AUTH');
      invariant(Array.isArray(data?.users), 'AUTH_USERS_RESPONSE_MISSING');
      for (const user of data.users)
        if (user.app_metadata?.core100_run_id === profile.runId)
          authIds.add(user.id);
      if (data.users.length < 1000) break;
      invariant(page <= 100, 'UNEXPECTED_AUTH_USER_VOLUME');
    }
    invariant(
      authIds.size === 500 && users.every(user => authIds.has(user.id)),
      'AUTH_USER_COUNT_OR_OWNERSHIP_MISMATCH'
    );
    const managers = users.filter(user => user.role === 'manager');
    const assignments = await rowsByIds(
      client,
      'manager_clinic_assignments',
      'manager_user_id,clinic_id,revoked_at',
      managers.map(user => user.id),
      'manager_user_id'
    );
    invariant(assignments.length === 400, 'MANAGER_ASSIGNMENT_COUNT_MISMATCH');
    for (const manager of managers) {
      const assigned = assignments.filter(
        row => row.manager_user_id === manager.id
      );
      invariant(
        assigned.length === manager.scopedClinicIndexes.length &&
          manager.scopedClinicIndexes.every(clinic =>
            assigned.some(
              row =>
                row.clinic_id === clinicId(profile, clinic) &&
                Boolean(row.revoked_at) === manager.assignmentsRevoked
            )
          ),
        'MANAGER_SCOPE_OR_REVOCATION_MISMATCH'
      );
    }
    evidence.checks.push({
      id: '500-auth-users-and-role-scope-fixtures',
      status: 'PASS',
    });
    const expectedByClinic = {
      customers: profile.customersPerClinic,
      menus: 1,
      resources: 5,
      reservations: profile.operatingDays * profile.reservationsPerDay,
      daily_report_items: profile.operatingDays * completedPerDay(profile),
    };
    const reservationSelect =
      'id,clinic_id,customer_id,menu_id,staff_id,start_time,end_time,status,is_deleted';
    for (let clinic = 0; clinic < 100; clinic++) {
      const id = clinicId(profile, clinic);
      for (const [table, expected] of Object.entries(expectedByClinic)) {
        const added =
          table === 'reservations'
            ? mutations.filter(row => row.clinicId === id).length
            : 0;
        const actual = await count(client, table, 'clinic_id', [id]);
        invariant(
          actual === expected + added,
          `${table.toUpperCase()}_COUNT_MISMATCH`
        );
        evidence.counts[table] = (evidence.counts[table] ?? 0) + actual;
      }
      const reports = await reportRows(client, id);
      evidence.totalRevenue += compareReportTotals(reports, profile, clinic);
      evidence.counts.daily_reports =
        (evidence.counts.daily_reports ?? 0) + reports.length;
      const planned = [];
      for (const day of new Set([0, profile.operatingDays - 1]))
        for (const slot of new Set([0, 1, profile.reservationsPerDay - 1]))
          planned.push(reservationFixture(profile, clinic, day, slot));
      const actual = await rowsByIds(
        client,
        'reservations',
        reservationSelect,
        planned.map(row => row.id)
      );
      invariant(actual.length === planned.length, 'KNOWN_RESERVATIONS_MISSING');
      for (const expected of planned)
        compareReservation(
          actual.find(row => row.id === expected.id),
          expected
        );
      if (clinic % 10 === 0)
        onProgress({ stage: 'verify-clinics', completed: clinic + 1 });
    }
    invariant(
      evidence.totalRevenue === manifest.expected.totalRevenue,
      'GLOBAL_REVENUE_MISMATCH'
    );
    evidence.checks.push({
      id: 'per-clinic-counts-report-totals-known-cancelled-and-deleted-reservations',
      status: 'PASS',
    });
    const actualMutations = await rowsByIds(
      client,
      'reservations',
      reservationSelect,
      mutations.map(item => item.id)
    );
    invariant(
      actualMutations.length === mutations.length,
      'ACKNOWLEDGED_RESERVATIONS_MISSING'
    );
    for (const item of mutations)
      compareReservation(
        actualMutations.find(row => row.id === item.id),
        {
          id: item.id,
          clinic_id: item.clinicId,
          customer_id: item.customerId,
          menu_id: item.menuId,
          staff_id: item.staffId,
          start_time: item.startTime,
          end_time: item.endTime,
          status: item.status,
          is_deleted: false,
        }
      );
    evidence.checks.push({
      id: 'all-acknowledged-load-reservations-readback',
      status: 'PASS',
      count: mutations.length,
    });
    evidence.status = 'PASS';
  } catch (error) {
    evidence.failureCode =
      error instanceof Error && /^[A-Za-z0-9_]+$/.test(error.message)
        ? error.message
        : 'DATA_VERIFICATION_FAILED';
    evidence.status = evidence.failureCode.startsWith('BLOCKED_')
      ? 'BLOCKED'
      : 'FAIL';
  }
  evidence.completedAt = new Date().toISOString();
  await saveJson(evidenceFile, evidence);
  if (!load) {
    manifest.seedVerification = {
      status: evidence.status,
      completedAt: evidence.completedAt,
      evidenceFile: path.basename(evidenceFile),
    };
    await saveJson(paths.manifest, manifest);
  }
  return {
    verificationStatus: evidence.status,
    evidenceFile,
    counts: evidence.counts,
    totalRevenue: evidence.totalRevenue,
  };
}
