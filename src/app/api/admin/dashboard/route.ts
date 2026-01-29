import { NextRequest } from 'next/server';
import {
  processApiRequest,
  createErrorResponse,
  createSuccessResponse,
  logError,
} from '@/lib/api-helpers';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';

type ClinicRow = {
  id: string;
  name: string;
  is_active?: boolean | null;
};

type DailyReportRow = {
  clinic_id: string;
  total_patients: number | null;
  total_revenue: number | string | null;
};

type StaffPerformanceRow = {
  clinic_id: string;
  performance_score: number | null;
};

interface AggregatedClinicData {
  id: string;
  name: string;
  totalRevenue: number;
  totalPatientCount: number;
  averagePerformanceScore: number;
}

interface OverallKpis {
  totalGroupRevenue: number;
  totalGroupPatientCount: number;
  averageGroupPerformance: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clinicParam = searchParams.get('clinic_id');

  try {
    const normalizedClinicId = clinicParam ?? undefined;
    const processResult = await processApiRequest(request, {
      allowedRoles: Array.from(ADMIN_UI_ROLES),
      clinicId: normalizedClinicId ?? null,
      requireClinicMatch: Boolean(normalizedClinicId),
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { supabase, permissions, auth } = processResult;

    let clinicFilter = normalizedClinicId;
    if (!clinicFilter && permissions.role === 'clinic_admin') {
      clinicFilter = permissions.clinic_id ?? undefined;
    }

    let clinicQuery = supabase
      .from('clinics')
      .select('id, name, is_active')
      .order('name');

    if (clinicFilter) {
      clinicQuery = clinicQuery.in('id', [clinicFilter]);
    }

    const { data: clinics, error: clinicError } = await clinicQuery;
    if (clinicError) {
      logError(clinicError, {
        endpoint: '/api/admin/dashboard',
        method: 'GET',
        userId: auth.id,
      });
      return createErrorResponse('クリニック情報の取得に失敗しました', 500);
    }

    const clinicRows: ClinicRow[] = (clinics ?? []) as ClinicRow[];

    const clinicIds = clinicRows.map(clinic => clinic.id);
    if (clinicIds.length === 0) {
      return createSuccessResponse({
        clinicsData: [],
        overallKpis: {
          totalGroupRevenue: 0,
          totalGroupPatientCount: 0,
          averageGroupPerformance: 0,
        },
      });
    }

    const { data: dailyReports, error: reportsError } = await supabase
      .from('daily_reports')
      .select('clinic_id, total_patients, total_revenue')
      .in('clinic_id', clinicIds);

    if (reportsError) {
      logError(reportsError, {
        endpoint: '/api/admin/dashboard',
        method: 'GET',
        userId: auth.id,
      });
      return createErrorResponse('日報データの取得に失敗しました', 500);
    }

    const { data: staffPerformance, error: staffError } = await supabase
      .from('staff_performance')
      .select('clinic_id, performance_score')
      .in('clinic_id', clinicIds);

    if (staffError) {
      logError(staffError, {
        endpoint: '/api/admin/dashboard',
        method: 'GET',
        userId: auth.id,
      });
      return createErrorResponse(
        'スタッフパフォーマンスの取得に失敗しました',
        500
      );
    }

    const reportRows: DailyReportRow[] = (dailyReports ??
      []) as DailyReportRow[];
    const performanceRows: StaffPerformanceRow[] = (staffPerformance ??
      []) as StaffPerformanceRow[];

    const aggregatedMap = new Map<string, AggregatedClinicData>();

    clinicRows.forEach(clinic => {
      aggregatedMap.set(clinic.id, {
        id: clinic.id,
        name: clinic.name,
        totalRevenue: 0,
        totalPatientCount: 0,
        averagePerformanceScore: 0,
      });
    });

    reportRows.forEach(report => {
      const entry = aggregatedMap.get(report.clinic_id);
      if (!entry) return;
      const revenue =
        typeof report.total_revenue === 'number'
          ? report.total_revenue
          : Number(report.total_revenue ?? 0);
      entry.totalRevenue += revenue;
      entry.totalPatientCount += report.total_patients ?? 0;
    });

    const performanceTotals = new Map<string, { sum: number; count: number }>();

    performanceRows.forEach(perf => {
      const current = performanceTotals.get(perf.clinic_id) ?? {
        sum: 0,
        count: 0,
      };
      current.sum += perf.performance_score ?? 0;
      current.count += 1;
      performanceTotals.set(perf.clinic_id, current);
    });

    performanceTotals.forEach((value, clinicId) => {
      const entry = aggregatedMap.get(clinicId);
      if (!entry) return;
      entry.averagePerformanceScore =
        value.count > 0 ? value.sum / value.count : 0;
    });

    const clinicsData = Array.from(aggregatedMap.values());

    const overallKpis: OverallKpis = {
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

    return createSuccessResponse({ clinicsData, overallKpis });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/dashboard',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
