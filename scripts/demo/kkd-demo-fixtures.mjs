import {
  DEFAULT_HISTORY_DAYS,
  DEFAULT_FUTURE_DAYS,
  DEMO_VERSION,
  DEMO_CLINIC_IDS,
  toDateKey,
  buildClinics,
  buildUsers,
  buildProfiles,
  buildPermissions,
  buildManagerAssignments,
  buildOnboardingStates,
  buildClinicSettings,
  buildClinicFeatureFlags,
  buildMenus,
  buildResources,
  buildStaffProfilesAndMemberships,
  buildMenuBillingProfiles,
} from './kkd-demo-base.mjs';
import {
  buildCustomers,
  buildInsuranceCoverages,
  buildReservations,
} from './kkd-demo-activity.mjs';
import { buildReportsAndItems, buildAiComments } from './kkd-demo-reporting.mjs';
import {
  buildShiftRequestData,
  buildShiftsAndPreferences,
  buildSubscription,
} from './kkd-demo-workforce.mjs';

export {
  DEMO_VERSION,
  DEMO_CONFIRMATION,
  DEMO_RESET_CONFIRMATION,
  DEMO_HOSTED_CONFIRMATION,
  DEMO_EMAIL_DOMAIN,
  DEMO_IDS,
  DEMO_CLINIC_IDS,
  DEMO_USER_IDS,
} from './kkd-demo-base.mjs';

function stripDemoMetadata(rows) {
  return rows.map(({ _demo, ...row }) => row);
}

function collectIds(dataset) {
  const entries = [];
  for (const [name, value] of Object.entries(dataset)) {
    if (!Array.isArray(value)) continue;
    value.forEach((row, index) => {
      if (row && typeof row === 'object' && typeof row.id === 'string') {
        entries.push({ table: name, index, id: row.id });
      }
    });
  }
  return entries;
}

