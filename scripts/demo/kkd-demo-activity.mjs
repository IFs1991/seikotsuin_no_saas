import {
  TIME_SLOTS,
  DEMO_VERSION,
  DEMO_CLINIC_IDS,
  USER_IDS,
  demoUuid,
  shiftDateKey,
  toJstIso,
  addMinutes,
  isSunday,
  scenarioForClinic,
  makeEmail,
} from './kkd-demo-base.mjs';

const FAMILY_NAMES = [
  '青木',
  '阿部',
  '池田',
  '石井',
  '井上',
  '遠藤',
  '岡田',
  '小川',
  '加藤',
  '木村',
  '小林',
  '斎藤',
  '佐々木',
  '清水',
  '高木',
  '高田',
  '中川',
  '中島',
  '中村',
  '林',
  '藤田',
  '前田',
  '松本',
  '森',
  '山口',
  '山本',
  '吉田',
  '渡辺',
];
const GIVEN_NAMES = [
  '葵',
  '彩',
  '一郎',
  '海斗',
  '健',
  '健太',
  'さくら',
  '翔',
  '大輔',
  '拓海',
  '直子',
  '花',
  '春香',
  '誠',
  '美咲',
  '美穂',
  '優',
  '優子',
  '陽一',
  '亮',
];

function customerCountForClinic(clinicIndex) {
  return [30, 40, 28][clinicIndex - 1];
}

function visitCountForCustomer(clinicIndex, customerIndex) {
  if (clinicIndex === 1) {
    if (customerIndex < 8) return 12;
    if (customerIndex < 20) return 6;
    return 2;
  }
  if (clinicIndex === 2) {
    if (customerIndex < 6) return 8;
    if (customerIndex < 12) return 3;
    return 1;
  }
  if (customerIndex < 10) return 14;
  if (customerIndex < 22) return 8;
  return 3;
}

function buildCustomers(users, todayKey, historyDays, nowIso) {
  const customers = [];
  for (let clinicIndex = 1; clinicIndex <= 3; clinicIndex += 1) {
    const clinicId = DEMO_CLINIC_IDS[clinicIndex - 1];
    const director = users.find(
      user => user.clinicIndex === clinicIndex && user.role === 'clinic_admin'
    );
    const count = customerCountForClinic(clinicIndex);

    for (let customerIndex = 0; customerIndex < count; customerIndex += 1) {
      const family = FAMILY_NAMES[(customerIndex + clinicIndex * 3) % FAMILY_NAMES.length];
      const given = GIVEN_NAMES[(customerIndex * 3 + clinicIndex) % GIVEN_NAMES.length];
      const serial = clinicIndex * 1000 + customerIndex + 1;
      customers.push({
        id: demoUuid(4, serial),
        clinic_id: clinicId,
        name: `${family} ${given}`,
        name_kana: `デモカンジャ ${String(customerIndex + 1).padStart(2, '0')}`,
        phone: `000-${clinicIndex}${String(customerIndex).padStart(3, '0')}-${String(1000 + customerIndex).slice(-4)}`,
        email: makeEmail(`patient-${clinicIndex}-${customerIndex + 1}`),
        custom_attributes: {
          demo_seed: DEMO_VERSION,
          scenario: scenarioForClinic(clinicIndex).code,
          synthetic: true,
        },
        consent_marketing: customerIndex % 3 !== 0,
        consent_reminder: customerIndex % 4 !== 0,
        consent_date: toJstIso(shiftDateKey(todayKey, -historyDays), 9),
        notes: `[${DEMO_VERSION}] 合成データ。実在患者ではありません。`,
        tags:
          customerIndex < 5
            ? ['重点フォロー']
            : customerIndex % 7 === 0
              ? ['自費関心']
              : ['通常'],
        segment:
          clinicIndex === 2 && customerIndex >= 12
            ? 'new'
            : customerIndex < 8
              ? 'loyal'
              : 'active',
        total_visits: 0,
        total_revenue: 0,
        lifetime_value: 0,
        last_visit_date: null,
        created_by: director.id,
        is_deleted: false,
        created_at: toJstIso(shiftDateKey(todayKey, -historyDays - 7), 9),
        updated_at: nowIso,
        _demo: { clinicIndex, customerIndex },
      });
    }
  }
  return customers;
}

