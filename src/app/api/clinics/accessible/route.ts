import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { STAFF_ROLES } from '@/lib/constants/roles';
import {
  createScopedAdminContext,
  resolveScopedClinicIds,
  ScopeNotConfiguredError,
  type SupabaseServerClient,
} from '@/lib/supabase';
import {
  buildClinicScopeOrFilter,
  selectReservableAdminClinicRows,
} from '@/lib/clinics/scope';

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

async function fetchScopedAdminClinics(
  supabase: SupabaseServerClient,
  scopedClinicIds: readonly string[]
): Promise<AccessibleClinicsFetchResult> {
  const { data, error } = await supabase
    .from('clinics')
    .select(ACCESSIBLE_ADMIN_CLINIC_SELECT)
    .or(buildClinicScopeOrFilter(scopedClinicIds))
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
    const scopedClinicIds = resolveScopedClinicIds(permissions);

    if (!scopedClinicIds) {
      return createErrorResponse('クリニックスコープが設定されていません', 403);
    }

    let clinicsResult: AccessibleClinicsFetchResult;
    if (auth.role === 'admin') {
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

    return createSuccessResponse({
      clinics: clinicsResult.clinics ?? [],
      currentClinicId: permissions.clinic_id,
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
