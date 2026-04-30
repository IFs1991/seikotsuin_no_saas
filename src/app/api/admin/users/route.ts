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
import { emailSchema, passwordSchema } from '@/lib/schemas/auth';
import { createAdminClient } from '@/lib/supabase';
import {
  CREATABLE_ADMIN_ACCOUNT_ROLES,
  canClinicAdminManagePermissionRole,
  toPermissionEntry,
  type PermissionMutationRow,
} from '@/lib/admin/users';
import {
  ADMIN_USERS_ACCESS_MESSAGES,
  canClinicAdminAccessClinic,
  getClinicAdminScopedClinicIds,
  isAdminUsersActor,
  isClinicAdminActor,
} from './access';

const AssignPermissionSchema = z.object({
  user_id: z.string().uuid(),
  clinic_id: z.string().uuid().nullable().optional(),
  role: z.enum(ADMIN_USER_ROLE_VALUES),
  create_account: z.literal(false).optional(),
});

const CreateAccountSchema = z.object({
  create_account: z.literal(true),
  full_name: z.string().trim().min(1).max(255),
  email: emailSchema,
  password: passwordSchema,
  clinic_id: z.string().uuid(),
  role: z.enum(CREATABLE_ADMIN_ACCOUNT_ROLES),
});

type PermissionRow = PermissionMutationRow;
type ExistingPermissionRow = {
  id: string;
  role: string;
  clinic_id: string | null;
  username: string | null;
};
type AdminClient = ReturnType<typeof createAdminClient>;
type CreatedAccountPersistenceInput = {
  adminClient: AdminClient;
  actorUserId: string;
  createdUserId: string;
  fullName: string;
  email: string;
  role: AdminUserRole;
  clinicId: string;
  timestamp: string;
};
type AccountWriteFailure = {
  stage: string;
  message: string;
  error: unknown;
};

const MANAGED_PASSWORD_PLACEHOLDER = 'managed_by_supabase';

const mapCreateAccountErrorMessage = (error?: { message?: string | null }) => {
  const normalizedMessage = error?.message?.toLowerCase();
  if (
    normalizedMessage?.includes('already') ||
    normalizedMessage?.includes('registered')
  ) {
    return 'ログインメールアドレスは既に使用されています';
  }

  return 'アカウントの作成に失敗しました';
};

const buildCreatedStaffRow = ({
  createdUserId,
  clinicId,
  fullName,
  email,
  role,
  timestamp,
}: CreatedAccountPersistenceInput) => ({
  id: createdUserId,
  clinic_id: clinicId,
  name: fullName,
  role,
  email,
  password_hash: MANAGED_PASSWORD_PLACEHOLDER,
  is_therapist: role === 'therapist',
  updated_at: timestamp,
});

const buildCreatedResourceRow = ({
  actorUserId,
  createdUserId,
  clinicId,
  fullName,
  email,
  role,
  timestamp,
}: CreatedAccountPersistenceInput) => ({
  id: createdUserId,
  clinic_id: clinicId,
  name: fullName,
  type: 'staff',
  staff_code: `${role}-${createdUserId}`,
  email,
  max_concurrent: 1,
  is_active: true,
  is_bookable: role === 'therapist',
  is_deleted: false,
  updated_at: timestamp,
  created_by: actorUserId,
});

const buildCreatedProfileRow = ({
  createdUserId,
  clinicId,
  fullName,
  email,
  role,
  timestamp,
}: CreatedAccountPersistenceInput) => ({
  user_id: createdUserId,
  clinic_id: clinicId,
  email,
  full_name: fullName,
  role,
  is_active: true,
  updated_at: timestamp,
});

