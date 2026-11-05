const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_HISTORY_DAYS = 56;
const DEFAULT_FUTURE_DAYS = 14;
const TIME_SLOTS = [
  [9, 0],
  [9, 30],
  [10, 0],
  [10, 30],
  [11, 0],
  [11, 30],
  [13, 0],
  [13, 30],
  [14, 0],
  [14, 30],
  [15, 0],
  [15, 30],
  [16, 0],
  [16, 30],
  [17, 0],
  [17, 30],
];

export const DEMO_VERSION = 'kkd-demo-v1';
export const DEMO_CONFIRMATION = 'SEED_KKD_DEMO_V1';
export const DEMO_RESET_CONFIRMATION = 'RESET_KKD_DEMO_V1';
export const DEMO_HOSTED_CONFIRMATION = 'ALLOW_HOSTED_KKD_DEMO_V1';
export const DEMO_EMAIL_DOMAIN = 'demo.tiramisu.invalid';

function demoUuid(group, serial) {
  if (!Number.isInteger(group) || group < 0 || group > 0xffff) {
    throw new Error(`Invalid UUID group: ${group}`);
  }
  if (!Number.isInteger(serial) || serial < 0) {
    throw new Error(`Invalid UUID serial: ${serial}`);
  }

  const head = (0xde000000 + group).toString(16).padStart(8, '0');
  const tail = serial.toString(16).padStart(12, '0');
  return `${head}-0000-4000-8000-${tail}`;
}

