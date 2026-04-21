export interface AggregatedClinicData {
  id: string;
  name: string;
  totalRevenue: number;
  totalPatientCount: number;
  averagePerformanceScore: number;
}

export interface OverallKpis {
  totalGroupRevenue: number;
  totalGroupPatientCount: number;
  averageGroupPerformance: number;
}

export interface AdminDashboardPayload {
  clinicsData: AggregatedClinicData[];
  overallKpis: OverallKpis;
}

export interface ClinicDashboardRow {
  id: string;
  name: string;
}

export interface DailyReportAggregateRow {
  clinic_id: string;
  total_patients: number | null;
  total_revenue: number | string | null;
}

export interface StaffPerformanceAggregateRow {
  clinic_id: string;
  performance_score: number | null;
}

export function createEmptyOverallKpis(): OverallKpis {
  return {
    totalGroupRevenue: 0,
    totalGroupPatientCount: 0,
    averageGroupPerformance: 0,
  };
}

export function createEmptyAdminDashboardPayload(): AdminDashboardPayload {
  return {
    clinicsData: [],
    overallKpis: createEmptyOverallKpis(),
  };
}

function toRevenue(value: number | string | null): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function buildOverallKpis(clinicsData: AggregatedClinicData[]): OverallKpis {
  return {
    totalGroupRevenue: clinicsData.reduce(
      (sum, clinic) => sum + clinic.totalRevenue,
      0
    ),
    totalGroupPatientCount: clinicsData.reduce(
      (sum, clinic) => sum + clinic.totalPatientCount,
      0
    ),
    averageGroupPerformance:
      clinicsData.length > 0
        ? clinicsData.reduce(
            (sum, clinic) => sum + clinic.averagePerformanceScore,
            0
          ) / clinicsData.length
        : 0,
  };
}

export function buildAdminDashboardPayload(
  clinics: ClinicDashboardRow[],
  dailyReports: DailyReportAggregateRow[],
  staffPerformance: StaffPerformanceAggregateRow[]
): AdminDashboardPayload {
  if (clinics.length === 0) {
    return createEmptyAdminDashboardPayload();
  }

  const aggregatedMap = new Map<string, AggregatedClinicData>(
    clinics.map(clinic => [
      clinic.id,
      {
        id: clinic.id,
        name: clinic.name,
        totalRevenue: 0,
        totalPatientCount: 0,
        averagePerformanceScore: 0,
      },
    ])
  );

  for (const report of dailyReports) {
    const clinic = aggregatedMap.get(report.clinic_id);
    if (!clinic) {
      continue;
    }

    clinic.totalRevenue += toRevenue(report.total_revenue);
    clinic.totalPatientCount += report.total_patients ?? 0;
  }

  const performanceTotals = new Map<string, { sum: number; count: number }>();

  for (const performance of staffPerformance) {
    const current = performanceTotals.get(performance.clinic_id) ?? {
      sum: 0,
      count: 0,
    };

    current.sum += performance.performance_score ?? 0;
    current.count += 1;
    performanceTotals.set(performance.clinic_id, current);
  }

  for (const [clinicId, total] of performanceTotals.entries()) {
    const clinic = aggregatedMap.get(clinicId);
    if (!clinic) {
      continue;
    }

    clinic.averagePerformanceScore =
      total.count > 0 ? total.sum / total.count : 0;
  }

  const clinicsData = Array.from(aggregatedMap.values());

  return {
    clinicsData,
    overallKpis: buildOverallKpis(clinicsData),
  };
}
