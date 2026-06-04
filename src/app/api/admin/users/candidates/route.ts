import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import {
  USER_CANDIDATE_LIMIT,
  type CandidateSource,
  type UserPermissionCandidate,
} from '@/lib/admin/users';
import { createAdminClient, type SupabaseServerClient } from '@/lib/supabase';
import {
  ADMIN_USERS_API_ROLES,
  ADMIN_USERS_ACCESS_MESSAGES,
  canAdminUsersActorManagePermissionRole,
  isAdminUsersActor,
  isHqAdminActor,
  resolveScopedAdminUsersClinicIds,
  isScopedAdminUsersActor,
} from '../access';

const StaffCandidateSearchSchema = z.object({
  search: z.string().trim().max(100).optional().default(''),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(USER_CANDIDATE_LIMIT),
  include_unassigned: z
    .string()
    .optional()
    .transform(value => value === 'true'),
});

const STAFF_SELECT = 'id, email, name, clinic_id, role, clinics(name)';
const PROFILE_SELECT = 'user_id, email, full_name, is_active';
const PERMISSION_SELECT = 'id, staff_id, role, clinic_id, clinics(name)';
const STAFF_CANDIDATE_SOURCE: CandidateSource = 'staff';
const PROFILE_CANDIDATE_SOURCE: CandidateSource = 'profile';

type ClinicRelation =
  | { name: string | null }[]
  | { name: string | null }
  | null;

type StaffCandidateRow = {
  id: string;
  email: string;
  name: string;
  clinic_id: string | null;
  role: string | null;
  clinics?: ClinicRelation;
};

type ProfileCandidateRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
};

type ProfileSearchRow = Pick<ProfileCandidateRow, 'user_id'>;

type PermissionCandidateRow = {
  id: string;
  staff_id: string | null;
  role: string;
  clinic_id: string | null;
  clinics?: ClinicRelation;
};

type PermissionStaffIdRow = {
  staff_id: string | null;
};

type StaffIdRow = {
  id: string;
};

type QueryResult<T> = {
  data: T;
  error: unknown | null;
};

const readClinicName = (clinics?: ClinicRelation): string | null => {
  if (!clinics) return null;
  return Array.isArray(clinics) ? (clinics[0]?.name ?? null) : clinics.name;
};

const uniqueStaffRows = (rows: StaffCandidateRow[]): StaffCandidateRow[] => {
  return Array.from(new Map(rows.map(row => [row.id, row])).values());
};

const buildIlikeOrFilter = (
  columns: readonly string[],
  search: string
): string => {
  const pattern = `%${search.replace(/[(),]/g, ' ')}%`;
  return columns.map(column => `${column}.ilike.${pattern}`).join(',');
};

const pickMissingIds = (ids: string[], rows: StaffCandidateRow[]): string[] => {
  const existingIds = new Set(rows.map(row => row.id));
  return ids.filter(id => !existingIds.has(id));
};

const isNonEmptyString = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.length > 0;

const fetchStaffCandidates = async (
  adminSupabase: SupabaseServerClient,
  search: string,
  limit: number,
  scopedClinicIds: string[] | null
): Promise<QueryResult<StaffCandidateRow[]>> => {
  let query = adminSupabase.from('staff').select(STAFF_SELECT);

  if (scopedClinicIds?.length) {
    query = query.in('clinic_id', scopedClinicIds);
  }

  if (!search) {
    const { data, error } = await query
      .order('name', { ascending: true })
      .limit(limit);

    return {
      data: (data ?? []) as StaffCandidateRow[],
      error,
    };
  }

  const { data, error } = await query
    .or(buildIlikeOrFilter(['name', 'email'], search))
    .order('name', { ascending: true })
    .limit(limit);

  return {
    data: (data ?? []) as StaffCandidateRow[],
    error,
  };
};

const fetchProfileMatchedIds = async (
  adminSupabase: SupabaseServerClient,
  search: string,
  limit: number,
  scopedClinicIds: string[] | null
): Promise<QueryResult<string[]>> => {
  if (!search) {
    return { data: [], error: null };
  }

  let query = adminSupabase
    .from('profiles')
    .select('user_id')
    .eq('is_active', true)
    .or(buildIlikeOrFilter(['full_name', 'email'], search));

  if (scopedClinicIds?.length) {
    query = query.in('clinic_id', scopedClinicIds);
  }

  const { data, error } = await query.limit(limit);

  if (error) {
    return { data: [], error };
  }

  const staffIds = Array.from(
    new Set(
      ((data ?? []) as ProfileSearchRow[]).map(profile => profile.user_id)
    )
  ).slice(0, limit);

  return { data: staffIds, error: null };
};

