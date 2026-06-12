import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { resolveManagerAssignedClinics } from '@/lib/auth/manager-scope';
import { normalizeRole } from '@/lib/constants/roles';
import {
  buildManagerStaffAnalysis,
  dateIsWithinManagerStaffPeriod,
  parseManagerStaffAnalysisQuery,
  resolveManagerStaffAnalysisComparisonPeriod,
  resolveManagerStaffAnalysisPeriod,
} from '@/lib/manager-staff-analysis';
import {
  resolveManagerAnalysisRpcTimestampBounds,
  type ManagerAnalysisPeriod,
} from '@/lib/manager-analysis-period';
import { createAdminClient } from '@/lib/supabase';
import type {
  DailyReportItemMetricRecord,
  ManagerStaffAnalysisClinic,
  ManagerStaffAnalysisPeriod,
  ReservationMetricRecord,
  StaffResourceRecord,
  StaffShiftMetricRecord,
} from '@/types/manager-staff-analysis';

const PATH = '/api/manager/staff-analysis';
const MANAGER_STAFF_ANALYSIS_ALLOWED_ROLES = ['manager'] as const;
// PostgRESTの max_rows (supabase/config.toml: 1000) に合わせたページサイズ。
// 1リクエストでは1000行までしか返らないため、全行揃うまでページングする。
const FETCH_PAGE_SIZE = 1000;

type AdminClient = ReturnType<typeof createAdminClient>;

type ResourceQueryRow = {
  id: string;
  name: string;
  clinic_id: string;
  is_active: boolean | null;
  is_deleted: boolean | null;
  is_bookable: boolean | null;
};

type ReservationQueryRow = {
  id: string;
  clinic_id: string;
  staff_id: string;
  status: string;
  start_time: string;
};

type StaffShiftQueryRow = {
  id: string;
  clinic_id: string;
  staff_id: string;
  start_time: string;
};

type DailyReportItemQueryRow = {
  id: string;
  clinic_id: string;
  staff_resource_id: string | null;
  report_date: string;
  fee: number;
};

function toAssignedClinic(
  assignment: Awaited<ReturnType<typeof resolveManagerAssignedClinics>>[number]
): ManagerStaffAnalysisClinic {
  return {
    id: assignment.clinic_id,
    name: assignment.clinic_name ?? '',
  };
}

function toMetricPeriod(
  period: ManagerStaffAnalysisPeriod
): ManagerAnalysisPeriod {
  return {
    type: period.preset,
    startDate: period.startDate,
    endDate: period.endDate,
    bucket: period.bucket,
  };
}

function toResourceRecord(
  row: ResourceQueryRow,
  clinicById: ReadonlyMap<string, ManagerStaffAnalysisClinic>
): StaffResourceRecord {
  return {
    id: row.id,
    name: row.name,
    clinicId: row.clinic_id,
    clinicName: clinicById.get(row.clinic_id)?.name ?? '',
    isActive: row.is_active === true,
    isDeleted: row.is_deleted === true,
    isBookable: row.is_bookable,
  };
}

function toReservationRecord(
  row: ReservationQueryRow
): ReservationMetricRecord {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    staffId: row.staff_id,
    status: row.status,
    startsAt: row.start_time,
  };
}

function toShiftRecord(row: StaffShiftQueryRow): StaffShiftMetricRecord {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    staffId: row.staff_id,
    shiftDate: row.start_time,
  };
}

function toDailyReportItemRecord(
  row: DailyReportItemQueryRow
): DailyReportItemMetricRecord {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    staffResourceId: row.staff_resource_id,
    reportDate: row.report_date,
    fee: Number(row.fee),
  };
}

// クエリを from/to ごとに組み立て直し、ページが満杯の間は次ページを取得する
async function fetchAllRows<T>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + FETCH_PAGE_SIZE - 1);
    if (error) {
      throw error;
    }

    const page = data ?? [];
    rows.push(...page);
    if (page.length < FETCH_PAGE_SIZE) {
      return rows;
    }
  }
}

async function fetchStaffResources(
  adminClient: AdminClient,
  clinicIds: readonly string[],
  clinics: readonly ManagerStaffAnalysisClinic[]
): Promise<StaffResourceRecord[]> {
  const rows = await fetchAllRows<ResourceQueryRow>((from, to) =>
    adminClient
      .from('resources')
      .select('id, name, clinic_id, is_active, is_deleted, is_bookable')
      .in('clinic_id', [...clinicIds])
      .eq('type', 'staff')
      .eq('is_deleted', false)
      .order('id')
      .range(from, to)
      .returns<ResourceQueryRow[]>()
  );

  const clinicById = new Map(clinics.map(clinic => [clinic.id, clinic]));
  return rows.map(row => toResourceRecord(row, clinicById));
}

async function fetchReservations(
  adminClient: AdminClient,
  clinicIds: readonly string[],
  period: ManagerAnalysisPeriod
): Promise<ReservationMetricRecord[]> {
  const bounds = resolveManagerAnalysisRpcTimestampBounds(period);
  const rows = await fetchAllRows<ReservationQueryRow>((from, to) => {
    let query = adminClient
      .from('reservations')
      .select('id, clinic_id, staff_id, status, start_time')
      .in('clinic_id', [...clinicIds])
      .eq('is_deleted', false);

    if (bounds.startIso) {
      query = query.gte('start_time', bounds.startIso);
    }
    if (bounds.endIso) {
      query = query.lte('start_time', bounds.endIso);
    }

    return query.order('id').range(from, to).returns<ReservationQueryRow[]>();
  });

  return rows.map(toReservationRecord);
}