function buildInsuranceCoverages(customers, todayKey, nowIso) {
  return customers
    .filter(customer => customer._demo.customerIndex % 3 !== 2)
    .map((customer, index) => ({
      id: demoUuid(14, index + 1),
      clinic_id: customer.clinic_id,
      customer_id: customer.id,
      payer_context_code: 'insurance',
      patient_burden_rate: 30,
      effective_from: shiftDateKey(todayKey, -365),
      effective_to: null,
      verification_status: 'confirmed',
      verified_at: nowIso,
      verified_by: USER_IDS.admin,
      notes: `[${DEMO_VERSION}] デモ用保険情報`,
      created_by: USER_IDS.admin,
      updated_by: USER_IDS.admin,
      updated_at: nowIso,
      _demo: { customerId: customer.id },
    }));
}

function chooseStaffIndex(clinicIndex, sequence) {
  const mod = sequence % 10;
  if (clinicIndex === 1) return mod < 4 ? 0 : mod < 8 ? 1 : 2;
  if (clinicIndex === 2) return sequence % 3;
  return mod < 7 ? 0 : mod < 9 ? 1 : 2;
}

function chooseMenuIndex(clinicIndex, sequence) {
  const mod = sequence % 10;
  if (clinicIndex === 1) return mod < 3 ? 0 : mod < 7 ? 1 : 2;
  if (clinicIndex === 2) return mod < 6 ? 0 : mod < 8 ? 1 : 2;
  return mod < 2 ? 0 : mod < 6 ? 1 : 2;
}

function normalizeVisitOffset(offset, missingOffsets) {
  let result = offset;
  while (missingOffsets.includes(result)) result -= 1;
  return result;
}