export function validateKkdDemoDataset(dataset) {
  const errors = [];
  const idsByTable = new Map();
  for (const entry of collectIds(dataset)) {
    const tableIds = idsByTable.get(entry.table) ?? new Set();
    if (tableIds.has(entry.id)) {
      errors.push(`Duplicate id in ${entry.table}: ${entry.id}`);
    }
    tableIds.add(entry.id);
    idsByTable.set(entry.table, tableIds);
  }

  const clinicIds = new Set(dataset.clinics.map(row => row.id));
  const childClinicIds = new Set(DEMO_CLINIC_IDS);
  const customerIds = new Set(dataset.customers.map(row => row.id));
  const menuIds = new Set(dataset.menus.map(row => row.id));
  const resourceIds = new Set(dataset.resources.map(row => row.id));
  const reservationIds = new Set(dataset.reservations.map(row => row.id));
  const reportIds = new Set(dataset.dailyReports.map(row => row.id));
  const itemIds = new Set(dataset.dailyReportItems.map(row => row.id));
  const userIds = new Set(dataset.users.map(row => row.id));
  const staffProfileIds = new Set(dataset.staffProfiles.map(row => row.id));
  const shiftPeriodIds = new Set(dataset.shiftRequestPeriods.map(row => row.id));

  for (const clinic of dataset.clinics) {
    if (clinic.parent_id && !clinicIds.has(clinic.parent_id)) {
      errors.push(`Unknown parent clinic for ${clinic.id}`);
    }
  }
  for (const assignment of dataset.managerAssignments) {
    if (!childClinicIds.has(assignment.clinic_id)) {
      errors.push(`Manager assignment is not a demo child clinic: ${assignment.clinic_id}`);
    }
    if (!userIds.has(assignment.manager_user_id)) {
      errors.push(`Unknown manager user: ${assignment.manager_user_id}`);
    }
  }
  for (const membership of dataset.staffClinicMemberships) {
    if (!staffProfileIds.has(membership.staff_profile_id)) {
      errors.push(`Unknown staff profile for membership ${membership.id}`);
    }
    if (!resourceIds.has(membership.resource_id)) {
      errors.push(`Unknown resource for membership ${membership.id}`);
    }
  }
  for (const request of dataset.shiftRequests) {
    if (!shiftPeriodIds.has(request.period_id)) {
      errors.push(`Unknown shift request period for ${request.id}`);
    }
    if (!resourceIds.has(request.staff_id)) {
      errors.push(`Unknown shift request resource for ${request.id}`);
    }
    if (!(new Date(request.end_time) > new Date(request.start_time))) {
      errors.push(`Invalid shift request window ${request.id}`);
    }
  }
  for (const shift of dataset.staffShifts) {
    if (!resourceIds.has(shift.staff_id)) errors.push(`Unknown shift staff ${shift.id}`);
    if (!staffProfileIds.has(shift.staff_profile_id)) {
      errors.push(`Unknown shift staff profile ${shift.id}`);
    }
    if (!(new Date(shift.end_time) > new Date(shift.start_time))) {
      errors.push(`Invalid shift window ${shift.id}`);
    }
  }
  for (const reservation of dataset.reservations) {
    if (!childClinicIds.has(reservation.clinic_id)) errors.push(`Unknown reservation clinic ${reservation.id}`);
    if (!customerIds.has(reservation.customer_id)) errors.push(`Unknown reservation customer ${reservation.id}`);
    if (!menuIds.has(reservation.menu_id)) errors.push(`Unknown reservation menu ${reservation.id}`);
    if (!resourceIds.has(reservation.staff_id)) errors.push(`Unknown reservation staff ${reservation.id}`);
    if (!(new Date(reservation.end_time) > new Date(reservation.start_time))) {
      errors.push(`Invalid reservation window ${reservation.id}`);
    }
  }
  for (const item of dataset.dailyReportItems) {
    if (!reportIds.has(item.daily_report_id)) errors.push(`Unknown daily report for item ${item.id}`);
    if (item.reservation_id && !reservationIds.has(item.reservation_id)) {
      errors.push(`Unknown reservation for item ${item.id}`);
    }
    if (item.customer_id && !customerIds.has(item.customer_id)) errors.push(`Unknown customer for item ${item.id}`);
    if (item.menu_id && !menuIds.has(item.menu_id)) errors.push(`Unknown menu for item ${item.id}`);
    if (item.staff_resource_id && !resourceIds.has(item.staff_resource_id)) {
      errors.push(`Unknown staff resource for item ${item.id}`);
    }
  }
  for (const tag of dataset.dailyReportItemTags) {
    if (!itemIds.has(tag.daily_report_item_id)) errors.push(`Unknown tagged item ${tag.id}`);
  }

  const reportKeySet = new Set(
    dataset.dailyReports.map(report => `${report.clinic_id}:${report.report_date}`)
  );
  for (const item of dataset.dailyReportItems) {
    if (!reportKeySet.has(`${item.clinic_id}:${item.report_date}`)) {
      errors.push(`Missing clinic/date report for item ${item.id}`);
    }
  }

  const expectedAssignments = new Set(DEMO_CLINIC_IDS);
  const actualAssignments = new Set(dataset.managerAssignments.map(row => row.clinic_id));
  if (expectedAssignments.size !== actualAssignments.size) {
    errors.push('Manager assignment count does not match demo clinic count');
  }

  if (errors.length > 0) {
    throw new Error(`KKD demo dataset validation failed:\n- ${errors.join('\n- ')}`);
  }

  return {
    clinics: dataset.clinics.length,
    users: dataset.users.length,
    resources: dataset.resources.length,
    staffProfiles: dataset.staffProfiles.length,
    shiftRequestPeriods: dataset.shiftRequestPeriods.length,
    shiftRequests: dataset.shiftRequests.length,
    customers: dataset.customers.length,
    reservations: dataset.reservations.length,
    dailyReports: dataset.dailyReports.length,
    dailyReportItems: dataset.dailyReportItems.length,
    managerAssignments: dataset.managerAssignments.length,
  };
}

