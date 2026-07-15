import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import {
  canManageClinicSettingsWithCompat,
  normalizeRole,
  STAFF_ROLES,
} from '@/lib/constants/roles';
import {
  createAdminClient,
  createScopedAdminContext,
  resolveScopedClinicIds,
  ScopeNotConfiguredError,
  type SupabaseServerClient,
} from '@/lib/supabase';
import {
  resolveManagerAssignedClinicsWithinScope,
  type ManagerClinicAssignment,
} from '@/lib/auth/manager-scope';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
import { selectReservableAdminClinicRows } from '@/lib/clinics/scope';

type AccessibleClinicRow = {
  id: string;
  name: string;
  parent_id: string | null;
};

type AccessibleClinicOption = Pick<AccessibleClinicRow, 'id' | 'name'>;
type AccessibleClinicsFetchResult = {
  clinics: AccessibleClinicOption[] | null;
  error: unknown | null;
};

const ACCESSIBLE_CLINIC_SELECT = 'id, name';
const ACCESSIBLE_ADMIN_CLINIC_SELECT = 'id, name, parent_id';
const ACCESSIBLE_CLINICS_ENDPOINT = '/api/clinics/accessible';

function toClinicOptions(
  rows: readonly AccessibleClinicRow[]
): AccessibleClinicOption[] {
  return rows.map(row => ({ id: row.id, name: row.name }));
}

function resolveCurrentAccessibleClinicId(
  clinics: readonly AccessibleClinicOption[],
  currentClinicId: string | null
) {
  if (!currentClinicId) {
    return null;
  }

  return clinics.some(clinic => clinic.id === currentClinicId)
    ? currentClinicId
    : null;
}

function toSortedUniqueClinicOptions(
  assignments: readonly ManagerClinicAssignment[]
): AccessibleClinicOption[] {
  const clinicsById = new Map<string, AccessibleClinicOption>();

  for (const assignment of assignments) {
    if (!assignment.clinic_name) {
      continue;
    }

    clinicsById.set(assignment.clinic_id, {
      id: assignment.clinic_id,
      name: assignment.clinic_name,
    });
  }

  return Array.from(clinicsById.values()).sort((left, right) =>
    left.name.localeCompare(right.name, 'ja')
  );
}

async function fetchScopedAdminClinics(
  supabase: SupabaseServerClient,
  scopedClinicIds: readonly string[]
): Promise<AccessibleClinicsFetchResult> {
  const { data, error } = await supabase
    .from('clinics')
    .select(ACCESSIBLE_ADMIN_CLINIC_SELECT)
    .in('id', scopedClinicIds)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .returns<AccessibleClinicRow[]>();

  if (error) {
    return { clinics: null, error };
  }

  return {
    clinics: toClinicOptions(selectReservableAdminClinicRows(data ?? [])),
    error: null,
  };
}

async function fetchDirectScopedClinics(
  supabase: SupabaseServerClient,
  scopedClinicIds: readonly string[]
): Promise<AccessibleClinicsFetchResult> {
  const { data, error } = await supabase
    .from('clinics')
    .select(ACCESSIBLE_CLINIC_SELECT)
    .in('id', scopedClinicIds)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .returns<AccessibleClinicOption[]>();

  return {
    clinics: data ?? null,
    error,
  };
}

export async function GET(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: Array.from(STAFF_ROLES),
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const { supabase, auth, permissions } = processResult;
    const normalizedRole = normalizeRole(permissions.role);

    if (normalizedRole === 'manager') {
      const adminClient = createAdminClient();
      let managerAssignments: ManagerClinicAssignment[];

      try {
        managerAssignments = await resolveManagerAssignedClinicsWithinScope(
          adminClient,
          auth.id,
          permissions.clinic_scope_ids ?? []
        );
      } catch (error) {
        logError(error, {
          endpoint: ACCESSIBLE_CLINICS_ENDPOINT,
          method: 'GET',
          userId: auth.id,
        });
        if (
          error instanceof AppError &&
          error.code === ERROR_CODES.MANAGER_SCOPE_AUTHORITY_UNAVAILABLE &&
          error.statusCode === 503
        ) {
          return createErrorResponse(
            '認証情報を確認できません。時間をおいて再度お試しください',
            503
          );
        }
        return createErrorResponse(
          '利用可能なクリニック一覧の取得に失敗しました',
          500
        );
      }

      const clinics = toSortedUniqueClinicOptions(managerAssignments);
      const currentClinicId = clinics[0]?.id ?? null;

      return createSuccessResponse({
        clinics,
        currentClinicId,
      });
    }

    const scopedClinicIds = resolveScopedClinicIds(permissions);

    if (!scopedClinicIds) {
      return createErrorResponse('クリニックスコープが設定されていません', 403);
    }

    let clinicsResult: AccessibleClinicsFetchResult;
    if (canManageClinicSettingsWithCompat(auth.role)) {
      try {
        const adminCtx = createScopedAdminContext(permissions);
        clinicsResult = await fetchScopedAdminClinics(
          adminCtx.client,
          adminCtx.scopedClinicIds
        );
      } catch (error) {
        if (error instanceof ScopeNotConfiguredError) {
          return createErrorResponse(error.message, 403);
        }
        throw error;
      }
    } else {
      clinicsResult = await fetchDirectScopedClinics(supabase, scopedClinicIds);
    }

    if (clinicsResult.error) {
      logError(clinicsResult.error, {
        endpoint: ACCESSIBLE_CLINICS_ENDPOINT,
        method: 'GET',
        userId: auth.id,
      });
      return createErrorResponse(
        '利用可能なクリニック一覧の取得に失敗しました',
        500
      );
    }

    const clinics = clinicsResult.clinics ?? [];

    return createSuccessResponse({
      clinics,
      currentClinicId: resolveCurrentAccessibleClinicId(
        clinics,
        permissions.clinic_id
      ),
    });
  } catch (error) {
    logError(error, {
      endpoint: ACCESSIBLE_CLINICS_ENDPOINT,
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