const fetchStaffCandidatesByIds = async (
  adminSupabase: SupabaseServerClient,
  staffIds: string[],
  limit: number,
  scopedClinicIds: string[] | null
): Promise<QueryResult<StaffCandidateRow[]>> => {
  if (staffIds.length === 0 || limit <= 0) {
    return { data: [], error: null };
  }

  let query = adminSupabase
    .from('staff')
    .select(STAFF_SELECT)
    .in('id', staffIds);

  if (scopedClinicIds?.length) {
    query = query.in('clinic_id', scopedClinicIds);
  }

  const { data, error: staffError } = await query.limit(limit);

  return {
    data: (data ?? []) as StaffCandidateRow[],
    error: staffError,
  };
};

const fetchUnassignedProfileCandidates = async (
  adminSupabase: SupabaseServerClient,
  search: string,
  limit: number
): Promise<QueryResult<UserPermissionCandidate[]>> => {
  if (limit <= 0) {
    return { data: [], error: null };
  }

  let query = adminSupabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('is_active', true);

  if (search) {
    query = query.or(buildIlikeOrFilter(['full_name', 'email'], search));
  }

  const { data, error } = await query
    .order('full_name', { ascending: true })
    .limit(limit);

  if (error) {
    return { data: [], error };
  }

  const profiles = ((data ?? []) as ProfileCandidateRow[]).filter(
    profile => profile.is_active !== false && isNonEmptyString(profile.email)
  );
  const profileIds = profiles.map(profile => profile.user_id);

  if (profileIds.length === 0) {
    return { data: [], error: null };
  }

  const [
    { data: permissionsData, error: permissionError },
    { data: staffData, error: staffError },
  ] = await Promise.all([
    adminSupabase
      .from('user_permissions')
      .select('staff_id')
      .in('staff_id', profileIds),
    adminSupabase.from('staff').select('id').in('id', profileIds),
  ]);

  if (permissionError || staffError) {
    return { data: [], error: permissionError ?? staffError };
  }

  const assignedIds = new Set<string>();
  ((permissionsData ?? []) as PermissionStaffIdRow[]).forEach(permission => {
    if (permission.staff_id) {
      assignedIds.add(permission.staff_id);
    }
  });
  ((staffData ?? []) as StaffIdRow[]).forEach(staff => {
    assignedIds.add(staff.id);
  });

  const items: UserPermissionCandidate[] = profiles
    .filter(profile => !assignedIds.has(profile.user_id))
    .map(profile => ({
      user_id: profile.user_id,
      email: profile.email,
      full_name: profile.full_name || profile.email,
      clinic_id: null,
      clinic_name: null,
      staff_role: null,
      current_role: null,
      permission_id: null,
      permission_clinic_id: null,
      permission_clinic_name: null,
      candidate_source: PROFILE_CANDIDATE_SOURCE,
    }))
    .slice(0, limit);

  return {
    data: items,
    error: null,
  };
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = StaffCandidateSearchSchema.safeParse({
    search: searchParams.get('search') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    include_unassigned: searchParams.get('include_unassigned') ?? undefined,
  });

  if (!parsed.success) {
    return createErrorResponse(
      '入力値にエラーがあります',
      400,
      parsed.error.flatten()
    );
  }

  const { search, limit, include_unassigned } = parsed.data;

  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: ADMIN_USERS_API_ROLES,
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, permissions } = processResult;
    if (!isAdminUsersActor(permissions)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    const adminSupabase = createAdminClient();
    const scopedClinicIds = await resolveScopedAdminUsersClinicIds({
      adminClient: adminSupabase,
      actorUserId: auth.id,
      permissions,
    });

    if (isScopedAdminUsersActor(permissions) && !scopedClinicIds?.length) {
      return createErrorResponse(
        ADMIN_USERS_ACCESS_MESSAGES.clinicScopeMissing,
        403
      );
    }

    const canIncludeUnassigned =
      include_unassigned && isHqAdminActor(permissions);
    const [staffResult, profileMatchedIdsResult] = await Promise.all([
      fetchStaffCandidates(adminSupabase, search, limit, scopedClinicIds),
      fetchProfileMatchedIds(adminSupabase, search, limit, scopedClinicIds),
    ]);

    if (staffResult.error || profileMatchedIdsResult.error) {
      const error = staffResult.error ?? profileMatchedIdsResult.error;
      logError(error, {
        endpoint: '/api/admin/users/candidates',
        method: 'GET',
        userId: auth.id,
        params: { search, include_unassigned },
      });
      return createErrorResponse('ユーザー候補の取得に失敗しました', 500);
    }

    const missingProfileMatchedStaffIds = pickMissingIds(
      profileMatchedIdsResult.data,
      staffResult.data
    );
    const profileMatchedStaffResult = await fetchStaffCandidatesByIds(
      adminSupabase,
      missingProfileMatchedStaffIds,
      limit,
      scopedClinicIds
    );

    if (profileMatchedStaffResult.error) {
      logError(profileMatchedStaffResult.error, {
        endpoint: '/api/admin/users/candidates',
        method: 'GET',
        userId: auth.id,
        params: { search, include_unassigned },
      });
      return createErrorResponse('ユーザー候補の取得に失敗しました', 500);
    }

    const staffRows = uniqueStaffRows([
      ...staffResult.data,
      ...profileMatchedStaffResult.data,
    ]).slice(0, limit);
    const staffIds = staffRows.map(row => row.id);

    if (staffIds.length === 0) {
      if (!canIncludeUnassigned) {
        return createSuccessResponse({ items: [], total: 0 });
      }

      const unassignedResult = await fetchUnassignedProfileCandidates(
        adminSupabase,
        search,
        limit
      );

      if (unassignedResult.error) {
        logError(unassignedResult.error, {
          endpoint: '/api/admin/users/candidates',
          method: 'GET',
          userId: auth.id,
          params: { search, include_unassigned },
        });
        return createErrorResponse('ユーザー候補の取得に失敗しました', 500);
      }

      return createSuccessResponse({
        items: unassignedResult.data,
        total: unassignedResult.data.length,
      });
    }

    const [
      { data: profiles, error: profileError },
      { data: permissionsData, error: permissionError },
    ] = await Promise.all([
      adminSupabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('is_active', true)
        .in('user_id', staffIds),
      (() => {
        let permissionQuery = adminSupabase
          .from('user_permissions')
          .select(PERMISSION_SELECT)
          .in('staff_id', staffIds);

        if (scopedClinicIds?.length) {
          permissionQuery = permissionQuery.in('clinic_id', scopedClinicIds);
        }

        return permissionQuery;
      })(),
    ]);

    if (profileError || permissionError) {
      const error = profileError ?? permissionError;
      logError(error, {
        endpoint: '/api/admin/users/candidates',
        method: 'GET',
        userId: auth.id,
        params: { search, include_unassigned },
      });
      return createErrorResponse('ユーザー候補の取得に失敗しました', 500);
    }

    const profileMap = new Map<string, ProfileCandidateRow>();
    ((profiles ?? []) as ProfileCandidateRow[]).forEach(profile => {
      profileMap.set(profile.user_id, profile);
    });

    const permissionMap = new Map<string, PermissionCandidateRow>();
    ((permissionsData ?? []) as PermissionCandidateRow[]).forEach(
      permission => {
        if (permission.staff_id) {
          permissionMap.set(permission.staff_id, permission);
        }
      }
    );

    const staffItems: UserPermissionCandidate[] = staffRows
      .map(row => {
        const profile = profileMap.get(row.id);
        if (!profile?.email || profile.is_active === false) {
          return null;
        }

        const permission = permissionMap.get(row.id);
        if (
          permission &&
          isScopedAdminUsersActor(permissions) &&
          !canAdminUsersActorManagePermissionRole(permissions, permission.role)
        ) {
          return null;
        }

        return {
          user_id: row.id,
          email: profile.email || row.email,
          full_name: profile.full_name || row.name,
          clinic_id: row.clinic_id,
          clinic_name: readClinicName(row.clinics),
          staff_role: row.role,
          current_role: permission?.role ?? null,
          permission_id: permission?.id ?? null,
          permission_clinic_id: permission?.clinic_id ?? null,
          permission_clinic_name: readClinicName(permission?.clinics),
          candidate_source: STAFF_CANDIDATE_SOURCE,
        };
      })
      .filter((item): item is UserPermissionCandidate => item !== null)
      .sort(
        (a, b) =>
          a.full_name.localeCompare(b.full_name, 'ja') ||
          a.email.localeCompare(b.email)
      )
      .slice(0, limit);

    let unassignedResult: QueryResult<UserPermissionCandidate[]> = {
      data: [],
      error: null,
    };
    const remainingUnassignedLimit = limit - staffItems.length;
    if (canIncludeUnassigned && remainingUnassignedLimit > 0) {
      unassignedResult = await fetchUnassignedProfileCandidates(
        adminSupabase,
        search,
        remainingUnassignedLimit
      );
    }

    if (unassignedResult.error) {
      logError(unassignedResult.error, {
        endpoint: '/api/admin/users/candidates',
        method: 'GET',
        userId: auth.id,
        params: { search, include_unassigned },
      });
      return createErrorResponse('ユーザー候補の取得に失敗しました', 500);
    }

    const items = [...staffItems, ...unassignedResult.data].slice(0, limit);

    return createSuccessResponse({
      items,
      total: items.length,
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/users/candidates',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
