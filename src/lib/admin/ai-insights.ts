import type { SupabaseServerClient } from '@/lib/supabase';

export type AdminInsightImpact = 'high' | 'mid' | 'low';

export interface AdminInsightItem {
  title: string;
  why: string;
  action: string;
  impact: AdminInsightImpact;
}

export interface AdminInsightAnomaly {
  title: string;
  evidence: string;
  action: string;
}

export interface AdminAiKpi {
  total_revenue: number;
  total_patients: number;
  average_performance_score: number | null;
}

export interface AdminAiScope {
  clinic_ids: string[];
  clinic_count: number;
  period_days: number;
}

export interface AdminAiInsightInput {
  period_days: number;
  clinic_count: number;
  kpi: AdminAiKpi;
  clinics: AdminClinicKpi[];
}

export interface AdminAiInsightsResponse {
  summary: string;
  insights: AdminInsightItem[];
  anomalies: AdminInsightAnomaly[];
  scope: AdminAiScope;
  kpi: AdminAiKpi;
  input: AdminAiInsightInput;
}

export interface AdminClinicKpi {
  clinic_id: string;
  revenue: number;
  patients: number;
  performance_score: number | null;
}

interface RevenueRow {
  clinic_id: string | null;
  total_revenue: number | string | null;
}

interface PatientRow {
  clinic_id: string | null;
  patient_id: string | null;
}

interface StaffRow {
  clinic_id: string | null;
  total_revenue_generated: number | string | null;
}

export function buildPeriodDateRange(
  periodDays: number,
  now: Date = new Date()
): { startDate: string; endDate: string } {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(end.getDate() - Math.max(periodDays - 1, 0));

  return {
    startDate: toDateOnly(start),
    endDate: toDateOnly(end),
  };
}

export function aggregateAdminClinicKpis(
  clinicIds: string[],
  revenueRows: RevenueRow[],
  patientRows: PatientRow[],
  staffRows: StaffRow[]
): AdminClinicKpi[] {
  const revenueByClinic = new Map<string, number>();
  const patientsByClinic = new Map<string, Set<string>>();
  const staffRevenueByClinic = new Map<
    string,
    { totalRevenue: number; staffCount: number }
  >();

  for (const row of revenueRows) {
    if (!row.clinic_id || !clinicIds.includes(row.clinic_id)) continue;
    revenueByClinic.set(
      row.clinic_id,
      (revenueByClinic.get(row.clinic_id) ?? 0) + toNumber(row.total_revenue)
    );
  }

  for (const row of patientRows) {
    if (
      !row.clinic_id ||
      !row.patient_id ||
      !clinicIds.includes(row.clinic_id)
    ) {
      continue;
    }
    const patients = patientsByClinic.get(row.clinic_id) ?? new Set<string>();
    patients.add(row.patient_id);
    patientsByClinic.set(row.clinic_id, patients);
  }

  for (const row of staffRows) {
    if (!row.clinic_id || !clinicIds.includes(row.clinic_id)) continue;
    const stats = staffRevenueByClinic.get(row.clinic_id) ?? {
      totalRevenue: 0,
      staffCount: 0,
    };
    stats.totalRevenue += toNumber(row.total_revenue_generated);
    stats.staffCount += 1;
    staffRevenueByClinic.set(row.clinic_id, stats);
  }

  return clinicIds.map(clinicId => {
    const staffStats = staffRevenueByClinic.get(clinicId);
    return {
      clinic_id: clinicId,
      revenue: revenueByClinic.get(clinicId) ?? 0,
      patients: patientsByClinic.get(clinicId)?.size ?? 0,
      performance_score: staffStats
        ? calculatePerformanceScore(
            staffStats.totalRevenue,
            staffStats.staffCount
          )
        : null,
    };
  });
}

export function summarizeAdminKpi(clinics: AdminClinicKpi[]): AdminAiKpi {
  const totalRevenue = clinics.reduce((sum, row) => sum + row.revenue, 0);
  const totalPatients = clinics.reduce((sum, row) => sum + row.patients, 0);
  const performanceScores = clinics
    .map(row => row.performance_score)
    .filter((score): score is number => score !== null);

  return {
    total_revenue: totalRevenue,
    total_patients: totalPatients,
    average_performance_score:
      performanceScores.length > 0
        ? roundOne(
            performanceScores.reduce((sum, score) => sum + score, 0) /
              performanceScores.length
          )
        : null,
  };
}

