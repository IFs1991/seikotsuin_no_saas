import {
  DEMO_VERSION,
  DEMO_CLINIC_IDS,
  USER_IDS,
  CLINIC_IDS,
  DEMO_IDS,
  demoUuid,
  shiftDateKey,
  toJstIso,
  addMinutes,
  isSunday,
} from './kkd-demo-base.mjs';

function buildShiftRequestData({
  resources,
  users,
  todayKey,
  futureDays,
  nowIso,
}) {
  const shiftRequestPeriods = [];
  const shiftRequests = [];
  const directorByClinic = new Map(
    users
      .filter(user => user.role === 'clinic_admin')
      .map(user => [user.clinicId, user])
  );
  const authUserIds = new Set(users.map(user => user.id));
  let requestSerial = 1;

  DEMO_CLINIC_IDS.forEach((clinicId, clinicIndex) => {
    const periodStart = shiftDateKey(todayKey, 7);
    const periodEnd = shiftDateKey(
      todayKey,
      Math.max(35, Math.min(futureDays + 21, 60))
    );
    const periodId = demoUuid(21, clinicIndex + 1);
    const director = directorByClinic.get(clinicId);
    shiftRequestPeriods.push({
      id: periodId,
      clinic_id: clinicId,
      title: `${periodStart.slice(0, 7)} 希望シフト受付`,
      period_start: periodStart,
      period_end: periodEnd,
      submission_deadline: toJstIso(shiftDateKey(todayKey, 5), 23, 59),
      status: 'open',
      created_by: director.id,
      updated_at: nowIso,
    });

    const clinicResources = resources.filter(resource => resource.clinic_id === clinicId);
    clinicResources.forEach((resource, resourceIndex) => {
      const preferredDate = shiftDateKey(periodStart, resourceIndex * 2);
      const isDirector = resource.display_order === 1;
      const submittedBy = authUserIds.has(resource.id) ? resource.id : director.id;
      const submittedForRole = isDirector
        ? 'clinic_admin'
        : resource._demo?.appRole === 'staff'
          ? 'staff'
          : 'therapist';
      const status = ['approved', 'submitted', 'rejected'][
        (clinicIndex + resourceIndex) % 3
      ];
      shiftRequests.push({
        id: demoUuid(22, requestSerial),
        clinic_id: clinicId,
        period_id: periodId,
        staff_id: resource.id,
        request_type: resourceIndex === 2 ? 'day_off' : 'preferred',
        start_time: toJstIso(preferredDate, 9, 0),
        end_time: toJstIso(preferredDate, 18, 0),
        priority: resourceIndex === 2 ? 5 : 4,
        status,
        note:
          resourceIndex === 2
            ? `[${DEMO_VERSION}] 研修参加のため休み希望`
            : `[${DEMO_VERSION}] 予約状況を踏まえた勤務希望`,
        submitted_by: submittedBy,
        submitted_for_role: submittedForRole,
        reviewed_by: status === 'submitted' ? null : director.id,
        reviewed_at: status === 'submitted' ? null : nowIso,
        rejection_reason:
          status === 'rejected'
            ? `[${DEMO_VERSION}] 予約需要との兼ね合いで再調整`
            : null,
        converted_shift_id: null,
        updated_at: nowIso,
      });
      requestSerial += 1;
    });
  });

  return { shiftRequestPeriods, shiftRequests };
}

function buildShiftsAndPreferences({
  resources,
  profileIdByResourceId,
  todayKey,
  futureDays,
  nowIso,
}) {
  const staffShifts = [];
  const staffPreferences = [];
  const blocks = [];
  let shiftSerial = 1;
  let preferenceSerial = 1;
  let blockSerial = 1;

  for (const resource of resources) {
    staffPreferences.push({
      id: demoUuid(12, preferenceSerial),
      clinic_id: resource.clinic_id,
      staff_id: resource.id,
      preference_text:
        resource.display_order === 1
          ? '平日は9:00〜18:00を基本とし、院運営対応日は夕方枠を調整'
          : resource.display_order === 2
            ? '火・水・金を優先。夕方の予約枠にも対応可能'
            : '土曜は17:00まで。月1回の研修日を希望',
      preference_type:
        resource.display_order === 1 ? 'shift_pattern' : 'time_preference',
      priority: resource.display_order === 3 ? 4 : 3,
      valid_from: todayKey,
      valid_until: shiftDateKey(todayKey, 90),
      is_active: true,
      updated_at: nowIso,
    });
    preferenceSerial += 1;

    for (let day = 0; day <= Math.min(futureDays, 14); day += 1) {
      const dateKey = shiftDateKey(todayKey, day);
      if (isSunday(dateKey)) continue;
      const start = toJstIso(dateKey, 9, 0);
      const end = toJstIso(dateKey, resource.display_order === 3 ? 17 : 18, 0);
      staffShifts.push({
        id: demoUuid(11, shiftSerial),
        clinic_id: resource.clinic_id,
        staff_id: resource.id,
        staff_profile_id: profileIdByResourceId.get(resource.id),
        home_clinic_id: resource.clinic_id,
        assignment_type: 'regular',
        time_preset: resource.display_order === 3 ? 'custom' : 'full_day',
        start_time: start,
        end_time: end,
        status: day <= 7 ? 'confirmed' : 'proposed',
        notes: `[${DEMO_VERSION}] デモシフト`,
        created_by: USER_IDS.admin,
        updated_at: nowIso,
      });
      shiftSerial += 1;
    }

    if (resource.display_order === 3) {
      const blockDate = shiftDateKey(todayKey, 3);
      const start = toJstIso(blockDate, 13, 0);
      blocks.push({
        id: demoUuid(16, blockSerial),
        clinic_id: resource.clinic_id,
        resource_id: resource.id,
        start_time: start,
        end_time: addMinutes(start, 120),
        reason: `[${DEMO_VERSION}] 社内研修`,
        block_type: 'training',
        is_active: true,
        created_by: USER_IDS.admin,
        is_deleted: false,
        updated_at: nowIso,
      });
      blockSerial += 1;
    }
  }

  return { staffShifts, staffPreferences, blocks };
}

function buildSubscription(todayKey, nowIso) {
  return {
    id: DEMO_IDS.subscription,
    org_root_clinic_id: CLINIC_IDS.root,
    plan_code: 'group',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_checkout_session_id: null,
    stripe_status: 'trialing',
    billing_state: 'trialing',
    included_store_quantity: 5,
    paid_extra_store_quantity: 0,
    current_period_start: toJstIso(todayKey, 0, 0),
    current_period_end: toJstIso(shiftDateKey(todayKey, 30), 0, 0),
    trial_end: toJstIso(shiftDateKey(todayKey, 30), 0, 0),
    trial_consumed: false,
    cancel_at_period_end: false,
    metadata: {
      demo_seed: DEMO_VERSION,
      synthetic: true,
      stripe_side_effects: 'disabled',
    },
    last_synced_at: nowIso,
    updated_at: nowIso,
  };
}

export { buildShiftRequestData, buildShiftsAndPreferences, buildSubscription };
