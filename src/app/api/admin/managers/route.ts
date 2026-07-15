import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { normalizeRole } from '@/lib/constants/roles';
import { createAdminClient, resolveScopedClinicIds } from '@/lib/supabase';

const ADMIN_MANAGER_API_ROLES = ['admin'] as const;
const ENDPOINT = '/api/admin/managers';

type AdminClient = ReturnType<typeof createAdminClient>;

type ClinicNameRelation =
  | {
      name: string | null;
    }
  | {
      name: string | null;
    }[]
  | null;

type ManagerPermissionRow = {
  staff_id: string | null;
  username: string | null;
  clinic_id: string | null;
  clinics: ClinicNameRelation;
};

type ProfileRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
};

type AssignmentClinicRelation =
  | {
      id: string;
      name: string | null;
      is_active: boolean | null;
    }
  | {
      id: string;
      name: string | null;
      is_active: boolean | null;
    }[]
  | null;

type ManagerAssignmentQueryRow = {
  id: string;
  manager_user_id: string;
  clinic_id: string;
  assigned_at: string;
  clinics: AssignmentClinicRelation;
};

type ManagerAssignmentScopeResult = {
  assignmentsByManager: Map<string, AssignedClinic[]>;
  managerUserIdsWithAssignments: Set<string>;
  outOfScopeManagerUserIds: Set<string>;
};

type AssignedClinic = {
  assignment_id: string;
  clinic_id: string;
  clinic_name: string | null;
  assigned_at: string;
};

type ManagerListItem = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  primary_clinic_id: string | null;
  primary_clinic_name: string | null;
  assigned_clinic_count: number;
  assigned_clinics: AssignedClinic[];
};

function readClinicName(clinics: ClinicNameRelation): string | null {
  if (!clinics) {
    return null;
  }

  const clinic = Array.isArray(clinics) ? (clinics[0] ?? null) : clinics;
  return clinic?.name ?? null;
}

function readActiveAssignmentClinic(
  clinics: AssignmentClinicRelation
): { id: string; name: string | null } | null {
  if (!clinics) {
    return null;
  }

  const clinic = Array.isArray(clinics) ? (clinics[0] ?? null) : clinics;
  if (!clinic || clinic.is_active !== true) {
    return null;
  }

  return {
    id: clinic.id,
    name: clinic.name,
  };
}

async function fetchActiveAssignmentsByManager(
  adminClient: Pick<AdminClient, 'from'>,
  managerUserIds: readonly string[],
  actorClinicIds: ReadonlySet<string>
): Promise<ManagerAssignmentScopeResult> {
  const assignmentsByManager = new Map<string, AssignedClinic[]>();
  const managerUserIdsWithAssignments = new Set<string>();
  const outOfScopeManagerUserIds = new Set<string>();
  if (managerUserIds.length === 0) {
    return {
      assignmentsByManager,
      managerUserIdsWithAssignments,
      outOfScopeManagerUserIds,
    };
  }

  const { data, error } = await adminClient
    .from('manager_clinic_assignments')
    .select(
      'id, manager_user_id, clinic_id, assigned_at, clinics(id, name, is_active)'
    )
    .in('manager_user_id', managerUserIds)
    .is('revoked_at', null)
    .returns<ManagerAssignmentQueryRow[]>();

  if (error) {
    throw error;
  }

  for (const row of data ?? []) {
    managerUserIdsWithAssignments.add(row.manager_user_id);
    if (!actorClinicIds.has(row.clinic_id)) {
      outOfScopeManagerUserIds.add(row.manager_user_id);
    }

    const clinic = readActiveAssignmentClinic(row.clinics);
    if (!clinic) {
      continue;
    }

    const currentAssignments = assignmentsByManager.get(row.manager_user_id);
    const nextAssignment: AssignedClinic = {
      assignment_id: row.id,
      clinic_id: clinic.id,
      clinic_name: clinic.name,
      assigned_at: row.assigned_at,
    };

    if (currentAssignments) {
      currentAssignments.push(nextAssignment);
    } else {
      assignmentsByManager.set(row.manager_user_id, [nextAssignment]);
    }
  }

  for (const assignments of assignmentsByManager.values()) {
    assignments.sort((left, right) =>
      (left.clinic_name ?? '').localeCompare(right.clinic_name ?? '', 'ja')
    );
  }

  return {
    assignmentsByManager,
    managerUserIdsWithAssignments,
    outOfScopeManagerUserIds,
  };
}