async function fetchStaffShifts(
  adminClient: AdminClient,
  clinicIds: readonly string[],
  period: ManagerAnalysisPeriod
): Promise<StaffShiftMetricRecord[]> {
  const bounds = resolveManagerAnalysisRpcTimestampBounds(period);
  const rows = await fetchAllRows<StaffShiftQueryRow>((from, to) => {
    let query = adminClient
      .from('staff_shifts')
      .select('id, clinic_id, staff_id, start_time')
      .in('clinic_id', [...clinicIds]);

    if (bounds.startIso) {
      query = query.gte('start_time', bounds.startIso);
    }
    if (bounds.endIso) {
      query = query.lte('start_time', bounds.endIso);
    }

    return query.order('id').range(from, to).returns<StaffShiftQueryRow[]>();
  });

  return rows.map(toShiftRecord);
}

async function fetchDailyReportItems(
  adminClient: AdminClient,
  clinicIds: readonly string[],
  period: Pick<ManagerStaffAnalysisPeriod, 'startDate' | 'endDate'>
): Promise<DailyReportItemMetricRecord[]> {
  const rows = await fetchAllRows<DailyReportItemQueryRow>((from, to) => {
    let query = adminClient
      .from('daily_report_items')
      .select('id, clinic_id, staff_resource_id, report_date, fee')
      .in('clinic_id', [...clinicIds]);

    if (period.startDate) {
      query = query.gte('report_date', period.startDate);
    }
    if (period.endDate) {
      query = query.lte('report_date', period.endDate);
    }

    return query
      .order('id')
      .range(from, to)
      .returns<DailyReportItemQueryRow[]>();
  });

  return rows.map(toDailyReportItemRecord);
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await processApiRequest(request, {
      allowedRoles: Array.from(MANAGER_STAFF_ANALYSIS_ALLOWED_ROLES),
      requireClinicMatch: false,
    });

    if (!authResult.success) {
      return authResult.error;
    }

    if (normalizeRole(authResult.permissions.role) !== 'manager') {
      return createErrorResponse('アクセス権限がありません', 403);
    }

    const parsedQuery = parseManagerStaffAnalysisQuery(
      request.nextUrl.searchParams
    );
    if (parsedQuery.success === false) {
      return createErrorResponse(parsedQuery.message, 400);
    }

    const adminClient = createAdminClient();
    const assignments = await resolveManagerAssignedClinics(
      adminClient,
      authResult.auth.id
    );
    const assignedClinics = assignments.map(toAssignedClinic);
    const assignedClinicIds = assignedClinics.map(clinic => clinic.id);
    const period = resolveManagerStaffAnalysisPeriod(
      parsedQuery.query.period,
      parsedQuery.query.compare
    );
    const generatedAt = new Date().toISOString();

    if (assignedClinicIds.length === 0) {
      return createSuccessResponse(
        buildManagerStaffAnalysis({
          generatedAt,
          period,
          target: parsedQuery.query.target,
          requestedClinicId: null,
          assignedClinics: [],
          staffResources: [],
          reservations: [],
          shifts: [],
          dailyReportItems: [],
          previousReservations: [],
          previousDailyReportItems: [],
        })
      );
    }

    if (
      parsedQuery.query.clinicId &&
      !assignedClinicIds.includes(parsedQuery.query.clinicId)
    ) {
      return createErrorResponse(
        'このクリニックへのアクセス権がありません',
        403
      );
    }

    const targetClinicIds =
      parsedQuery.query.target === 'clinic' && parsedQuery.query.clinicId
        ? [parsedQuery.query.clinicId]
        : assignedClinicIds;
    const comparisonPeriod =
      resolveManagerStaffAnalysisComparisonPeriod(period);
    const previousPeriod: ManagerAnalysisPeriod = {
      type: 'custom',
      startDate: comparisonPeriod.previousStartDate,
      endDate: comparisonPeriod.previousEndDate,
      bucket: period.bucket,
    };

    const [
      staffResources,
      reservations,
      shifts,
      dailyReportItems,
      previousReservations,
      previousDailyReportItems,
    ] = await Promise.all([
      fetchStaffResources(adminClient, targetClinicIds, assignedClinics),
      fetchReservations(adminClient, targetClinicIds, toMetricPeriod(period)),
      fetchStaffShifts(adminClient, targetClinicIds, toMetricPeriod(period)),
      fetchDailyReportItems(adminClient, targetClinicIds, period),
      comparisonPeriod.active
        ? fetchReservations(adminClient, targetClinicIds, previousPeriod)
        : Promise.resolve([]),
      comparisonPeriod.active
        ? fetchDailyReportItems(adminClient, targetClinicIds, {
            startDate: comparisonPeriod.previousStartDate,
            endDate: comparisonPeriod.previousEndDate,
          })
        : Promise.resolve([]),
    ]);

    return createSuccessResponse(
      buildManagerStaffAnalysis({
        generatedAt,
        period,
        target: parsedQuery.query.target,
        requestedClinicId: parsedQuery.query.clinicId,
        assignedClinics,
        staffResources,
        reservations: reservations.filter(row =>
          dateIsWithinManagerStaffPeriod(row.startsAt, period)
        ),
        shifts: shifts.filter(row =>
          dateIsWithinManagerStaffPeriod(row.shiftDate, period)
        ),
        dailyReportItems,
        previousReservations: previousReservations.filter(row =>
          dateIsWithinManagerStaffPeriod(row.startsAt, {
            startDate: comparisonPeriod.previousStartDate,
            endDate: comparisonPeriod.previousEndDate,
          })
        ),
        previousDailyReportItems,
      })
    );
  } catch (error) {
    logError(error, {
      endpoint: PATH,
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