const buildCreatedPermissionRow = ({
  createdUserId,
  clinicId,
  email,
  role,
  timestamp,
}: CreatedAccountPersistenceInput) => ({
  staff_id: createdUserId,
  clinic_id: clinicId,
  role,
  username: email,
  hashed_password: MANAGED_PASSWORD_PLACEHOLDER,
  updated_at: timestamp,
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

async function resolveAccountWriteFailure(
  stage: string,
  message: string,
  promise: PromiseLike<{ error: unknown }>
): Promise<AccountWriteFailure | null> {
  try {
    const result = await promise;
    return result.error ? { stage, message, error: result.error } : null;
  } catch (error) {
    return { stage, message, error };
  }
}

async function upsertCreatedAccountBaseRecords(
  input: CreatedAccountPersistenceInput
): Promise<AccountWriteFailure | null> {
  const { adminClient } = input;
  const [profileFailure, staffFailure, resourceFailure] = await Promise.all([
    resolveAccountWriteFailure(
      'upsert_profiles',
      'プロフィールの作成に失敗しました',
      adminClient
        .from('profiles')
        .upsert(buildCreatedProfileRow(input), { onConflict: 'user_id' })
    ),
    resolveAccountWriteFailure(
      'upsert_staff',
      'スタッフ情報の作成に失敗しました',
      adminClient
        .from('staff')
        .upsert(buildCreatedStaffRow(input), { onConflict: 'id' })
    ),
    resolveAccountWriteFailure(
      'upsert_resources',
      'スタッフリソースの作成に失敗しました',
      adminClient
        .from('resources')
        .upsert(buildCreatedResourceRow(input), { onConflict: 'id' })
    ),
  ]);

  return profileFailure ?? staffFailure ?? resourceFailure;
}

async function createAccountPermission(input: CreatedAccountPersistenceInput) {
  return input.adminClient
    .from('user_permissions')
    .upsert(buildCreatedPermissionRow(input), { onConflict: 'staff_id' })
    .select(
      'id, staff_id, role, clinic_id, username, created_at, clinics(name)'
    )
    .single();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role') ?? undefined;
  const clinicId = searchParams.get('clinic_id') ?? undefined;
  const search = searchParams.get('search')?.trim() ?? '';

  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: Array.from(ADMIN_UI_ROLES),
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { permissions, auth } = processResult;
    if (!isAdminUsersActor(permissions)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    const scopedClinicIds = getClinicAdminScopedClinicIds(permissions);
    if (isClinicAdminActor(permissions) && !scopedClinicIds?.length) {
      return createErrorResponse(
        ADMIN_USERS_ACCESS_MESSAGES.clinicScopeMissing,
        403
      );
    }

    if (
      clinicId &&
      isClinicAdminActor(permissions) &&
      !canClinicAdminAccessClinic(permissions, clinicId)
    ) {
      return createErrorResponse(
        ADMIN_USERS_ACCESS_MESSAGES.clinicAccessForbidden,
        403
      );
    }

    const adminSupabase = createAdminClient();

    let query = adminSupabase
      .from('user_permissions')
      .select(
        'id, staff_id, role, clinic_id, created_at, username, clinics(name)'
      )
      .order('created_at', { ascending: false });

    if (role) {
      if (!ADMIN_USER_ROLE_VALUES.includes(role as AdminUserRole)) {
        return createErrorResponse('不正なロール指定です', 400);
      }
      query = query.eq('role', role);
    }

    if (clinicId) {
      query = query.eq('clinic_id', clinicId);
    } else if (scopedClinicIds?.length) {
      query = query.in('clinic_id', scopedClinicIds);
    }

    const { data, error } = await query;
    if (error) {
      logError(error, {
        endpoint: '/api/admin/users',
        method: 'GET',
        userId: auth.id,
        params: { role, clinic_id: clinicId, search },
      });
      return createErrorResponse('ユーザー権限の取得に失敗しました', 500);
    }

    const rows = (data ?? []) as PermissionRow[];
    const staffIds = Array.from(
      new Set(rows.map(row => row.staff_id).filter(Boolean))
    ) as string[];

    const profileMap = new Map<
      string,
      { email: string | null; full_name: string | null }
    >();

    if (staffIds.length > 0) {
      const { data: profiles, error: profileError } = await adminSupabase
        .from('profiles')
        .select('user_id, email, full_name')
        .in('user_id', staffIds);

      if (profileError) {
        logError(profileError, {
          endpoint: '/api/admin/users',
          method: 'GET',
          userId: auth.id,
        });
      }

      (profiles ?? []).forEach(profile => {
        profileMap.set(profile.user_id, {
          email: profile.email ?? null,
          full_name: profile.full_name ?? null,
        });
      });
    }

    let items = rows.map(row =>
      toPermissionEntry(row, row.staff_id ? profileMap.get(row.staff_id) : {})
    );

    if (search) {
      const lowered = search.toLowerCase();
      items = items.filter(item => {
        return (
          (item.username ?? '').toLowerCase().includes(lowered) ||
          (item.profile_email ?? '').toLowerCase().includes(lowered) ||
          (item.profile_name ?? '').toLowerCase().includes(lowered) ||
          (item.user_id ?? '').toLowerCase().includes(lowered)
        );
      });
    }

    return createSuccessResponse({
      items,
      total: items.length,
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/users',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

export async function POST(request: NextRequest) {
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

    const createAccountRequested =
      typeof body === 'object' &&
      body !== null &&
      'create_account' in body &&
      body.create_account === true;

    if (createAccountRequested) {
      const parsed = CreateAccountSchema.safeParse(body);
      if (!parsed.success) {
        return createErrorResponse(
          '入力値にエラーがあります',
          400,
          parsed.error.flatten()
        );
      }

      const { full_name, email, password, clinic_id, role } = parsed.data;

      if (isClinicAdminActor(permissions)) {
        if (!canClinicAdminManagePermissionRole(role)) {
          return createErrorResponse(
            ADMIN_USERS_ACCESS_MESSAGES.roleForbiddenForClinicAdmin,
            403
          );
        }

        if (!canClinicAdminAccessClinic(permissions, clinic_id)) {
          return createErrorResponse(
            ADMIN_USERS_ACCESS_MESSAGES.clinicAccessForbidden,
            403
          );
        }
      }

      const adminSupabase = createAdminClient();
      const { data: authData, error: createUserError } =
        await adminSupabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name,
          },
        });

      if (createUserError || !authData.user) {
        logError(createUserError, {
          endpoint: '/api/admin/users',
          method: 'POST',
          userId: auth.id,
          params: { email, role, clinic_id, stage: 'create_auth_user' },
        });
        return createErrorResponse(
          mapCreateAccountErrorMessage(createUserError),
          400
        );
      }

      const createdUserId = authData.user.id;
      const persistenceInput = {
        adminClient: adminSupabase,
        actorUserId: auth.id,
        createdUserId,
        fullName: full_name,
        email,
        role,
        clinicId: clinic_id,
        timestamp: new Date().toISOString(),
      };

      const baseRecordFailure =
        await upsertCreatedAccountBaseRecords(persistenceInput);
      if (baseRecordFailure) {
        await rollbackCreatedAccount(adminSupabase, createdUserId);
        logError(baseRecordFailure.error, {
          endpoint: '/api/admin/users',
          method: 'POST',
          userId: auth.id,
          params: { email, role, clinic_id, stage: baseRecordFailure.stage },
        });
        return createErrorResponse(baseRecordFailure.message, 500);
      }

      const result = await createAccountPermission(persistenceInput);
      if (result.error) {
        await rollbackCreatedAccount(adminSupabase, createdUserId);
        logError(result.error, {
          endpoint: '/api/admin/users',
          method: 'POST',
          userId: auth.id,
          params: { email, role, clinic_id, stage: 'upsert_user_permissions' },
        });
        return createErrorResponse('権限の付与に失敗しました', 500);
      }

      void AuditLogger.logAdminAction(
        auth.id,
        auth.email,
        'account_create',
        result.data.id,
        {
          user_id: createdUserId,
          role,
          clinic_id,
        }
      );

      return createSuccessResponse(
        toPermissionEntry(result.data, {
          email,
          full_name,
        }),
        201
      );
    }

    const parsed = AssignPermissionSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    const assignData = parsed.data;
    const { user_id, clinic_id, role } = assignData;

    if (role !== 'admin' && !clinic_id) {
      return createErrorResponse('clinic_id が必須です', 400);
    }

    if (isClinicAdminActor(permissions)) {
      if (!canClinicAdminManagePermissionRole(role)) {
        return createErrorResponse(
          ADMIN_USERS_ACCESS_MESSAGES.roleForbiddenForClinicAdmin,
          403
        );
      }

      if (!canClinicAdminAccessClinic(permissions, clinic_id)) {
        return createErrorResponse(
          ADMIN_USERS_ACCESS_MESSAGES.clinicAccessForbidden,
          403
        );
      }
    }

    const adminSupabase = createAdminClient();

    const profilePromise = adminSupabase
      .from('profiles')
      .select('email, full_name')
      .eq('user_id', user_id)
      .maybeSingle();
    const existingPermissionPromise = adminSupabase
      .from('user_permissions')
      .select('id, hashed_password, username, role, clinic_id')
      .eq('staff_id', user_id)
      .maybeSingle();
    const staffPromise = isClinicAdminActor(permissions)
      ? adminSupabase
          .from('staff')
          .select('id, clinic_id')
          .eq('id', user_id)
          .eq('clinic_id', clinic_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const [
      { data: profile, error: profileError },
      { data: existingPermission, error: existingError },
      { data: staff, error: staffError },
    ] = await Promise.all([
      profilePromise,
      existingPermissionPromise,
      staffPromise,
    ]);

    if (profileError) {
      logError(profileError, {
        endpoint: '/api/admin/users',
        method: 'POST',
        userId: auth.id,
        params: { user_id },
      });
    }

    if (!profile?.email) {
      return createErrorResponse(
        '対象ユーザーのプロフィールが見つかりません',
        404
      );
    }

    if (isClinicAdminActor(permissions)) {
      if (staffError) {
        logError(staffError, {
          endpoint: '/api/admin/users',
          method: 'POST',
          userId: auth.id,
          params: { user_id, clinic_id },
        });
        return createErrorResponse('対象スタッフの確認に失敗しました', 500);
      }

      if (!staff) {
        return createErrorResponse(
          '対象ユーザーは選択クリニックのスタッフではありません',
          403
        );
      }
    }

    if (existingError) {
      logError(existingError, {
        endpoint: '/api/admin/users',
        method: 'POST',
        userId: auth.id,
      });
      return createErrorResponse('権限情報の取得に失敗しました', 500);
    }

    const username = profile.email;
    const targetClinicId = role === 'admin' ? null : (clinic_id ?? null);

    if (isClinicAdminActor(permissions) && existingPermission) {
      const existing = existingPermission as ExistingPermissionRow;
      if (!canClinicAdminAccessClinic(permissions, existing.clinic_id)) {
        return createErrorResponse(
          ADMIN_USERS_ACCESS_MESSAGES.clinicAccessForbidden,
          403
        );
      }

      if (!canClinicAdminManagePermissionRole(existing.role)) {
        return createErrorResponse(
          ADMIN_USERS_ACCESS_MESSAGES.permissionForbiddenForClinicAdmin,
          403
        );
      }
    }

    let result;
    if (existingPermission) {
      result = await adminSupabase
        .from('user_permissions')
        .update({
          role,
          clinic_id: targetClinicId,
          username,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPermission.id)
        .select(
          'id, staff_id, role, clinic_id, username, created_at, clinics(name)'
        )
        .single();
    } else {
      result = await adminSupabase
        .from('user_permissions')
        .insert({
          staff_id: user_id,
          role,
          clinic_id: targetClinicId,
          username,
          hashed_password: 'managed_by_supabase',
        })
        .select(
          'id, staff_id, role, clinic_id, username, created_at, clinics(name)'
        )
        .single();
    }

    if (result.error) {
      logError(result.error, {
        endpoint: '/api/admin/users',
        method: 'POST',
        userId: auth.id,
        params: { user_id, role, clinic_id: targetClinicId },
      });
      return createErrorResponse('権限の付与に失敗しました', 500);
    }

    void AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'permission_assign',
      result.data.id,
      {
        user_id,
        role,
        clinic_id: targetClinicId,
      }
    );

    return createSuccessResponse(
      toPermissionEntry(result.data, {
        email: profile.email,
        full_name: profile.full_name,
      }),
      existingPermission ? 200 : 201
    );
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/users',
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
