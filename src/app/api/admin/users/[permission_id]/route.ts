import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import {
  ADMIN_USER_ROLE_VALUES,
  normalizeRole,
  type AdminUserRole,
} from '@/lib/constants/roles';
import { createAdminClient } from '@/lib/supabase';
import { toPermissionEntry } from '@/lib/admin/users';
import {
  ADMIN_USERS_API_ROLES,
  ADMIN_USERS_ACCESS_MESSAGES,
  canAdminUsersActorManagePermissionRole,
  canAccessResolvedScopedAdminUsersClinic,
  getAdminUsersPermissionForbiddenMessage,
  getAdminUsersRoleForbiddenMessage,
  isAdminUsersActor,
  resolveScopedAdminUsersClinicIds,
  isScopedAdminUsersActor,
} from '../access';
import { isPermissionStaffResourceRole } from '@/lib/reservations/staff-resource-candidates';
import {
  hasActiveManagerClinicAssignments,
  MANAGER_ASSIGNMENTS_ROLE_CHANGE_BLOCKED_MESSAGE,
} from '@/lib/auth/manager-scope';

const PermissionUpdateSchema = z
  .object({
    role: z.enum(ADMIN_USER_ROLE_VALUES).optional(),
    clinic_id: z.string().uuid().nullable().optional(),
    revoke: z.boolean().optional(),
  })
  .refine(
    data =>
      data.revoke === true ||
      data.role !== undefined ||
      data.clinic_id !== undefined,
    {
      message: '更新対象が指定されていません',
    }
  );

type ExistingPermissionRow = {
  id: string;
  staff_id: string | null;
  role: string;
  clinic_id: string | null;
  username: string;
};
type PermissionMutationRow = ExistingPermissionRow & {
  created_at?: string | null;
  clinics?: unknown;
};

const PERMISSION_RESOURCE_SELECT = 'id, staff_id, role, clinic_id, username';

const buildPermissionStaffResourceRow = ({
  actorUserId,
  permission,
  timestamp,
}: {
  actorUserId: string;
  permission: PermissionMutationRow;
  timestamp: string;
}) => {
  if (
    !permission.staff_id ||
    !permission.clinic_id ||
    !isPermissionStaffResourceRole(permission.role)
  ) {
    return null;
  }

  return {
    id: permission.staff_id,
    clinic_id: permission.clinic_id,
    name: permission.username,
    type: 'staff',
    staff_code: `${permission.role}-${permission.staff_id}`,
    email: permission.username,
    max_concurrent: 1,
    is_active: true,
    is_bookable: true,
    is_deleted: false,
    updated_at: timestamp,
    created_by: actorUserId,
  };
};

async function syncPermissionStaffResource({
  adminSupabase,
  actorUserId,
  permission,
  timestamp,
}: {
  adminSupabase: ReturnType<typeof createAdminClient>;
  actorUserId: string;
  permission: PermissionMutationRow;
  timestamp: string;
}) {
  if (!permission.staff_id) {
    return { error: null };
  }

  if (
    !permission.clinic_id ||
    !isPermissionStaffResourceRole(permission.role)
  ) {
    return disablePermissionStaffResource({
      adminSupabase,
      permission,
      timestamp,
    });
  }

  const resourceRow = buildPermissionStaffResourceRow({
    actorUserId,
    permission,
    timestamp,
  });

  if (!resourceRow) {
    return { error: null };
  }

  return adminSupabase
    .from('resources')
    .upsert(resourceRow, { onConflict: 'id' });
}

async function disablePermissionStaffResource({
  adminSupabase,
  permission,
  timestamp,
}: {
  adminSupabase: ReturnType<typeof createAdminClient>;
  permission: ExistingPermissionRow | null;
  timestamp: string;
}) {
  if (!permission?.staff_id) {
    return { error: null };
  }

  return adminSupabase
    .from('resources')
    .update({
      is_bookable: false,
      updated_at: timestamp,
    })
    .eq('id', permission.staff_id);
}