export async function GET(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: ADMIN_MANAGER_API_ROLES,
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const { auth, permissions } = processResult;
    if (normalizeRole(permissions.role) !== 'admin') {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    const actorClinicIds = Array.from(
      new Set(resolveScopedClinicIds(permissions) ?? [])
    );
    if (actorClinicIds.length === 0) {
      return createErrorResponse('クリニックスコープが設定されていません', 403);
    }

    const actorClinicIdSet = new Set(actorClinicIds);
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('user_permissions')
      .select('staff_id, username, clinic_id, clinics(name)')
      .eq('role', 'manager')
      .order('created_at', { ascending: false })
      .returns<ManagerPermissionRow[]>();

    if (error) {
      logError(error, {
        endpoint: ENDPOINT,
        method: 'GET',
        userId: auth.id,
      });
      return createErrorResponse(
        'マネージャー権限情報の取得に失敗しました',
        503
      );
    }

    const managerPermissionRows = (data ?? []).filter(
      (row): row is ManagerPermissionRow & { staff_id: string } =>
        typeof row.staff_id === 'string'
    );
    const outOfScopePrimaryManagerUserIds = new Set(
      managerPermissionRows
        .filter(
          row => row.clinic_id !== null && !actorClinicIdSet.has(row.clinic_id)
        )
        .map(row => row.staff_id)
    );
    const permissionRows = managerPermissionRows.filter(
      row => !outOfScopePrimaryManagerUserIds.has(row.staff_id)
    );
    const candidateManagerUserIds = Array.from(
      new Set(permissionRows.map(row => row.staff_id))
    );

    if (candidateManagerUserIds.length === 0) {
      return createSuccessResponse({
        managers: [],
        total: 0,
      });
    }

    let assignmentScopeResult: ManagerAssignmentScopeResult;
    try {
      assignmentScopeResult = await fetchActiveAssignmentsByManager(
        adminClient,
        candidateManagerUserIds,
        actorClinicIdSet
      );
    } catch (error) {
      logError(error, {
        endpoint: ENDPOINT,
        method: 'GET',
        userId: auth.id,
      });
      return createErrorResponse(
        'マネージャー担当範囲の取得に失敗しました',
        503
      );
    }

    const scopedPermissionRows = permissionRows.filter(
      row =>
        !assignmentScopeResult.outOfScopeManagerUserIds.has(row.staff_id) &&
        (row.clinic_id !== null ||
          assignmentScopeResult.managerUserIdsWithAssignments.has(row.staff_id))
    );
    const managerUserIds = Array.from(
      new Set(scopedPermissionRows.map(row => row.staff_id))
    );

    if (managerUserIds.length === 0) {
      return createSuccessResponse({
        managers: [],
        total: 0,
      });
    }

    const profileQuery = adminClient
      .from('profiles')
      .select('user_id, email, full_name')
      .in('user_id', managerUserIds)
      .returns<ProfileRow[]>();

    const profileResult = await profileQuery;

    if (profileResult.error) {
      logError(profileResult.error, {
        endpoint: ENDPOINT,
        method: 'GET',
        userId: auth.id,
      });
      return createErrorResponse(
        'マネージャープロフィールの取得に失敗しました',
        500
      );
    }

    const profilesByUserId = new Map<string, ProfileRow>();
    for (const profile of profileResult.data ?? []) {
      profilesByUserId.set(profile.user_id, profile);
    }

    const managers: ManagerListItem[] = scopedPermissionRows.map(row => {
      const profile = profilesByUserId.get(row.staff_id);
      const assignedClinics =
        assignmentScopeResult.assignmentsByManager.get(row.staff_id) ?? [];

      return {
        user_id: row.staff_id,
        email: profile?.email ?? row.username ?? null,
        full_name: profile?.full_name ?? null,
        primary_clinic_id: row.clinic_id,
        primary_clinic_name: readClinicName(row.clinics),
        assigned_clinic_count: assignedClinics.length,
        assigned_clinics: assignedClinics,
      };
    });

    return createSuccessResponse({
      managers,
      total: managers.length,
    });
  } catch (error) {
    logError(error, {
      endpoint: ENDPOINT,
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
