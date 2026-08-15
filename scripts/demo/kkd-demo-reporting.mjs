import {
  DEMO_VERSION,
  DEMO_CLINIC_IDS,
  USER_IDS,
  demoUuid,
  shiftDateKey,
  isSunday,
  scenarioForClinic,
} from './kkd-demo-base.mjs';

function buildReportsAndItems({
  customers,
  menus,
  menuBillingProfiles,
  insuranceCoverages,
  reservations,
  reservationMeta,
  users,
  todayKey,
  historyDays,
  nowIso,
}) {
  const dailyReports = [];
  const reportByClinicDate = new Map();
  const dailyReportItems = [];
  const dailyReportItemTags = [];
  const profileByMenuId = new Map(
    menuBillingProfiles.map(profile => [profile.menu_id, profile])
  );
  const coverageByCustomerId = new Map(
    insuranceCoverages.map(coverage => [coverage.customer_id, coverage])
  );
  const menuById = new Map(menus.map(menu => [menu.id, menu]));
  const userByClinic = new Map(
    users
      .filter(user => user.role === 'clinic_admin')
      .map(user => [user.clinicId, user])
  );

  let reportSerial = 1;
  for (let clinicIndex = 1; clinicIndex <= 3; clinicIndex += 1) {
    const clinicId = DEMO_CLINIC_IDS[clinicIndex - 1];
    const scenario = scenarioForClinic(clinicIndex);
    for (let relative = -(historyDays - 1); relative <= 0; relative += 1) {
      if (scenario.missingOffsets.includes(relative)) continue;
      const dateKey = shiftDateKey(todayKey, relative);
      const director = userByClinic.get(clinicId);
      const report = {
        id: demoUuid(6, reportSerial),
        clinic_id: clinicId,
        report_date: dateKey,
        staff_id: director.id,
        total_patients: 0,
        new_patients: 0,
        total_revenue: 0,
        insurance_revenue: 0,
        private_revenue: 0,
        report_text: isSunday(dateKey)
          ? `[${DEMO_VERSION}] 休診日。データ連続性確認用の日報です。`
          : `[${DEMO_VERSION}] ${scenario.reportText}`,
        updated_at: nowIso,
      };
      dailyReports.push(report);
      reportByClinicDate.set(`${clinicId}:${dateKey}`, report);
      reportSerial += 1;
    }
  }

  const completedReservations = reservations.filter(
    reservation => reservation.status === 'completed'
  );
  const completedByCustomer = new Map();
  for (const reservation of completedReservations) {
    const list = completedByCustomer.get(reservation.customer_id) ?? [];
    list.push(reservation);
    completedByCustomer.set(reservation.customer_id, list);
  }
  for (const list of completedByCustomer.values()) {
    list.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  const firstVisitDateByCustomer = new Map(
    Array.from(completedByCustomer.entries()).map(([customerId, list]) => [
      customerId,
      list[0]?.start_time.slice(0, 10) ?? null,
    ])
  );

  let itemSerial = 1;
  let tagSerial = 1;
  for (const reservation of completedReservations) {
    const meta = reservationMeta.get(reservation.id);
    const report = reportByClinicDate.get(`${reservation.clinic_id}:${meta.dateKey}`);
    if (!report) {
      throw new Error(`No daily report for completed reservation ${reservation.id}`);
    }
    const menu = menuById.get(reservation.menu_id);
    const profile = profileByMenuId.get(menu.id);
    const coverage = coverageByCustomerId.get(reservation.customer_id) ?? null;
    const context = menu._demo.revenueContextCode;
    const isInsurance = context === 'insurance';
    let estimateStatus = 'calculated';
    let pricingStatus = 'confirmed';

    if (meta.dateKey === todayKey && meta.clinicIndex === 2 && meta.sequence % 5 === 0) {
      estimateStatus = 'needs_review';
      pricingStatus = 'needs_review';
    }
    if (meta.dateKey === todayKey && meta.clinicIndex === 3 && meta.sequence % 7 === 0) {
      estimateStatus = 'blocked';
      pricingStatus = 'needs_review';
    }

    const itemId = demoUuid(7, itemSerial);
    const fee = Number(reservation.actual_price ?? reservation.price ?? 0);
    dailyReportItems.push({
      id: itemId,
      clinic_id: reservation.clinic_id,
      daily_report_id: report.id,
      report_date: meta.dateKey,
      reservation_id: reservation.id,
      customer_id: reservation.customer_id,
      menu_id: reservation.menu_id,
      staff_resource_id: reservation.staff_id,
      patient_name: meta.customer.name,
      treatment_name: menu.name,
      duration_minutes: menu.duration_minutes,
      fee,
      billing_type: isInsurance ? 'insurance' : 'private',
      payment_method_id: null,
      source: 'reservation',
      notes: reservation.notes,
      revenue_context_code: context,
      revenue_context_source: 'derived',
      amount_source: 'reservation',
      estimate_status: estimateStatus,
      menu_billing_profile_id: profile.id,
      customer_insurance_coverage_id: isInsurance ? coverage?.id ?? null : null,
      patient_burden_rate: isInsurance ? 30 : null,
      coverage_resolution_source: isInsurance ? 'customer_default' : null,
      pricing_snapshot_status: pricingStatus,
      pricing_confirmed_at: pricingStatus === 'confirmed' ? nowIso : null,
      created_by: userByClinic.get(reservation.clinic_id).id,
      updated_by: userByClinic.get(reservation.clinic_id).id,
      updated_at: nowIso,
    });

    if (estimateStatus === 'needs_review') {
      dailyReportItemTags.push({
        id: demoUuid(8, tagSerial),
        clinic_id: reservation.clinic_id,
        daily_report_item_id: itemId,
        tag_code: 'TRAFFIC_ACCIDENT_REVIEW',
        note: `[${DEMO_VERSION}] 副社長デモ用の要確認シグナル`,
        created_by: USER_IDS.admin,
        updated_by: USER_IDS.admin,
        updated_at: nowIso,
      });
      tagSerial += 1;
    }
    if (estimateStatus === 'blocked') {
      dailyReportItemTags.push({
        id: demoUuid(8, tagSerial),
        clinic_id: reservation.clinic_id,
        daily_report_item_id: itemId,
        tag_code: 'ESTIMATE_EXCLUDED',
        note: `[${DEMO_VERSION}] 差戻し確認用`,
        created_by: USER_IDS.admin,
        updated_by: USER_IDS.admin,
        updated_at: nowIso,
      });
      tagSerial += 1;
    }

    itemSerial += 1;
  }

  for (let clinicIndex = 1; clinicIndex <= 3; clinicIndex += 1) {
    const clinicId = DEMO_CLINIC_IDS[clinicIndex - 1];
    for (let offset = -(historyDays - 1); offset <= 0; offset += 7) {
      const dateKey = shiftDateKey(todayKey, offset);
      const report = reportByClinicDate.get(`${clinicId}:${dateKey}`);
      if (!report) continue;
      const isTicket = clinicIndex === 2 || offset % 14 === 0;
      const itemId = demoUuid(7, itemSerial);
      dailyReportItems.push({
        id: itemId,
        clinic_id: clinicId,
        daily_report_id: report.id,
        report_date: dateKey,
        reservation_id: null,
        customer_id: null,
        menu_id: null,
        staff_resource_id: null,
        patient_name: '院内販売',
        treatment_name: isTicket ? '回数券販売' : 'サポーター物販',
        duration_minutes: 0,
        fee: isTicket ? 30000 : 3500,
        billing_type: 'private',
        payment_method_id: null,
        source: 'manual',
        notes: `[${DEMO_VERSION}] 売上文脈デモ`,
        revenue_context_code: isTicket ? 'ticket' : 'product',
        revenue_context_source: 'manual',
        amount_source: 'manual',
        estimate_status: 'calculated',
        pricing_snapshot_status: 'confirmed',
        pricing_confirmed_at: nowIso,
        created_by: userByClinic.get(clinicId).id,
        updated_by: userByClinic.get(clinicId).id,
        updated_at: nowIso,
      });
      dailyReportItemTags.push({
        id: demoUuid(8, tagSerial),
        clinic_id: clinicId,
        daily_report_item_id: itemId,
        tag_code: 'MANUAL_CLASSIFICATION',
        note: `[${DEMO_VERSION}] 手動売上分類`,
        created_by: USER_IDS.admin,
        updated_by: USER_IDS.admin,
        updated_at: nowIso,
      });
      itemSerial += 1;
      tagSerial += 1;
    }
  }

  const totalsByReport = new Map();
  for (const item of dailyReportItems) {
    const totals = totalsByReport.get(item.daily_report_id) ?? {
      patients: 0,
      total: 0,
      insurance: 0,
      private: 0,
    };
    if (item.customer_id) totals.patients += 1;
    totals.total += Number(item.fee);
    if (item.billing_type === 'insurance') totals.insurance += Number(item.fee);
    else totals.private += Number(item.fee);
    totalsByReport.set(item.daily_report_id, totals);
  }

  for (const report of dailyReports) {
    const totals = totalsByReport.get(report.id) ?? {
      patients: 0,
      total: 0,
      insurance: 0,
      private: 0,
    };
    report.total_patients = totals.patients;
    report.total_revenue = totals.total;
    report.insurance_revenue = totals.insurance;
    report.private_revenue = totals.private;
    report.new_patients = completedReservations.filter(reservation => {
      const meta = reservationMeta.get(reservation.id);
      return (
        reservation.clinic_id === report.clinic_id &&
        meta.dateKey === report.report_date &&
        firstVisitDateByCustomer.get(reservation.customer_id) === report.report_date
      );
    }).length;
  }

  const customerById = new Map(customers.map(customer => [customer.id, customer]));
  for (const [customerId, list] of completedByCustomer.entries()) {
    const customer = customerById.get(customerId);
    const revenue = list.reduce(
      (sum, reservation) => sum + Number(reservation.actual_price ?? reservation.price ?? 0),
      0
    );
    const latest = list[list.length - 1];
    customer.total_visits = list.length;
    customer.total_revenue = revenue;
    customer.lifetime_value = revenue;
    customer.last_visit_date = latest?.start_time ?? null;
  }

  return { dailyReports, dailyReportItems, dailyReportItemTags };
}

function buildAiComments(todayKey, historyDays, nowIso) {
  const rows = [];
  let serial = 1;
  for (let clinicIndex = 1; clinicIndex <= 3; clinicIndex += 1) {
    const clinicId = DEMO_CLINIC_IDS[clinicIndex - 1];
    const scenario = scenarioForClinic(clinicIndex);
    for (let offset = -Math.min(historyDays - 1, 13); offset <= 0; offset += 1) {
      const dateKey = shiftDateKey(todayKey, offset);
      rows.push({
        id: demoUuid(15, serial),
        clinic_id: clinicId,
        comment_date: dateKey,
        summary: `${scenario.label}。${scenario.reportText}`,
        good_points:
          clinicIndex === 1
            ? '自費比率と継続率が安定しています。'
            : clinicIndex === 2
              ? '新規患者の流入が伸びています。'
              : '予約稼働率が高水準です。',
        improvement_points:
          clinicIndex === 1
            ? '成功パターンを他院へ展開してください。'
            : clinicIndex === 2
              ? '初回後7日以内のフォローを標準化してください。'
              : '担当偏在を解消し、空き枠を再配分してください。',
        suggestion_for_tomorrow:
          clinicIndex === 2
            ? '未予約の新規患者へフォロー連絡を実施する。'
            : '朝会で重点患者と予約枠を確認する。',
        raw_ai_response: {
          demo_seed: DEMO_VERSION,
          scenario: scenario.code,
          generated: false,
        },
        updated_at: nowIso,
      });
      serial += 1;
    }
  }
  return rows;
}

export { buildReportsAndItems, buildAiComments };
