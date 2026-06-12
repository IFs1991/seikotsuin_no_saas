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
  buildManagerClinicComparison,
  parseManagerClinicComparisonQuery,
  resolveManagerClinicComparisonPeriod,
  resolveManagerClinicComparisonPreviousPeriod,
  type ManagerClinicComparisonReservationRecord,
  type ManagerClinicComparisonResolvedPeriod,
} from '@/lib/manager-clinic-comparison';
import { resolveManagerAnalysisRpcTimestampBounds } from '@/lib/manager-analysis-period';
import { fetchAllRows } from '@/lib/manager-fetch';
import { fetchManagerRevenuePeriodTotals } from '@/lib/services/manager-revenue-service';
import { createAdminClient } from '@/lib/supabase';
import type { ManagerClinicComparisonClinic } from '@/types/manager-clinic-comparison';

const PATH = '/api/manager/clinic-comparison';
const MANAGER_CLINIC_COMPARISON_ALLOWED_ROLES = ['manager'] as const;

type AdminClient = ReturnType<typeof createAdminClient>;

type ReservationQueryRow = {
  id: string;
  clinic_id: string;
  status: string | null;
};

function toAssignedClinic(
  assignment: Awaited<ReturnType<typeof resolveManagerAssignedClinics>>[number]
): ManagerClinicComparisonClinic {
  return {
    id: assignment.clinic_id,
    name: assignment.clinic_name ?? '',
  };
}

function toReservationRecord(
  row: ReservationQueryRow
): ManagerClinicComparisonReservationRecord {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    status: row.status,
  };
}

async function fetchReservations(
  adminClient: AdminClient,
  clinicIds: readonly string[],
  period: Pick<
    ManagerClinicComparisonResolvedPeriod,
    'type' | 'startDate' | 'endDate' | 'bucket'
  >
): Promise<ManagerClinicComparisonReservationRecord[]> {
  if (clinicIds.length === 0) {
    return [];
  }

  const bounds = resolveManagerAnalysisRpcTimestampBounds(period);
  const rows = await fetchAllRows<ReservationQueryRow>((from, to) => {
    let query = adminClient
      .from('reservations')
      .select('id, clinic_id, status')
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

export async function GET(request: NextRequest) {
  try {
    const authResult = await processApiRequest(request, {
      allowedRoles: Array.from(MANAGER_CLINIC_COMPARISON_ALLOWED_ROLES),
      requireClinicMatch: false,
    });

    if (!authResult.success) {
      return authResult.error;
    }

    if (normalizeRole(authResult.permissions.role) !== 'manager') {
      return createErrorResponse('アクセス権限がありません', 403);
    }

    const parsedQuery = parseManagerClinicComparisonQuery(
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
    const clinics = assignments.map(toAssignedClinic);
    const clinicIds = clinics.map(clinic => clinic.id);
    const period = resolveManagerClinicComparisonPeriod(
      parsedQuery.query.period,
      parsedQuery.query.compare
    );
    const previousPeriod = resolveManagerClinicComparisonPreviousPeriod(period);
    const generatedAt = new Date().toISOString();

    if (clinicIds.length === 0) {
      return createSuccessResponse(
        buildManagerClinicComparison({
          generatedAt,
          period,
          clinics: [],
          currentRevenueTotals: [],
          previousRevenueTotals: [],
          reservations: [],
          previousReservations: [],
        })
      );
    }

    const previousReservationsPromise = previousPeriod.active
      ? fetchReservations(adminClient, clinicIds, {
          type: 'custom',
          startDate: previousPeriod.previousStartDate,
          endDate: previousPeriod.previousEndDate,
          bucket: period.bucket,
        })
      : Promise.resolve([]);

    const [
      currentRevenueTotals,
      previousRevenueTotals,
      reservations,
      previousReservations,
    ] = await Promise.all([
      fetchManagerRevenuePeriodTotals(
        adminClient,
        clinicIds,
        period.startDate,
        period.endDate
      ),
      previousPeriod.active
        ? fetchManagerRevenuePeriodTotals(
            adminClient,
            clinicIds,
            previousPeriod.previousStartDate,
            previousPeriod.previousEndDate
          )
        : Promise.resolve([]),
      fetchReservations(adminClient, clinicIds, period),
      previousReservationsPromise,
    ]);

    return createSuccessResponse(
      buildManagerClinicComparison({
        generatedAt,
        period,
        clinics,
        currentRevenueTotals,
        previousRevenueTotals,
        reservations,
        previousReservations,
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
