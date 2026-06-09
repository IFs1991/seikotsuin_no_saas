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
  type AdminUserRole,
} from '@/lib/constants/roles';
import { emailSchema, passwordSchema } from '@/lib/schemas/auth';
import { createAdminClient } from '@/lib/supabase';
import { ADMIN_USERS_API_ROLES, isHqAdminActor } from '../access';

const AccountOnlyCreateSchema = z.object({
  full_name: z.string().trim().min(1).max(255),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(ADMIN_USER_ROLE_VALUES).nullable().optional(),
  clinic_id: z.string().uuid().nullable().optional(),
});

type CreateAccountError = {
  message?: string | null;
};
type AdminClient = ReturnType<typeof createAdminClient>;

const MANAGED_PASSWORD_PLACEHOLDER = 'managed_by_supabase';
const BOOKABLE_STAFF_RESOURCE_ROLES = new Set<AdminUserRole>([
  'clinic_admin',
  'manager',
  'therapist',
]);

function resolvePermissionClinicId(
  role: AdminUserRole | null,
  clinicId: string | null | undefined
): string | null {
  return role === 'admin' || role === 'manager' ? null : (clinicId ?? null);
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
  userId: string
) {
  await Promise.allSettled([
    adminClient.from('user_permissions').delete().eq('staff_id', userId),
    adminClient.from('resources').delete().eq('id', userId),
    adminClient.from('staff').delete().eq('id', userId),
    adminClient.from('profiles').delete().eq('user_id', userId),
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
        await rollbackCreatedAccount(adminClient, createdUserId);
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
        await rollbackCreatedAccount(adminClient, createdUserId);
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
        await rollbackCreatedAccount(adminClient, createdUserId);
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