export function buildKkdDemoDataset(options = {}) {
  const todayKey = options.todayKey ?? toDateKey(new Date());
  const historyDays = Number(options.historyDays ?? DEFAULT_HISTORY_DAYS);
  const futureDays = Number(options.futureDays ?? DEFAULT_FUTURE_DAYS);
  if (!Number.isInteger(historyDays) || historyDays < 30 || historyDays > 180) {
    throw new Error('historyDays must be an integer between 30 and 180');
  }
  if (!Number.isInteger(futureDays) || futureDays < 7 || futureDays > 60) {
    throw new Error('futureDays must be an integer between 7 and 60');
  }
  const nowIso = options.nowIso ?? new Date().toISOString();

  const clinics = buildClinics();
  const users = buildUsers();
  const profiles = buildProfiles(users, nowIso);
  const userPermissions = buildPermissions(users, nowIso);
  const managerAssignments = buildManagerAssignments(nowIso);
  const onboardingStates = buildOnboardingStates(users, nowIso);
  const clinicSettings = buildClinicSettings(nowIso);
  const clinicFeatureFlags = buildClinicFeatureFlags(nowIso);
  const menusWithMeta = buildMenus(users, nowIso);
  const { resources: resourcesWithMeta, legacyStaff } = buildResources(
    users,
    menusWithMeta,
    nowIso
  );
  const authorityStaff = [
    ...legacyStaff,
    ...users.filter(user => !user.resource).map(user => ({
      id: user.id,
      clinic_id: user.clinicId,
      name: user.fullName,
      role: user.role,
      hire_date: '2024-04-01',
      is_therapist: false,
      email: user.email,
      password_hash: 'managed_by_supabase',
      updated_at: nowIso,
    })),
  ];
  const { staffProfiles, staffClinicMemberships, profileIdByResourceId } =
    buildStaffProfilesAndMemberships(resourcesWithMeta, users, nowIso);
  const menuBillingProfilesWithMeta = buildMenuBillingProfiles(
    menusWithMeta,
    todayKey,
    nowIso
  );
  const customersWithMeta = buildCustomers(
    users,
    todayKey,
    historyDays,
    nowIso
  );
  const insuranceCoveragesWithMeta = buildInsuranceCoverages(
    customersWithMeta,
    todayKey,
    nowIso
  );
  const { reservations, reservationMeta } = buildReservations({
    customers: customersWithMeta,
    menus: menusWithMeta,
    resources: resourcesWithMeta,
    users,
    todayKey,
    historyDays,
    futureDays,
    nowIso,
  });
  const { dailyReports, dailyReportItems, dailyReportItemTags } =
    buildReportsAndItems({
      customers: customersWithMeta,
      menus: menusWithMeta,
      menuBillingProfiles: menuBillingProfilesWithMeta,
      insuranceCoverages: insuranceCoveragesWithMeta,
      reservations,
      reservationMeta,
      users,
      todayKey,
      historyDays,
      nowIso,
    });
  const aiComments = buildAiComments(todayKey, historyDays, nowIso);
  const { shiftRequestPeriods, shiftRequests } = buildShiftRequestData({
    resources: resourcesWithMeta,
    users,
    todayKey,
    futureDays,
    nowIso,
  });
  const { staffShifts, staffPreferences, blocks } = buildShiftsAndPreferences({
    resources: resourcesWithMeta,
    profileIdByResourceId,
    todayKey,
    futureDays,
    nowIso,
  });

  const dataset = {
    metadata: {
      version: DEMO_VERSION,
      todayKey,
      historyDays,
      futureDays,
      generatedAt: nowIso,
    },
    clinics,
    users,
    profiles,
    userPermissions,
    managerAssignments,
    onboardingStates,
    clinicSettings,
    clinicFeatureFlags,
    menus: stripDemoMetadata(menusWithMeta),
    resources: stripDemoMetadata(resourcesWithMeta),
    legacyStaff: authorityStaff,
    staffProfiles,
    staffClinicMemberships,
    menuBillingProfiles: stripDemoMetadata(menuBillingProfilesWithMeta),
    customers: stripDemoMetadata(customersWithMeta),
    insuranceCoverages: stripDemoMetadata(insuranceCoveragesWithMeta),
    reservations,
    dailyReports,
    dailyReportItems,
    dailyReportItemTags,
    aiComments,
    shiftRequestPeriods,
    shiftRequests,
    staffShifts,
    staffPreferences,
    blocks,
    subscription: buildSubscription(todayKey, nowIso),
  };

  validateKkdDemoDataset(dataset);
  return dataset;
}