async function loadExistingPermission(
  adminSupabase: ReturnType<typeof createAdminClient>,
  permissionId: string
) {
  return adminSupabase
    .from('user_permissions')
    .select(PERMISSION_RESOURCE_SELECT)
    .eq('id', permissionId)
    .maybeSingle();
}

function shouldGuardManagerPermissionChange(
  permission: ExistingPermissionRow | null,
  nextRole: AdminUserRole | undefined,
  revoke: boolean
): permission is ExistingPermissionRow & { staff_id: string } {
  return (
    typeof permission?.staff_id === 'string' &&
    normalizeRole(permission.role) === 'manager' &&
    (revoke || (nextRole !== undefined && nextRole !== 'manager'))
  );
}

async function deletePermission(
  adminSupabase: ReturnType<typeof createAdminClient>,
  permissionId: string,
  knownPermission: ExistingPermissionRow | null
) {
  if (knownPermission) {
    const { error } = await adminSupabase
      .from('user_permissions')
      .delete()
      .eq('id', permissionId);

    return { data: knownPermission, error };
  }

  return adminSupabase
    .from('user_permissions')
    .delete()
    .eq('id', permissionId)
    .select(PERMISSION_RESOURCE_SELECT)
    .maybeSingle();
}

export async function PATCH(
  request: NextRequest,
  context: { params: { permission_id: string } }
) {
  const { permission_id } = context.params;

  try {
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: ADMIN_USERS_API_ROLES,
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, permissions, body } = processResult;
    if (!isAdminUsersActor(permissions)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    const parsed = PermissionUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    const adminSupabase = createAdminClient();
    let existingPermission: ExistingPermissionRow | null = null;
    const isScopedActor = isScopedAdminUsersActor(permissions);
    const shouldLoadExistingPermission =
      isScopedActor ||
      parsed.data.revoke === true ||
      (parsed.data.role !== undefined && parsed.data.role !== 'manager');
    const scopedClinicIds = isScopedActor
      ? await resolveScopedAdminUsersClinicIds({
          adminClient: adminSupabase,
          actorUserId: auth.id,
          permissions,
        })
      : null;

    if (isScopedActor && !scopedClinicIds?.length) {
      return createErrorResponse(
        ADMIN_USERS_ACCESS_MESSAGES.clinicScopeMissing,
        403
      );
    }

    if (shouldLoadExistingPermission) {
      const { data, error } = await loadExistingPermission(
        adminSupabase,
        permission_id
      );

      if (error) {
        logError(error, {
          endpoint: '/api/admin/users/[permission_id]',
          method: 'PATCH',
          userId: auth.id,
          params: { permission_id },
        });
        return createErrorResponse('権限情報の取得に失敗しました', 500);
      }

      if (!data && isScopedActor) {
        return createErrorResponse('権限情報が見つかりません', 404);
      }

      existingPermission = data ?? null;
    }

    if (isScopedActor && existingPermission) {
      if (
        !canAccessResolvedScopedAdminUsersClinic(
          scopedClinicIds,
          existingPermission.clinic_id
        )
      ) {
        return createErrorResponse(
          ADMIN_USERS_ACCESS_MESSAGES.clinicAccessForbidden,
          403
        );
      }

      if (
        !canAdminUsersActorManagePermissionRole(
          permissions,
          existingPermission.role
        )
      ) {
        return createErrorResponse(
          getAdminUsersPermissionForbiddenMessage(permissions),
          403
        );
      }
    }

    if (
      shouldGuardManagerPermissionChange(
        existingPermission,
        parsed.data.role,
        parsed.data.revoke === true
      )
    ) {
      try {
        const hasActiveAssignments = await hasActiveManagerClinicAssignments(
          adminSupabase,
          existingPermission.staff_id
        );

        if (hasActiveAssignments) {
          return createErrorResponse(
            MANAGER_ASSIGNMENTS_ROLE_CHANGE_BLOCKED_MESSAGE,
            409
          );
        }
      } catch (error) {
        logError(error, {
          endpoint: '/api/admin/users/[permission_id]',
          method: 'PATCH',
          userId: auth.id,
          params: { permission_id, stage: 'manager_assignment_guard' },
        });
        return createErrorResponse('担当店舗情報の確認に失敗しました', 500);
      }
    }

    if (parsed.data.revoke) {
      const timestamp = new Date().toISOString();
      const { data: revokedPermission, error } = await deletePermission(
        adminSupabase,
        permission_id,
        existingPermission
      );

      if (error) {
        logError(error, {
          endpoint: '/api/admin/users/[permission_id]',
          method: 'PATCH',
          userId: auth.id,
          params: { permission_id },
        });
        return createErrorResponse('権限の剥奪に失敗しました', 500);
      }

      const resourceSyncResult = await disablePermissionStaffResource({
        adminSupabase,
        permission: (revokedPermission as ExistingPermissionRow | null) ?? null,
        timestamp,
      });
      if (resourceSyncResult.error) {
        logError(resourceSyncResult.error, {
          endpoint: '/api/admin/users/[permission_id]',
          method: 'PATCH',
          userId: auth.id,
          params: { permission_id, stage: 'disable_staff_resource' },
        });
        return createErrorResponse('スタッフリソースの同期に失敗しました', 500);
      }

      await AuditLogger.logAdminAction(
        auth.id,
        auth.email,
        'permission_revoke',
        permission_id
      );

      return createSuccessResponse({ id: permission_id, revoked: true });
    }

    const timestamp = new Date().toISOString();
    const updatePayload: {
      updated_at: string;
      role?: AdminUserRole;
      clinic_id?: string | null;
    } = {
      updated_at: timestamp,
    };

    if (parsed.data.role !== undefined) updatePayload.role = parsed.data.role;
    if (parsed.data.clinic_id !== undefined)
      updatePayload.clinic_id = parsed.data.clinic_id;

    if (isScopedActor) {
      if (
        parsed.data.role !== undefined &&
        !canAdminUsersActorManagePermissionRole(permissions, parsed.data.role)
      ) {
        return createErrorResponse(
          getAdminUsersRoleForbiddenMessage(permissions),
          403
        );
      }

      const targetClinicId =
        parsed.data.clinic_id !== undefined
          ? parsed.data.clinic_id
          : existingPermission?.clinic_id;

      if (!targetClinicId) {
        return createErrorResponse('clinic_id が必須です', 400);
      }

      if (
        !canAccessResolvedScopedAdminUsersClinic(
          scopedClinicIds,
          targetClinicId
        )
      ) {
        return createErrorResponse(
          ADMIN_USERS_ACCESS_MESSAGES.clinicAccessForbidden,
          403
        );
      }
    }

    const { data, error } = await adminSupabase
      .from('user_permissions')
      .update(updatePayload)
      .eq('id', permission_id)
      .select(
        'id, staff_id, role, clinic_id, username, created_at, clinics(name)'
      )
      .single();

    if (error) {
      logError(error, {
        endpoint: '/api/admin/users/[permission_id]',
        method: 'PATCH',
        userId: auth.id,
        params: { permission_id },
      });
      return createErrorResponse('権限の更新に失敗しました', 500);
    }

    await AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'permission_update',
      permission_id,
      updatePayload
    );

    const resourceSyncResult = await syncPermissionStaffResource({
      adminSupabase,
      actorUserId: auth.id,
      permission: data as PermissionMutationRow,
      timestamp,
    });
    if (resourceSyncResult.error) {
      logError(resourceSyncResult.error, {
        endpoint: '/api/admin/users/[permission_id]',
        method: 'PATCH',
        userId: auth.id,
        params: { permission_id, stage: 'sync_staff_resource' },
      });
      return createErrorResponse('スタッフリソースの同期に失敗しました', 500);
    }

    return createSuccessResponse(toPermissionEntry(data));
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/users/[permission_id]',
      method: 'PATCH',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