function toDateKey(date) {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toJstIso(dateKey, hour, minute = 0) {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${dateKey}T${hh}:${mm}:00+09:00`).toISOString();
}

function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function isSunday(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay() === 0;
}

function makeEmail(localPart) {
  return `${localPart}@${DEMO_EMAIL_DOMAIN}`;
}

function scenarioForClinic(clinicIndex) {
  return [
    {
      code: 'growth',
      label: '好調・継続率が高い',
      reportText: '売上・継続率ともに安定。自費メニューの提案が機能しています。',
      missingOffsets: [],
    },
    {
      code: 'retention-gap',
      label: '新規は多いが再来率が低い',
      reportText: '新規流入は強い一方、2回目来院への転換に改善余地があります。',
      missingOffsets: [-13, -27, -41],
    },
    {
      code: 'capacity',
      label: '高稼働だがスタッフ偏在',
      reportText: '予約枠は高稼働。特定スタッフへの集中を平準化する必要があります。',
      missingOffsets: [],
    },
  ][clinicIndex - 1];
}

const CLINIC_IDS = {
  root: demoUuid(1, 1),
  shibuya: demoUuid(1, 101),
  yokohama: demoUuid(1, 102),
  kawasaki: demoUuid(1, 103),
};

const USER_IDS = {
  admin: demoUuid(2, 1),
  manager: demoUuid(2, 2),
  shibuyaDirector: demoUuid(2, 101),
  shibuyaTherapist: demoUuid(2, 102),
  yokohamaDirector: demoUuid(2, 201),
  yokohamaTherapist: demoUuid(2, 202),
  kawasakiDirector: demoUuid(2, 301),
  kawasakiTherapist: demoUuid(2, 302),
};

export const DEMO_IDS = {
  clinics: CLINIC_IDS,
  users: USER_IDS,
  subscription: demoUuid(17, 1),
};

export const DEMO_CLINIC_IDS = [
  CLINIC_IDS.shibuya,
  CLINIC_IDS.yokohama,
  CLINIC_IDS.kawasaki,
];

export const DEMO_USER_IDS = Object.values(USER_IDS);

function buildClinics() {
  return [
    {
      id: CLINIC_IDS.root,
      name: 'KKDデモ 本部',
      address: '東京都 デモ本部',
      phone_number: '000-0000-0000',
      opening_date: '2020-01-01',
      is_active: true,
      parent_id: null,
    },
    {
      id: CLINIC_IDS.shibuya,
      name: 'KKDデモ 渋谷院',
      address: '東京都渋谷区 デモ1-1-1',
      phone_number: '000-1000-0101',
      opening_date: '2021-04-01',
      is_active: true,
      parent_id: CLINIC_IDS.root,
    },
    {
      id: CLINIC_IDS.yokohama,
      name: 'KKDデモ 横浜院',
      address: '神奈川県横浜市 デモ2-2-2',
      phone_number: '000-1000-0102',
      opening_date: '2022-06-01',
      is_active: true,
      parent_id: CLINIC_IDS.root,
    },
    {
      id: CLINIC_IDS.kawasaki,
      name: 'KKDデモ 川崎院',
      address: '神奈川県川崎市 デモ3-3-3',
      phone_number: '000-1000-0103',
      opening_date: '2023-02-01',
      is_active: true,
      parent_id: CLINIC_IDS.root,
    },
  ];
}

function buildUsers() {
  const allClinicScope = [CLINIC_IDS.root, ...DEMO_CLINIC_IDS];
  return [
    {
      id: USER_IDS.admin,
      email: makeEmail('admin'),
      fullName: '本部デモ管理者',
      role: 'admin',
      clinicId: CLINIC_IDS.root,
      clinicScopeIds: allClinicScope,
      resource: false,
    },
    {
      id: USER_IDS.manager,
      email: makeEmail('area-manager'),
      fullName: '山田 エリアマネージャー',
      role: 'manager',
      clinicId: CLINIC_IDS.root,
      clinicScopeIds: [...DEMO_CLINIC_IDS],
      resource: false,
    },
    {
      id: USER_IDS.shibuyaDirector,
      email: makeEmail('shibuya-director'),
      fullName: '佐藤 渋谷院長',
      role: 'clinic_admin',
      clinicId: CLINIC_IDS.shibuya,
      clinicScopeIds: [CLINIC_IDS.shibuya],
      resource: true,
      clinicIndex: 1,
      resourceRole: '院長',
    },
    {
      id: USER_IDS.shibuyaTherapist,
      email: makeEmail('shibuya-therapist'),
      fullName: '田中 渋谷施術者',
      role: 'therapist',
      clinicId: CLINIC_IDS.shibuya,
      clinicScopeIds: [CLINIC_IDS.shibuya],
      resource: true,
      clinicIndex: 1,
      resourceRole: '施術者',
    },
    {
      id: USER_IDS.yokohamaDirector,
      email: makeEmail('yokohama-director'),
      fullName: '鈴木 横浜院長',
      role: 'clinic_admin',
      clinicId: CLINIC_IDS.yokohama,
      clinicScopeIds: [CLINIC_IDS.yokohama],
      resource: true,
      clinicIndex: 2,
      resourceRole: '院長',
    },
    {
      id: USER_IDS.yokohamaTherapist,
      email: makeEmail('yokohama-therapist'),
      fullName: '伊藤 横浜施術者',
      role: 'therapist',
      clinicId: CLINIC_IDS.yokohama,
      clinicScopeIds: [CLINIC_IDS.yokohama],
      resource: true,
      clinicIndex: 2,
      resourceRole: '施術者',
    },
    {
      id: USER_IDS.kawasakiDirector,
      email: makeEmail('kawasaki-director'),
      fullName: '高橋 川崎院長',
      role: 'clinic_admin',
      clinicId: CLINIC_IDS.kawasaki,
      clinicScopeIds: [CLINIC_IDS.kawasaki],
      resource: true,
      clinicIndex: 3,
      resourceRole: '院長',
    },
    {
      id: USER_IDS.kawasakiTherapist,
      email: makeEmail('kawasaki-therapist'),
      fullName: '渡辺 川崎施術者',
      role: 'therapist',
      clinicId: CLINIC_IDS.kawasaki,
      clinicScopeIds: [CLINIC_IDS.kawasaki],
      resource: true,
      clinicIndex: 3,
      resourceRole: '施術者',
    },
  ];
}

function buildProfiles(users, nowIso) {
  return users.map(user => ({
    id: user.id,
    user_id: user.id,
    clinic_id: user.clinicId,
    email: user.email,
    full_name: user.fullName,
    role: user.role,
    is_active: true,
    language_preference: 'ja',
    timezone: 'Asia/Tokyo',
    last_login_at: nowIso,
    updated_at: nowIso,
  }));
}

function buildPermissions(users, nowIso) {
  return users.map(user => ({
    staff_id: user.id,
    clinic_id: user.clinicId,
    role: user.role,
    username: user.email,
    hashed_password: 'managed_by_supabase',
    updated_at: nowIso,
  }));
}

function buildManagerAssignments(nowIso) {
  return DEMO_CLINIC_IDS.map((clinicId, index) => ({
    id: demoUuid(9, index + 1),
    manager_user_id: USER_IDS.manager,
    clinic_id: clinicId,
    assigned_by: USER_IDS.admin,
    assigned_at: nowIso,
    revoked_by: null,
    revoked_at: null,
    revoke_reason: null,
    updated_at: nowIso,
  }));
}

function buildOnboardingStates(users, nowIso) {
  return users.map((user, index) => ({
    id: demoUuid(18, index + 1),
    user_id: user.id,
    clinic_id: user.clinicId,
    current_step: 'completed',
    completed_at: nowIso,
    metadata: {
      demo_seed: DEMO_VERSION,
      source: 'scripts/demo/kkd-demo-seed.mjs',
    },
    updated_at: nowIso,
  }));
}

function buildClinicSettings(nowIso) {
  const categories = [
    {
      category: 'clinic_basic',
      settings: { timezone: 'Asia/Tokyo', locale: 'ja-JP', demo: true },
    },
    {
      category: 'clinic_hours',
      settings: {
        weekdays: { open: '09:00', close: '19:00' },
        sunday: { closed: true },
      },
    },
    {
      category: 'booking_calendar',
      settings: { slotMinutes: 30, allowWebBooking: true, reminderHours: 24 },
    },
  ];

  return DEMO_CLINIC_IDS.flatMap((clinicId, clinicOffset) =>
    categories.map((entry, categoryOffset) => ({
      id: demoUuid(10, clinicOffset * 10 + categoryOffset + 1),
      clinic_id: clinicId,
      category: entry.category,
      settings: { ...entry.settings, demo_seed: DEMO_VERSION },
      updated_by: USER_IDS.admin,
      updated_at: nowIso,
    }))
  );
}

function buildClinicFeatureFlags(nowIso) {
  return DEMO_CLINIC_IDS.map(clinicId => ({
    clinic_id: clinicId,
    line_booking_enabled: false,
    mobile_uiux_enabled: true,
    mobile_uiux_real_data_enabled: true,
    mobile_uiux_write_enabled: true,
    mobile_uiux_reservation_write_enabled: true,
    mobile_uiux_daily_report_write_enabled: true,
    mobile_uiux_settings_write_enabled: true,
    rollout_phase: 'pilot',
    updated_by: USER_IDS.admin,
    updated_at: nowIso,
  }));
}

function buildMenus(users, nowIso) {
  const definitions = [
    {
      key: 'insurance',
      name: '保険施術 30分',
      code: 'INS-30',
      category: 'insurance',
      price: 1800,
      duration: 30,
      insuranceType: 'insurance',
      context: 'insurance',
      insuranceApplicable: true,
    },
    {
      key: 'alignment',
      name: '骨盤・姿勢矯正 45分',
      code: 'SELF-45',
      category: 'self_pay',
      price: 5500,
      duration: 45,
      insuranceType: 'self_pay',
      context: 'private',
      insuranceApplicable: false,
    },
    {
      key: 'acupuncture',
      name: '鍼灸コンディショニング 60分',
      code: 'ACU-60',
      category: 'self_pay',
      price: 7200,
      duration: 60,
      insuranceType: 'self_pay',
      context: 'private',
      insuranceApplicable: false,
    },
  ];

  const menus = [];
  for (let clinicIndex = 1; clinicIndex <= 3; clinicIndex += 1) {
    const clinicId = DEMO_CLINIC_IDS[clinicIndex - 1];
    const director = users.find(
      user => user.clinicIndex === clinicIndex && user.role === 'clinic_admin'
    );
    for (let menuIndex = 0; menuIndex < definitions.length; menuIndex += 1) {
      const definition = definitions[menuIndex];
      menus.push({
        id: demoUuid(3, clinicIndex * 100 + menuIndex + 1),
        clinic_id: clinicId,
        name: definition.name,
        description: `[${DEMO_VERSION}] ${definition.name}のデモメニュー`,
        code: `${definition.code}-${clinicIndex}`,
        category: definition.category,
        price: definition.price,
        duration_minutes: definition.duration,
        insurance_type: definition.insuranceType,
        is_insurance_applicable: definition.insuranceApplicable,
        treatment_type: definition.key,
        display_order: menuIndex + 1,
        is_active: true,
        is_public: true,
        is_deleted: false,
        created_by: director.id,
        updated_at: nowIso,
        _demo: {
          key: definition.key,
          revenueContextCode: definition.context,
        },
      });
    }
  }
  return menus;
}

function buildResources(users, menus, nowIso) {
  const resources = [];
  const legacyStaff = [];

  for (let clinicIndex = 1; clinicIndex <= 3; clinicIndex += 1) {
    const clinicId = DEMO_CLINIC_IDS[clinicIndex - 1];
    const clinicUsers = users.filter(
      user => user.clinicIndex === clinicIndex && user.resource
    );
    const assistantId = demoUuid(2, clinicIndex * 100 + 3);
    const assistantName = ['小林 渋谷施術者', '加藤 横浜施術者', '吉田 川崎施術者'][
      clinicIndex - 1
    ];
    const assistantEmail = makeEmail(`clinic-${clinicIndex}-assistant`);
    const clinicMenuIds = menus
      .filter(menu => menu.clinic_id === clinicId)
      .map(menu => menu.id);

    const definitions = [
      ...clinicUsers.map(user => ({
        id: user.id,
        name: user.fullName,
        email: user.email,
        role: user.resourceRole,
        appRole: user.role,
      })),
      {
        id: assistantId,
        name: assistantName,
        email: assistantEmail,
        role: '施術者',
        appRole: 'therapist',
      },
    ];

    definitions.forEach((definition, index) => {
      resources.push({
        id: definition.id,
        clinic_id: clinicId,
        name: definition.name,
        type: 'staff',
        staff_code: `KKD-DEMO-${clinicIndex}-${index + 1}`,
        email: definition.email,
        phone: `000-200${clinicIndex}-${String(index + 1).padStart(4, '0')}`,
        specialties:
          index === 0
            ? ['院運営', '自費提案']
            : index === 1
              ? ['鍼灸', '運動器']
              : ['柔道整復', '予約運用'],
        qualifications: index === 1 ? ['はり師', 'きゅう師'] : ['柔道整復師'],
        working_hours: {
          monday: { start: '09:00', end: '19:00' },
          tuesday: { start: '09:00', end: '19:00' },
          wednesday: { start: '09:00', end: '19:00' },
          thursday: { start: '09:00', end: '19:00' },
          friday: { start: '09:00', end: '19:00' },
          saturday: { start: '09:00', end: '18:00' },
        },
        max_concurrent: 1,
        supported_menus: clinicMenuIds,
        display_order: index + 1,
        is_active: true,
        is_bookable: true,
        is_deleted: false,
        created_by: clinicUsers[0].id,
        updated_at: nowIso,
        _demo: { appRole: definition.appRole },
      });

      legacyStaff.push({
        id: definition.id,
        clinic_id: clinicId,
        name: definition.name,
        role: definition.appRole,
        hire_date: '2024-04-01',
        is_therapist: true,
        email: definition.email,
        password_hash: 'managed_by_supabase',
        updated_at: nowIso,
      });
    });
  }

  return { resources, legacyStaff };
}

function buildStaffProfilesAndMemberships(resources, users, nowIso) {
  const userIdSet = new Set(users.map(user => user.id));
  const staffProfiles = [];
  const staffClinicMemberships = [];
  const profileIdByResourceId = new Map();

  resources.forEach((resource, index) => {
    const staffProfileId = demoUuid(19, index + 1);
    profileIdByResourceId.set(resource.id, staffProfileId);
    staffProfiles.push({
      id: staffProfileId,
      user_id: userIdSet.has(resource.id) ? resource.id : null,
      display_name: resource.name,
      is_active: true,
      updated_at: nowIso,
    });
    staffClinicMemberships.push({
      id: demoUuid(20, index + 1),
      staff_profile_id: staffProfileId,
      clinic_id: resource.clinic_id,
      resource_id: resource.id,
      membership_type: 'home',
      can_help: resource.display_order !== 1,
      priority: resource.display_order === 1 ? 1 : 3,
      updated_at: nowIso,
    });
  });

  return { staffProfiles, staffClinicMemberships, profileIdByResourceId };
}

function buildMenuBillingProfiles(menus, todayKey, nowIso) {
  return menus.map((menu, index) => {
    const context = menu._demo.revenueContextCode;
    return {
      id: demoUuid(13, index + 1),
      clinic_id: menu.clinic_id,
      menu_id: menu.id,
      source_template_profile_id: null,
      revenue_context_code: context,
      calculation_method:
        context === 'insurance' ? 'insurance_master' : 'fixed_amount',
      fixed_amount_yen: context === 'insurance' ? null : menu.price,
      default_patient_burden_rate: context === 'insurance' ? 30 : null,
      profession_type: context === 'insurance' ? 'judo_therapist' : null,
      requires_review: false,
      effective_from: shiftDateKey(todayKey, -365),
      effective_to: null,
      is_active: true,
      is_deleted: false,
      created_by: USER_IDS.admin,
      updated_by: USER_IDS.admin,
      updated_at: nowIso,
      _demo: { menuId: menu.id },
    };
  });
}

export {
  DEFAULT_HISTORY_DAYS,
  DEFAULT_FUTURE_DAYS,
  TIME_SLOTS,
  demoUuid,
  toDateKey,
  shiftDateKey,
  toJstIso,
  addMinutes,
  isSunday,
  scenarioForClinic,
  makeEmail,
  CLINIC_IDS,
  USER_IDS,
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
};
