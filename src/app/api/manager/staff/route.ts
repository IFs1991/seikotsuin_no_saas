import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { resolveManagerAssignedClinics } from '@/lib/auth/manager-scope';
import { normalizeRole } from '@/lib/constants/roles';
import { fetchAllRows } from '@/lib/manager-fetch';
import { createAdminClient } from '@/lib/supabase';
import type {
  ManagerStaffListClinic,
  ManagerStaffListResponse,
  ManagerStaffListRow,
} from '@/types/manager-staff-list';

const PATH = '/api/manager/staff';
const MANAGER_STAFF_ALLOWED_ROLES = ['manager'] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdminClient = ReturnType<typeof createAdminClient>;

type StaffResourceQueryRow = {
  id: string;
  name: string;
  clinic_id: string;
  is_active: boolean | null;
  is_deleted: boolean | null;
  is_bookable: boolean | null;
};

function toAssignedClinic(
  assignment: Awaited<ReturnType<typeof resolveManagerAssignedClinics>>[number]
): ManagerStaffListClinic {
  return {
    id: assignment.clinic_id,
    name: assignment.clinic_name ?? '',
  };
}

async function fetchStaffResources(
  adminClient: AdminClient,
  clinicIds: readonly string[]
): Promise<StaffResourceQueryRow[]> {
  return await fetchAllRows<StaffResourceQueryRow>((from, to) =>
    adminClient
      .from('resources')
      .select('id, name, clinic_id, is_active, is_deleted, is_bookable')
      .in('clinic_id', [...clinicIds])
      .eq('type', 'staff')
      .eq('is_deleted', false)
      .order('id')
      .range(from, to)
      .returns<StaffResourceQueryRow[]>()
  );
}

function buildStaffRows(
  rows: readonly StaffResourceQueryRow[],
  clinics: readonly ManagerStaffListClinic[]
): ManagerStaffListRow[] {
  const clinicById = new Map(clinics.map(clinic => [clinic.id, clinic]));

  return rows
    .map(row => ({
      staffId: row.id,
      staffName: row.name,
      clinicId: row.clinic_id,
      clinicName: clinicById.get(row.clinic_id)?.name ?? '',
      isActive: row.is_active === true,
      isBookable: row.is_bookable,
    }))
    .sort((a, b) => {
      const clinicDiff = a.clinicName.localeCompare(b.clinicName, 'ja');
      if (clinicDiff !== 0) {
        return clinicDiff;
      }
      return a.staffName.localeCompare(b.staffName, 'ja');
    });
}

function parseClinicId(request: NextRequest): string | null {
  const clinicId = request.nextUrl.searchParams.get('clinic_id');
  if (!clinicId) {
    return null;
  }
  return clinicId;
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await processApiRequest(request, {
      allowedRoles: Array.from(MANAGER_STAFF_ALLOWED_ROLES),
      requireClinicMatch: false,
    });

    if (!authResult.success) {
      return authResult.error;
    }

    if (normalizeRole(authResult.permissions.role) !== 'manager') {
      return createErrorResponse('アクセス権限がありません', 403);
    }

    const requestedClinicId = parseClinicId(request);
    if (requestedClinicId && !UUID_PATTERN.test(requestedClinicId)) {
      return createErrorResponse('clinic_id はUUID形式で指定してください', 400);
    }

    const adminClient = createAdminClient();
    const assignments = await resolveManagerAssignedClinics(
      adminClient,
      authResult.auth.id
    );
    const clinics = assignments.map(toAssignedClinic);
    const assignedClinicIds = clinics.map(clinic => clinic.id);
    const generatedAt = new Date().toISOString();

    if (assignedClinicIds.length === 0) {
      return createSuccessResponse({
        generatedAt,
        clinics: [],
        staff: [],
      } satisfies ManagerStaffListResponse);
    }

    if (requestedClinicId && !assignedClinicIds.includes(requestedClinicId)) {
      return createErrorResponse(
        'このクリニックへのアクセス権がありません',
        403
      );
    }

    const targetClinicIds = requestedClinicId
      ? [requestedClinicId]
      : assignedClinicIds;
    const staffResources = await fetchStaffResources(
      adminClient,
      targetClinicIds
    );

    // clinics は院フィルター select の選択肢になるため、絞り込み時も全担当院を返す
    return createSuccessResponse({
      generatedAt,
      clinics,
      staff: buildStaffRows(staffResources, clinics),
    } satisfies ManagerStaffListResponse);
  } catch (error) {
    logError(error, {
      endpoint: PATH,
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
