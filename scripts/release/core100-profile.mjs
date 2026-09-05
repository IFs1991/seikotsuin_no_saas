import { createHash } from 'node:crypto';

export const GENERATOR_VERSION = 1;
export const DISTRIBUTIONS = Object.freeze({
  A: Object.freeze(Array(10).fill(10)),
  B: Object.freeze([50, 6, 6, 6, 6, 6, 5, 5, 5, 5]),
});
export const SLO = Object.freeze({
  readP95Ms: 2000,
  writeP95Ms: 3000,
  aggregateP95Ms: 5000,
  unexpectedErrorRatio: 0.001,
});
export const PHASES = Object.freeze([
  { name: 'warmup', vus: 200, seconds: 300 },
  { name: 'normal', vus: 200, seconds: 1800 },
  { name: 'burst', vus: 400, seconds: 300 },
  { name: 'recovery', vus: 200, seconds: 300 },
]);

export function invariant(condition, code) {
  if (!condition) throw new Error(code);
}

export function fixtureId(runId, table, ordinal) {
  const bytes = createHash('sha256')
    .update(`${runId}:${table}:${ordinal}`)
    .digest();
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function dateAt(asOfDate, offset) {
  const date = new Date(`${asOfDate}T00:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + offset);
  return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

export function currentJstDate() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

export function createProfile(input) {
  invariant(input && typeof input === 'object', 'PROFILE_REQUIRED');
  invariant(
    typeof input.runId === 'string' &&
      /^[a-z][a-z0-9-]{2,39}$/.test(input.runId),
    'INVALID_RUN_ID'
  );
  invariant(
    input.distribution === 'A' || input.distribution === 'B',
    'INVALID_DISTRIBUTION'
  );
  invariant(
    typeof input.asOfDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate),
    'INVALID_AS_OF_DATE'
  );
  invariant(
    Number.isFinite(Date.parse(`${input.asOfDate}T00:00:00+09:00`)) &&
      dateAt(input.asOfDate, 0) === input.asOfDate,
    'INVALID_AS_OF_DATE'
  );
  invariant(
    input.scale === 'standard' || input.scale === 'smoke',
    'INVALID_SCALE'
  );
  const standard = input.scale === 'standard';
  const profile = {
    generatorVersion: GENERATOR_VERSION,
    releaseProfile: 'core-100',
    runId: input.runId,
    distribution: input.distribution,
    asOfDate: input.asOfDate,
    scale: input.scale,
    companies: 10,
    operationalClinics: 100,
    organizationRoots: 10,
    users: 500,
    customersPerClinic: standard ? 1000 : 10,
    operatingDays: standard ? 300 : 3,
    reservationsPerDay: standard ? 50 : 10,
    resourcesPerClinic: 5,
    fee: 6000,
    distributionCounts: [...DISTRIBUTIONS[input.distribution]],
    normalVus: 200,
    burstVus: 400,
    thinkMs: 10000,
    thresholds: { ...SLO },
    phases: PHASES.map(phase => ({ ...phase })),
  };
  return Object.freeze(profile);
}

export function profileHash(profile) {
  return createHash('sha256').update(JSON.stringify(profile)).digest('hex');
}

export function clinicCompany(profile, clinicIndex) {
  invariant(
    Number.isInteger(clinicIndex) && clinicIndex >= 0 && clinicIndex < 100,
    'INVALID_CLINIC_INDEX'
  );
  let boundary = 0;
  for (let company = 0; company < 10; company++) {
    boundary += profile.distributionCounts[company];
    if (clinicIndex < boundary) return company;
  }
  throw new Error('INVALID_DISTRIBUTION_TOTAL');
}

export function clinicIndexes(profile, company) {
  return Array.from({ length: 100 }, (_, i) => i).filter(
    i => clinicCompany(profile, i) === company
  );
}

export function clinicId(profile, clinicIndex) {
  return fixtureId(profile.runId, 'clinics', clinicIndex);
}

export function rootId(profile, company) {
  return fixtureId(profile.runId, 'roots', company);
}

export function userFixtures(profile) {
  return Array.from({ length: 500 }, (_, i) => {
    const role = i < 10 ? 'admin' : i < 50 ? 'manager' : 'staff';
    const assignedClinic = i >= 50 ? (i - 50) % 100 : null;
    const company =
      assignedClinic === null ? i % 10 : clinicCompany(profile, assignedClinic);
    const scope =
      assignedClinic === null
        ? clinicIndexes(profile, company)
        : [assignedClinic];
    return {
      id: fixtureId(profile.runId, 'auth', i),
      index: i,
      role,
      company,
      clinicIndex: assignedClinic,
      clinicId:
        assignedClinic === null
          ? rootId(profile, company)
          : clinicId(profile, assignedClinic),
      scopedClinicIndexes: scope,
      email: `core100-${profile.runId}-${i}@example.invalid`,
      fullName: `CORE100 ${profile.runId} user ${i}`,
      // Dedicated negative fixtures are never selected as normal-load users.
      active: i !== 499,
      assignmentsRevoked: i === 49,
    };
  });
}

export function reservationFixture(profile, clinicIndex, day, slot) {
  invariant(
    day >= 0 &&
      day < profile.operatingDays &&
      slot >= 0 &&
      slot < profile.reservationsPerDay,
    'INVALID_RESERVATION_ORDINAL'
  );
  const ordinal =
    clinicIndex * profile.operatingDays * profile.reservationsPerDay +
    day * profile.reservationsPerDay +
    slot;
  const customerOrdinal =
    clinicIndex * profile.customersPerClinic +
    ((day * profile.reservationsPerDay + slot) % profile.customersPerClinic);
  const reportDate = dateAt(profile.asOfDate, day - profile.operatingDays + 1);
  const start = new Date(`${reportDate}T09:00:00+09:00`);
  start.setTime(start.getTime() + Math.floor(slot / 5) * 30 * 60000);
  const cancelled = slot % 20 === 0;
  const deleted = slot % 50 === 49;
  return {
    id: fixtureId(profile.runId, 'reservations', ordinal),
    clinic_id: clinicId(profile, clinicIndex),
    customer_id: fixtureId(profile.runId, 'customers', customerOrdinal),
    menu_id: fixtureId(profile.runId, 'menus', clinicIndex),
    staff_id: fixtureId(
      profile.runId,
      'resources',
      clinicIndex * 5 + (slot % 5)
    ),
    start_time: start.toISOString(),
    end_time: new Date(start.getTime() + 30 * 60000).toISOString(),
    status: cancelled || deleted ? 'cancelled' : 'completed',
    channel: 'phone',
    price: profile.fee,
    actual_price: cancelled || deleted ? 0 : profile.fee,
    payment_status: cancelled || deleted ? 'unpaid' : 'paid',
    is_deleted: deleted,
    deleted_at: deleted ? `${reportDate}T15:00:00+09:00` : null,
    notes: `CORE100 ${profile.runId}`,
  };
}

export function reportFixture(profile, clinicIndex, day) {
  return {
    id: fixtureId(
      profile.runId,
      'daily_reports',
      clinicIndex * profile.operatingDays + day
    ),
    clinic_id: clinicId(profile, clinicIndex),
    report_date: dateAt(profile.asOfDate, day - profile.operatingDays + 1),
    total_patients: 0,
    new_patients: 0,
    total_revenue: 0,
    insurance_revenue: 0,
    private_revenue: 0,
    report_text: `CORE100 ${profile.runId}`,
  };
}

export function completedPerDay(profile) {
  return Array.from(
    { length: profile.reservationsPerDay },
    (_, slot) => slot
  ).filter(slot => slot % 20 !== 0 && slot % 50 !== 49).length;
}

export function expectedCounts(profile) {
  const days = profile.operatingDays * 100;
  const items = days * completedPerDay(profile);
  return {
    clinics: 110,
    authUsers: 500,
    profiles: 500,
    staff: 500,
    user_permissions: 500,
    manager_clinic_assignments: 400,
    subscriptions: 10,
    customers: profile.customersPerClinic * 100,
    menus: 100,
    resources: 500,
    reservations: days * profile.reservationsPerDay,
    daily_reports: days,
    daily_report_items: items,
    totalRevenue: items * profile.fee,
  };
}

export function* tableRows(profile, table) {
  const users = userFixtures(profile);
  if (table === 'roots') {
    for (let i = 0; i < 10; i++)
      yield {
        id: rootId(profile, i),
        name: `CORE100 ${profile.runId} company ${i}`,
        parent_id: null,
        is_active: true,
        billing_activation_status: 'active',
      };
    return;
  }
  if (table === 'clinics') {
    for (let i = 0; i < 100; i++)
      yield {
        id: clinicId(profile, i),
        name: `CORE100 ${profile.runId} clinic ${i}`,
        parent_id: rootId(profile, clinicCompany(profile, i)),
        is_active: true,
        billing_activation_status: 'active',
      };
    return;
  }
  if (
    table === 'profiles' ||
    table === 'staff' ||
    table === 'user_permissions'
  ) {
    for (const user of users) {
      if (table === 'profiles')
        yield {
          user_id: user.id,
          clinic_id: user.clinicId,
          email: user.email,
          full_name: user.fullName,
          role: user.role,
          is_active: user.active,
        };
      if (table === 'staff')
        yield {
          id: user.id,
          clinic_id: user.clinicId,
          email: user.email,
          name: user.fullName,
          role: user.role,
          password_hash: 'managed_by_supabase',
          is_therapist: false,
        };
      if (table === 'user_permissions')
        yield {
          id: fixtureId(profile.runId, table, user.index),
          staff_id: user.id,
          clinic_id: user.clinicId,
          username: user.email,
          role: user.role,
          hashed_password: 'managed_by_supabase',
        };
    }
    return;
  }
  if (table === 'manager_clinic_assignments') {
    for (const user of users.filter(user => user.role === 'manager')) {
      for (const index of user.scopedClinicIndexes)
        yield {
          id: fixtureId(profile.runId, table, `${user.index}:${index}`),
          manager_user_id: user.id,
          clinic_id: clinicId(profile, index),
          revoked_at: user.assignmentsRevoked
            ? `${profile.asOfDate}T00:00:00+09:00`
            : null,
        };
    }
    return;
  }
  if (table === 'subscriptions') {
    for (let i = 0; i < 10; i++)
      yield {
        id: fixtureId(profile.runId, table, i),
        org_root_clinic_id: rootId(profile, i),
        plan_code: 'group',
        billing_state: 'active',
        stripe_status: 'active',
        included_store_quantity: 5,
        paid_extra_store_quantity: Math.max(
          0,
          profile.distributionCounts[i] - 5
        ),
        metadata: { synthetic: true, core100_run_id: profile.runId },
      };
    return;
  }
  for (let clinic = 0; clinic < 100; clinic++) {
    const id = clinicId(profile, clinic);
    if (table === 'menus')
      yield {
        id: fixtureId(profile.runId, table, clinic),
        clinic_id: id,
        name: 'CORE100 self-pay 30',
        price: profile.fee,
        duration_minutes: 30,
        insurance_type: 'self_pay',
        is_active: true,
        is_public: false,
        is_deleted: false,
      };
    else if (table === 'resources') {
      for (let slot = 0; slot < 5; slot++)
        yield {
          id: fixtureId(profile.runId, table, clinic * 5 + slot),
          clinic_id: id,
          type: 'staff',
          name: `CORE100 resource ${slot}`,
          staff_code: `core100-${profile.runId}-${clinic}-${slot}`,
          supported_menus: [fixtureId(profile.runId, 'menus', clinic)],
          is_active: true,
          is_bookable: true,
          is_deleted: false,
          max_concurrent: 1,
          working_hours: {},
        };
    } else if (table === 'customers') {
      for (
        let customer = 0;
        customer < profile.customersPerClinic;
        customer++
      ) {
        const ordinal = clinic * profile.customersPerClinic + customer;
        yield {
          id: fixtureId(profile.runId, table, ordinal),
          clinic_id: id,
          name: `CORE100 patient ${String(customer).padStart(4, '0')}`,
          phone: `000${String(ordinal).padStart(8, '0')}`,
          email: null,
          line_user_id: null,
          consent_marketing: false,
          consent_reminder: false,
          is_deleted: false,
          custom_attributes: { synthetic: true, core100_run_id: profile.runId },
        };
      }
    } else if (
      table === 'reservations' ||
      table === 'daily_reports' ||
      table === 'daily_report_items'
    ) {
      for (let day = 0; day < profile.operatingDays; day++) {
        const report = reportFixture(profile, clinic, day);
        if (table === 'daily_reports') {
          yield report;
          continue;
        }
        for (let slot = 0; slot < profile.reservationsPerDay; slot++) {
          const reservation = reservationFixture(profile, clinic, day, slot);
          if (table === 'reservations') {
            yield reservation;
            continue;
          }
          if (reservation.status !== 'completed') continue;
          yield {
            id: fixtureId(profile.runId, table, reservation.id),
            clinic_id: id,
            daily_report_id: report.id,
            report_date: report.report_date,
            reservation_id: reservation.id,
            customer_id: reservation.customer_id,
            menu_id: reservation.menu_id,
            staff_resource_id: reservation.staff_id,
            patient_name: 'CORE100 synthetic patient',
            treatment_name: 'CORE100 self-pay 30',
            duration_minutes: 30,
            fee: profile.fee,
            billing_type: 'private',
            source: 'reservation',
            estimate_status:
              day === profile.operatingDays - 1 ? 'needs_review' : 'calculated',
            pricing_snapshot_status: 'confirmed',
          };
        }
      }
    } else throw new Error('UNKNOWN_FIXTURE_TABLE');
  }
}

export function* batches(rows, size = 500) {
  invariant(
    Number.isInteger(size) && size >= 1 && size <= 1000,
    'INVALID_BATCH_SIZE'
  );
  let batch = [];
  for (const row of rows) {
    batch.push(row);
    if (batch.length === size) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length) yield batch;
}

export function createManifest(profile, target) {
  return {
    formatVersion: 1,
    profile,
    profileHash: profileHash(profile),
    target,
    expected: expectedCounts(profile),
    rootIds: Array.from({ length: 10 }, (_, i) => rootId(profile, i)),
    clinicIds: Array.from({ length: 100 }, (_, i) => clinicId(profile, i)),
    users: userFixtures(profile),
    fixtureInventory: {
      generatorVersion: GENERATOR_VERSION,
      generator: 'scripts/release/core100-profile.mjs#tableRows',
      idAlgorithm: 'SHA256(runId:table:ordinal), UUIDv5-shaped, fixed variant',
      tables: [
        'roots',
        'clinics',
        'profiles',
        'staff',
        'user_permissions',
        'manager_clinic_assignments',
        'subscriptions',
        'menus',
        'resources',
        'customers',
        'reservations',
        'daily_reports',
        'daily_report_items',
      ],
    },
    seedStatus: 'NOT_RUN',
    capacityStatus: 'BLOCKED',
  };
}