export function buildDeterministicAdminInsights(
  input: AdminAiInsightInput
): Pick<AdminAiInsightsResponse, 'summary' | 'insights' | 'anomalies'> {
  const topRevenueClinic = [...input.clinics].sort(
    (a, b) => b.revenue - a.revenue
  )[0];
  const lowPatientClinics = input.clinics.filter(row => row.patients === 0);
  const averageRevenue =
    input.clinic_count > 0
      ? Math.round(input.kpi.total_revenue / input.clinic_count)
      : 0;

  const anomalies: AdminInsightAnomaly[] = [];
  if (
    topRevenueClinic &&
    averageRevenue > 0 &&
    topRevenueClinic.revenue >= averageRevenue * 2
  ) {
    anomalies.push({
      title: '売上偏重が発生',
      evidence: `clinic_id=${topRevenueClinic.clinic_id} が平均売上の2倍以上です`,
      action: '高売上店舗の施策を低売上店舗へ展開してください',
    });
  }
  if (lowPatientClinics.length > 0) {
    anomalies.push({
      title: '患者数0の店舗があります',
      evidence: `${lowPatientClinics.length}店舗で期間内患者が集計されていません`,
      action: '予約・来院データ連携と休業状態を確認してください',
    });
  }

  const summary =
    input.clinic_count > 0
      ? `直近${input.period_days}日で${input.clinic_count}店舗の総売上は約${input.kpi.total_revenue.toLocaleString()}円、患者数は${input.kpi.total_patients.toLocaleString()}名です。`
      : `直近${input.period_days}日の対象店舗がありません。`;

  return {
    summary,
    insights: [
      {
        title: '横断売上',
        why: `対象店舗の平均売上は約${averageRevenue.toLocaleString()}円です`,
        action:
          '店舗別の売上差を確認し、上位店舗の集客施策を標準化してください',
        impact: input.kpi.total_revenue > 0 ? 'high' : 'mid',
      },
      {
        title: '患者基盤',
        why: `期間内のユニーク患者数は${input.kpi.total_patients.toLocaleString()}名です`,
        action:
          '患者数が少ない店舗に再診促進と休眠患者フォローを優先配分してください',
        impact: input.kpi.total_patients > 0 ? 'mid' : 'high',
      },
      {
        title: '運用品質',
        why:
          input.kpi.average_performance_score === null
            ? 'スタッフ実績スコアを算出できるデータがありません'
            : `平均パフォーマンススコアは${input.kpi.average_performance_score}です`,
        action:
          'スタッフ別売上と来院対応のばらつきを店舗横断でレビューしてください',
        impact: 'mid',
      },
    ],
    anomalies,
  };
}

export async function buildAdminAiInsights(
  client: SupabaseServerClient,
  clinicIds: string[],
  periodDays: number
): Promise<AdminAiInsightsResponse> {
  if (clinicIds.length === 0) {
    const kpi = summarizeAdminKpi([]);
    const input: AdminAiInsightInput = {
      period_days: periodDays,
      clinic_count: 0,
      kpi,
      clinics: [],
    };
    const generated = buildDeterministicAdminInsights(input);

    return {
      ...generated,
      scope: {
        clinic_ids: [],
        clinic_count: 0,
        period_days: periodDays,
      },
      kpi,
      input,
    };
  }

  const { startDate, endDate } = buildPeriodDateRange(periodDays);

  const [revenueResult, patientResult, staffResult] = await Promise.all([
    client
      .from('daily_revenue_summary')
      .select('clinic_id, total_revenue')
      .in('clinic_id', clinicIds)
      .gte('revenue_date', startDate)
      .lte('revenue_date', endDate),
    client
      .from('patient_visit_summary')
      .select('clinic_id, patient_id')
      .in('clinic_id', clinicIds)
      .or(`first_visit_date.gte.${startDate},last_visit_date.gte.${startDate}`),
    client
      .from('staff_performance_summary')
      .select('clinic_id, total_revenue_generated')
      .in('clinic_id', clinicIds),
  ]);

  if (revenueResult.error) {
    throw new Error(
      `daily_revenue_summary query failed: ${revenueResult.error.message}`
    );
  }
  if (patientResult.error) {
    throw new Error(
      `patient_visit_summary query failed: ${patientResult.error.message}`
    );
  }
  if (staffResult.error) {
    throw new Error(
      `staff_performance_summary query failed: ${staffResult.error.message}`
    );
  }

  const clinics = aggregateAdminClinicKpis(
    clinicIds,
    (revenueResult.data ?? []) as RevenueRow[],
    (patientResult.data ?? []) as PatientRow[],
    (staffResult.data ?? []) as StaffRow[]
  );
  const kpi = summarizeAdminKpi(clinics);
  const input: AdminAiInsightInput = {
    period_days: periodDays,
    clinic_count: clinicIds.length,
    kpi,
    clinics,
  };
  const generated = buildDeterministicAdminInsights(input);

  return {
    ...generated,
    scope: {
      clinic_ids: clinicIds,
      clinic_count: clinicIds.length,
      period_days: periodDays,
    },
    kpi,
    input,
  };
}

function calculatePerformanceScore(totalRevenue: number, staffCount: number) {
  if (staffCount <= 0) return null;
  return Math.min(5, roundOne((totalRevenue / staffCount / 100000) * 10));
}

function toDateOnly(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

function toNumber(value: number | string | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
