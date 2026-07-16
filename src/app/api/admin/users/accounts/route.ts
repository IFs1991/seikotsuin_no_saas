import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { ERROR_CODES } from '@/lib/error-handler';
import {
  ADMIN_USER_ROLE_VALUES,
  type AdminUserRole,
} from '@/lib/constants/roles';
import { emailSchema, passwordSchema } from '@/lib/schemas/auth';
import { createAdminClient } from '@/lib/supabase';
import {
  ADMIN_USERS_API_ROLES,
  ADMIN_USERS_ACCESS_MESSAGES,
  canAccessResolvedScopedAdminUsersClinic,
  getScopedAdminUsersClinicIds,
  isHqAdminActor,
} from '../access';

const AccountOnlyCreateSchema = z.object({
  full_name: z.string().trim().min(1).max(255),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(ADMIN_USER_ROLE_VALUES).nullable().optional(),
  clinic_id: z.string().uuid().nullable().optional(),
});

const AccountStatusUpdateSchema = z
  .object({
    user_id: z.string().uuid(),
    is_active: z.boolean(),
  })
  .strict();

type CreateAccountError = {
  message?: string | null;
};
type AdminClient = ReturnType<typeof createAdminClient>;

const MANAGED_PASSWORD_PLACEHOLDER = 'managed_by_supabase';
const ACCOUNT_DEACTIVATION_BAN_DURATION = '876000h';
const ACCOUNT_REACTIVATION_BAN_DURATION = 'none';
const BOOKABLE_STAFF_RESOURCE_ROLES = new Set<AdminUserRole>([
  'clinic_admin',
  'manager',
  'therapist',
]);

function resolvePermissionClinicId(
  _role: AdminUserRole | null,
  clinicId: string | null | undefined
): string | null {
  return clinicId ?? null;
}

const mapCreateAccountErrorMessage = (error?: CreateAccountError | null) => {
  const normalizedMessage = error?.message?.toLowerCase();
  if (
    normalizedMessage?.includes('already') ||
    normalizedMessage?.includes('registered')
  ) {
    return 'ログインメールアドレスは既に使用されています';
  }

  return 'アカウントの作成に失敗しました';
};

const buildStaffRow = ({
  userId,
  clinicId,
  fullName,
  email,
  role,
  timestamp,
}: {
  userId: string;
  clinicId: string;
  fullName: string;
  email: string;
  role: AdminUserRole;
  timestamp: string;
}) => ({
  id: userId,
  clinic_id: clinicId,
  name: fullName,
  role,
  email,
  password_hash: MANAGED_PASSWORD_PLACEHOLDER,
  is_therapist: role === 'therapist',
  updated_at: timestamp,
});

const buildResourceRow = ({
  actorUserId,
  userId,
  clinicId,
  fullName,
  email,
  role,
  timestamp,
}: {
  actorUserId: string;
  userId: string;
  clinicId: string;
  fullName: string;
  email: string;
  role: AdminUserRole;
  timestamp: string;
}) => ({
  id: userId,
  clinic_id: clinicId,
  name: fullName,
  type: 'staff',
  staff_code: `${role}-${userId}`,
  email,
  max_concurrent: 1,
  is_active: true,
  is_bookable: BOOKABLE_STAFF_RESOURCE_ROLES.has(role),
  is_deleted: false,
  updated_at: timestamp,
  created_by: actorUserId,
});

async function rollbackCreatedAccount(
  adminClient: AdminClient,
  userId: string,
  clinicId: string
) {
  await Promise.allSettled([
    adminClient
      .from('user_permissions')
      .delete()
      .eq('staff_id', userId)
      .eq('clinic_id', clinicId),
    adminClient
      .from('resources')
      .delete()
      .eq('id', userId)
      .eq('clinic_id', clinicId),
    adminClient
      .from('staff')
      .delete()
      .eq('id', userId)
      .eq('clinic_id', clinicId),
    adminClient
      .from('profiles')
      .delete()
      .eq('user_id', userId)
      .eq('clinic_id', clinicId),
  ]);

  await adminClient.auth.admin.deleteUser(userId);
}

