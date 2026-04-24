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
  ADMIN_UI_ROLES,
  ADMIN_USER_ROLE_VALUES,
  type AdminUserRole,
} from '@/lib/constants/roles';
import { createAdminClient } from '@/lib/supabase';
import {
  canClinicAdminManagePermissionRole,
  toPermissionEntry,
} from '@/lib/admin/users';
import {
  ADMIN_USERS_ACCESS_MESSAGES,
  canClinicAdminAccessClinic,
  isAdminUsersActor,
  isClinicAdminActor,
} from '../access';

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

export async function PATCH(
  request: NextRequest,
  context: { params: { permission_id: string } }
) {
  const { permission_id } = context.params;

  try {
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: Array.from(ADMIN_UI_ROLES),
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

    if (isClinicAdminActor(permissions)) {
      const { data, error } = await adminSupabase
        .from('user_permissions')
        .select('id, staff_id, role, clinic_id, username')
        .eq('id', permission_id)
        .maybeSingle();

      if (error) {
        logError(error, {
          endpoint: '/api/admin/users/[permission_id]',
          method: 'PATCH',
          userId: auth.id,
          params: { permission_id },
        });
        return createErrorResponse('権限情報の取得に失敗しました', 500);
      }

      if (!data) {
        return createErrorResponse('権限情報が見つかりません', 404);
      }

      existingPermission = data as ExistingPermissionRow;

      if (
        !canClinicAdminAccessClinic(permissions, existingPermission.clinic_id)
      ) {
        return createErrorResponse(
          ADMIN_USERS_ACCESS_MESSAGES.clinicAccessForbidden,
          403
        );
      }

      if (!canClinicAdminManagePermissionRole(existingPermission.role)) {
        return createErrorResponse(
          ADMIN_USERS_ACCESS_MESSAGES.permissionForbiddenForClinicAdmin,
          403
        );
      }
    }

    if (parsed.data.revoke) {
      const { error } = await adminSupabase
        .from('user_permissions')
        .delete()
        .eq('id', permission_id);

      if (error) {
        logError(error, {
          endpoint: '/api/admin/users/[permission_id]',
          method: 'PATCH',
          userId: auth.id,
          params: { permission_id },
        });
        return createErrorResponse('権限の剥奪に失敗しました', 500);
      }

      await AuditLogger.logAdminAction(
        auth.id,
        auth.email,
        'permission_revoke',
        permission_id
      );

      return createSuccessResponse({ id: permission_id, revoked: true });
    }

    const updatePayload: {
      updated_at: string;
      role?: AdminUserRole;
      clinic_id?: string | null;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.role !== undefined) updatePayload.role = parsed.data.role;
    if (parsed.data.clinic_id !== undefined)
      updatePayload.clinic_id = parsed.data.clinic_id;

    if (isClinicAdminActor(permissions)) {
      if (
        parsed.data.role !== undefined &&
        !canClinicAdminManagePermissionRole(parsed.data.role)
      ) {
        return createErrorResponse(
          ADMIN_USERS_ACCESS_MESSAGES.roleForbiddenForClinicAdmin,
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

      if (!canClinicAdminAccessClinic(permissions, targetClinicId)) {
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