function buildReservations({
  customers,
  menus,
  resources,
  users,
  todayKey,
  historyDays,
  futureDays,
  nowIso,
}) {
  const reservations = [];
  const reservationMeta = new Map();
  const staffSlotCounts = new Map();
  let globalReservationSerial = 1;

  function allocateSlot(clinicId, staffId, dateKey) {
    const key = `${clinicId}:${staffId}:${dateKey}`;
    const count = staffSlotCounts.get(key) ?? 0;
    staffSlotCounts.set(key, count + 1);
    return TIME_SLOTS[count % TIME_SLOTS.length];
  }

  for (let clinicIndex = 1; clinicIndex <= 3; clinicIndex += 1) {
    const clinicId = DEMO_CLINIC_IDS[clinicIndex - 1];
    const clinicCustomers = customers.filter(customer => customer.clinic_id === clinicId);
    const clinicMenus = menus.filter(menu => menu.clinic_id === clinicId);
    const clinicResources = resources.filter(resource => resource.clinic_id === clinicId);
    const director = users.find(
      user => user.clinicIndex === clinicIndex && user.role === 'clinic_admin'
    );
    const scenario = scenarioForClinic(clinicIndex);
    let clinicSequence = 0;

    for (const customer of clinicCustomers) {
      const customerIndex = customer._demo.customerIndex;
      const visitCount = visitCountForCustomer(clinicIndex, customerIndex);

      for (let visitIndex = 0; visitIndex < visitCount; visitIndex += 1) {
        let offset;
        if (visitCount === 1) {
          offset = -((customerIndex * 3 + clinicIndex) % Math.min(historyDays - 1, 28));
        } else {
          offset = -Math.round(
            ((visitCount - 1 - visitIndex) * (historyDays - 2)) /
              Math.max(visitCount - 1, 1)
          );
        }
        offset = normalizeVisitOffset(offset, scenario.missingOffsets);
        const dateKey = shiftDateKey(todayKey, offset);
        const staffIndex = chooseStaffIndex(clinicIndex, clinicSequence);
        const menuIndex = chooseMenuIndex(clinicIndex, clinicSequence);
        const staff = clinicResources[staffIndex];
        const menu = clinicMenus[menuIndex];
        const [hour, minute] = allocateSlot(clinicId, staff.id, dateKey);
        const startTime = toJstIso(dateKey, hour, minute);
        const endTime = addMinutes(startTime, menu.duration_minutes);
        const statusSeed = customerIndex * 13 + visitIndex * 7 + clinicIndex;
        let status = 'completed';
        if (visitCount > 1 && statusSeed % 37 === 0) status = 'cancelled';
        if (visitCount > 2 && statusSeed % 53 === 0) status = 'no_show';
        const actualPrice = status === 'completed' ? menu.price : null;
        const reservationId = demoUuid(5, globalReservationSerial);
        globalReservationSerial += 1;

        const row = {
          id: reservationId,
          clinic_id: clinicId,
          customer_id: customer.id,
          menu_id: menu.id,
          staff_id: staff.id,
          start_time: startTime,
          end_time: endTime,
          status,
          channel: ['web', 'line', 'phone', 'walk_in'][clinicSequence % 4],
          booker_name: customer.name,
          booker_phone: customer.phone,
          notes: `[${DEMO_VERSION}] ${scenario.label}`,
          selected_options:
            clinicSequence % 11 === 0
              ? [{ id: 'demo-option', name: '重点ケア', priceDelta: 500 }]
              : [],
          price: menu.price,
          actual_price: actualPrice,
          payment_status: status === 'completed' ? 'paid' : 'unpaid',
          reminder_sent: true,
          confirmation_sent: true,
          created_by: director.id,
          is_deleted: false,
          created_at: addMinutes(startTime, -7 * 24 * 60),
          updated_at: nowIso,
        };
        reservations.push(row);
        reservationMeta.set(reservationId, {
          clinicIndex,
          clinicId,
          dateKey,
          customer,
          menu,
          staff,
          status,
          sequence: clinicSequence,
        });
        clinicSequence += 1;
      }
    }

    for (let day = 1; day <= Math.min(futureDays, 7); day += 1) {
      const dateKey = shiftDateKey(todayKey, day);
      if (isSunday(dateKey)) continue;
      for (let slot = 0; slot < 4; slot += 1) {
        const customer = clinicCustomers[(day * 5 + slot) % clinicCustomers.length];
        const staff = clinicResources[chooseStaffIndex(clinicIndex, clinicSequence)];
        const menu = clinicMenus[chooseMenuIndex(clinicIndex, clinicSequence)];
        const [hour, minute] = allocateSlot(clinicId, staff.id, dateKey);
        const startTime = toJstIso(dateKey, hour, minute);
        const reservationId = demoUuid(5, globalReservationSerial);
        globalReservationSerial += 1;
        const row = {
          id: reservationId,
          clinic_id: clinicId,
          customer_id: customer.id,
          menu_id: menu.id,
          staff_id: staff.id,
          start_time: startTime,
          end_time: addMinutes(startTime, menu.duration_minutes),
          status: slot === 3 ? 'tentative' : 'confirmed',
          channel: slot % 2 === 0 ? 'web' : 'line',
          booker_name: customer.name,
          booker_phone: customer.phone,
          notes: `[${DEMO_VERSION}] 未来予約`,
          selected_options: [],
          price: menu.price,
          actual_price: null,
          payment_status: 'unpaid',
          reminder_sent: false,
          confirmation_sent: true,
          created_by: director.id,
          is_deleted: false,
          created_at: nowIso,
          updated_at: nowIso,
        };
        reservations.push(row);
        reservationMeta.set(reservationId, {
          clinicIndex,
          clinicId,
          dateKey,
          customer,
          menu,
          staff,
          status: row.status,
          sequence: clinicSequence,
        });
        clinicSequence += 1;
      }
    }
  }

  return { reservations, reservationMeta };
}

export { buildCustomers, buildInsuranceCoverages, buildReservations };