export async function POST(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: ADMIN_USERS_API_ROLES,
      requireClinicMatch: false,
      sanitizeInputValues: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const { auth, permissions, body } = processResult;
    if (!isHqAdminActor(permissions)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    const parsed = AccountOnlyCreateSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    const fullName = parsed.data.full_name.trim();
    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;
    const role = parsed.data.role ?? null;
    const clinicId = resolvePermissionClinicId(role, parsed.data.clinic_id);
    const scopedClinicIds = getScopedAdminUsersClinicIds(permissions);
    if (!scopedClinicIds?.length) {
      return createErrorResponse(
        ADMIN_USERS_ACCESS_MESSAGES.clinicScopeMissing,
        403,
        undefined,
        ERROR_CODES.FORBIDDEN
      );
    }

    if (
      !clinicId ||
      !canAccessResolvedScopedAdminUsersClinic(scopedClinicIds, clinicId)
    ) {
      return createErrorResponse(
        ADMIN_USERS_ACCESS_MESSAGES.clinicAccessForbidden,
        403,
        undefined,
        ERROR_CODES.FORBIDDEN
      );
    }

    const adminClient = createAdminClient();

    const { data: authData, error: createUserError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      });

    if (createUserError || !authData.user) {
      logError(createUserError, {
        endpoint: '/api/admin/users/accounts',
        method: 'POST',
        userId: auth.id,
        params: { email, stage: 'create_auth_user' },
      });
      return createErrorResponse(
        mapCreateAccountErrorMessage(createUserError),
        400
      );
    }

    const createdUserId = authData.user.id;
    const timestamp = new Date().toISOString();
    const profileWrite = adminClient.from('profiles').upsert(
      {
        user_id: createdUserId,
        email,
        full_name: fullName,
        clinic_id: clinicId,
        role: role ?? 'staff',
        is_active: true,
        updated_at: timestamp,
      },
      { onConflict: 'user_id' }
    );
    if (role && role !== 'admin' && clinicId) {
      const [profileResult, staffResult, resourceResult] = await Promise.all([
        profileWrite,
        adminClient.from('staff').upsert(
          buildStaffRow({
            userId: createdUserId,
            clinicId,
            fullName,
            email,
            role,
            timestamp,
          }),
          { onConflict: 'id' }
        ),
        adminClient.from('resources').upsert(
          buildResourceRow({
            actorUserId: auth.id,
            userId: createdUserId,
            clinicId,
            fullName,
            email,
            role,
            timestamp,
          }),
          { onConflict: 'id' }
        ),
      ]);

      const baseRecordError =
        profileResult.error ?? staffResult.error ?? resourceResult.error;
      if (baseRecordError) {
        await rollbackCreatedAccount(adminClient, createdUserId, clinicId);
        logError(baseRecordError, {
          endpoint: '/api/admin/users/accounts',
          method: 'POST',
          userId: auth.id,
          params: {
            email,
            role,
            clinic_id: clinicId,
            stage: profileResult.error
              ? 'upsert_profiles'
              : 'sync_clinic_records',
          },
        });
        return createErrorResponse(
          profileResult.error
            ? 'プロフィールの作成に失敗しました'
            : '店舗関連情報の作成に失敗しました',
          500
        );
      }
    } else {
      const { error: profileError } = await profileWrite;
      if (profileError) {
        await rollbackCreatedAccount(adminClient, createdUserId, clinicId);
        logError(profileError, {
          endpoint: '/api/admin/users/accounts',
          method: 'POST',
          userId: auth.id,
          params: { email, stage: 'upsert_profiles' },
        });
        return createErrorResponse('プロフィールの作成に失敗しました', 500);
      }
    }

    let permissionId: string | null = null;
    if (role) {
      const { data: permission, error: permissionError } = await adminClient
        .from('user_permissions')
        .upsert(
          {
            staff_id: createdUserId,
            clinic_id: clinicId,
            role,
            username: email,
            hashed_password: MANAGED_PASSWORD_PLACEHOLDER,
            updated_at: timestamp,
          },
          { onConflict: 'staff_id' }
        )
        .select('id')
        .single();

      if (permissionError || !permission) {
        await rollbackCreatedAccount(adminClient, createdUserId, clinicId);
        logError(permissionError, {
          endpoint: '/api/admin/users/accounts',
          method: 'POST',
          userId: auth.id,
          params: {
            email,
            role,
            clinic_id: clinicId,
            stage: 'upsert_user_permissions',
          },
        });
        return createErrorResponse('権限の付与に失敗しました', 500);
      }

      permissionId = permission.id;
    }

    void AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'account_only_create',
      createdUserId,
      {
        user_id: createdUserId,
        email,
        permission_status: role ? 'assigned' : 'unassigned',
        role,
        clinic_id: clinicId,
      }
    );

    return createSuccessResponse(
      {
        id: createdUserId,
        email,
        full_name: fullName,
        permission_status: role ? 'assigned' : 'unassigned',
        permission_id: permissionId,
        role,
        clinic_id: clinicId,
      },
      201
    );
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/users/accounts',
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: ADMIN_USERS_API_ROLES,
      requireClinicMatch: false,
      sanitizeInputValues: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const { auth, permissions, body } = processResult;
    if (!isHqAdminActor(permissions)) {
      return createErrorResponse(
        '管理者権限が必要です',
        403,
        undefined,
        ERROR_CODES.FORBIDDEN
      );
    }

    const parsed = AccountStatusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten(),
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    const targetUserId = parsed.data.user_id;
    const nextIsActive = parsed.data.is_active;
    if (!nextIsActive && targetUserId === auth.id) {
      return createErrorResponse(
        '自分自身のアカウントは停止できません',
        403,
        undefined,
        ERROR_CODES.FORBIDDEN
      );
    }

    const scopedClinicIds = getScopedAdminUsersClinicIds(permissions);
    if (!scopedClinicIds?.length) {
      return createErrorResponse(
        ADMIN_USERS_ACCESS_MESSAGES.clinicScopeMissing,
        403,
        undefined,
        ERROR_CODES.FORBIDDEN
      );
    }

    const adminClient = createAdminClient();
    const [profileResult, permissionResult] = await Promise.all([
      adminClient
        .from('profiles')
        .select('user_id, is_active, clinic_id')
        .eq('user_id', targetUserId)
        .maybeSingle(),
      adminClient
        .from('user_permissions')
        .select('clinic_id, role')
        .eq('staff_id', targetUserId)
        .maybeSingle(),
    ]);
    const currentProfile = profileResult.data;
    const profileReadError = profileResult.error;
    const currentPermission = permissionResult.data;
    const permissionReadError = permissionResult.error;

    if (profileReadError || permissionReadError) {
      const authorityReadError = profileReadError ?? permissionReadError;
      logError(authorityReadError, {
        endpoint: '/api/admin/users/accounts',
        method: 'PATCH',
        userId: auth.id,
        params: {
          target_user_id: targetUserId,
          stage: profileReadError
            ? 'read_profile_authority'
            : 'read_permission_authority',
        },
      });
      return createErrorResponse(
        'アカウント権限の取得に失敗しました',
        503,
        undefined,
        ERROR_CODES.INTERNAL_SERVER_ERROR
      );
    }

    if (!currentProfile) {
      return createErrorResponse(
        '対象アカウントが見つかりません',
        404,
        undefined,
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    const profileClinicId = currentProfile.clinic_id;
    if (
      !profileClinicId ||
      !canAccessResolvedScopedAdminUsersClinic(scopedClinicIds, profileClinicId)
    ) {
      return createErrorResponse(
        ADMIN_USERS_ACCESS_MESSAGES.clinicAccessForbidden,
        403,
        undefined,
        ERROR_CODES.FORBIDDEN
      );
    }

    let assignmentClinicIds: string[] = [];
    if (currentPermission?.role === 'manager') {
      const { data: assignmentRows, error: assignmentReadError } =
        await adminClient
          .from('manager_clinic_assignments')
          .select('clinic_id')
          .eq('manager_user_id', targetUserId)
          .is('revoked_at', null);

      if (assignmentReadError) {
        logError(assignmentReadError, {
          endpoint: '/api/admin/users/accounts',
          method: 'PATCH',
          userId: auth.id,
          params: {
            target_user_id: targetUserId,
            stage: 'read_manager_assignment_authority',
          },
        });
        return createErrorResponse(
          'アカウント権限の取得に失敗しました',
          503,
          undefined,
          ERROR_CODES.INTERNAL_SERVER_ERROR
        );
      }

      assignmentClinicIds = (assignmentRows ?? []).map(row => row.clinic_id);
    }

    const targetClinicIds = Array.from(
      new Set(
        [
          profileClinicId,
          currentPermission?.clinic_id ?? null,
          ...assignmentClinicIds,
        ].filter((clinicId): clinicId is string => typeof clinicId === 'string')
      )
    );
    if (targetClinicIds.length === 0) {
      return createErrorResponse(
        ADMIN_USERS_ACCESS_MESSAGES.clinicAccessForbidden,
        403,
        undefined,
        ERROR_CODES.FORBIDDEN
      );
    }
    if (
      targetClinicIds.some(
        targetClinicId =>
          !canAccessResolvedScopedAdminUsersClinic(
            scopedClinicIds,
            targetClinicId
          )
      )
    ) {
      return createErrorResponse(
        ADMIN_USERS_ACCESS_MESSAGES.clinicAccessForbidden,
        403,
        undefined,
        ERROR_CODES.FORBIDDEN
      );
    }

    const timestamp = new Date().toISOString();
    if (!nextIsActive) {
      const { data: disabledProfile, error: profileUpdateError } =
        await adminClient
          .from('profiles')
          .update({ is_active: false, updated_at: timestamp })
          .eq('user_id', targetUserId)
          .eq('clinic_id', profileClinicId)
          .select('user_id, is_active')
          .maybeSingle();

      if (profileUpdateError || !disabledProfile) {
        logError(profileUpdateError, {
          endpoint: '/api/admin/users/accounts',
          method: 'PATCH',
          userId: auth.id,
          params: {
            target_user_id: targetUserId,
            stage: 'deactivate_profile',
          },
        });
        return createErrorResponse(
          'アカウントの停止に失敗しました',
          500,
          undefined,
          ERROR_CODES.INTERNAL_SERVER_ERROR
        );
      }

      const { error: banError } = await adminClient.auth.admin.updateUserById(
        targetUserId,
        {
          ban_duration: ACCOUNT_DEACTIVATION_BAN_DURATION,
        }
      );

      if (banError) {
        logError(banError, {
          endpoint: '/api/admin/users/accounts',
          method: 'PATCH',
          userId: auth.id,
          params: {
            target_user_id: targetUserId,
            stage: 'deactivate_auth_user',
            profile_is_active: false,
          },
        });
        return createErrorResponse(
          'アカウントは停止されましたが、認証セッションの停止に失敗しました。再実行してください',
          502,
          undefined,
          ERROR_CODES.EXTERNAL_SERVICE_ERROR
        );
      }
    } else {
      const { error: unbanError } = await adminClient.auth.admin.updateUserById(
        targetUserId,
        {
          ban_duration: ACCOUNT_REACTIVATION_BAN_DURATION,
        }
      );

      if (unbanError) {
        logError(unbanError, {
          endpoint: '/api/admin/users/accounts',
          method: 'PATCH',
          userId: auth.id,
          params: {
            target_user_id: targetUserId,
            stage: 'reactivate_auth_user',
          },
        });
        return createErrorResponse(
          'アカウントの再有効化に失敗しました',
          502,
          undefined,
          ERROR_CODES.EXTERNAL_SERVICE_ERROR
        );
      }

      const { data: enabledProfile, error: profileUpdateError } =
        await adminClient
          .from('profiles')
          .update({ is_active: true, updated_at: timestamp })
          .eq('user_id', targetUserId)
          .eq('clinic_id', profileClinicId)
          .select('user_id, is_active')
          .maybeSingle();

      if (profileUpdateError || !enabledProfile) {
        const { error: rebanError } =
          await adminClient.auth.admin.updateUserById(targetUserId, {
            ban_duration: ACCOUNT_DEACTIVATION_BAN_DURATION,
          });
        logError(profileUpdateError, {
          endpoint: '/api/admin/users/accounts',
          method: 'PATCH',
          userId: auth.id,
          params: {
            target_user_id: targetUserId,
            stage: 'reactivate_profile',
            auth_reban_failed: Boolean(rebanError),
          },
        });
        return createErrorResponse(
          'アカウントの再有効化に失敗しました',
          500,
          undefined,
          ERROR_CODES.INTERNAL_SERVER_ERROR
        );
      }
    }

    await AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      nextIsActive ? 'account_reactivate' : 'account_deactivate',
      targetUserId,
      {
        user_id: targetUserId,
        previous_is_active: currentProfile.is_active,
        is_active: nextIsActive,
      }
    );

    return createSuccessResponse({
      user_id: targetUserId,
      is_active: nextIsActive,
      auth_ban_applied: !nextIsActive,
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/users/accounts',
      method: 'PATCH',
      userId: 'unknown',
    });
    return createErrorResponse(
      'サーバーエラーが発生しました',
      500,
      undefined,
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
}
