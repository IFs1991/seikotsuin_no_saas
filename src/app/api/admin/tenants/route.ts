import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
  sanitizeInput,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { createAdminClient } from '@/lib/supabase';
import {
  createScopedAdminContext,
  resolveChildClinicInScope,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';
import { isAreaManagerRole, type Role } from '@/lib/constants/roles';
import { AnalyticsReadService } from '@/lib/services/analytics-read-service';
import {
  emailSchema,
  passwordSchema,
  sanitizeAuthInput,
} from '@/lib/schemas/auth';
import {
  buildClinicHierarchyRows,
  buildClinicHierarchySummary,
  CLINIC_HIERARCHY_SELECT,
  CLINIC_LIST_SELECT,
  type ClinicAdminAccount,
  type ClinicHierarchySummary,
  type ClinicListRow,
  type ScopedClinicLookupRow,
} from '@/lib/admin/tenants';
import { selectReservableAdminClinicRows } from '@/lib/clinics/scope';
import { countActiveChildClinics } from '@/lib/billing/admin';
import {
  activateBillableStoreIfCapacity,
  buildStoreActivationPlan,
  ensureStripeStoreAddOnQuantity,
  fetchTenantBillingSubscription,
  isTenantBillingGuardActive,
  markClinicBillingActivationFailed,
  type BillingActivationStatus,
  type StoreActivationPlan,
} from '@/lib/billing/tenant-activation';
import { writeBillingAuditLog } from '@/lib/billing/audit';

/**
 * Clinic Create Schema for admin tenant management.
 *
 * Supports:
 * - Child clinic creation under an in-scope HQ clinic (parent_id != null)
 *
 * Parent selection is validated at the application layer because this route
 * uses service-role access for admin operations.
 */
const ClinicCreateSchema = z
  .object({
    name: z.string().min(1, 'クリニック名は必須です').max(255),
    address: z.string().max(500).optional(),
    phone_number: z.string().max(50).optional(),
    is_active: z.boolean().optional(),
    parent_id: z
      .string({
        required_error: '親テナントを選択してください',
        invalid_type_error: '親テナントを選択してください',
      })
      .uuid('親テナントIDの形式が不正です'),
    login_full_name: z.string().trim().min(1).max(255).optional(),
    login_email: emailSchema.optional(),
    login_password: passwordSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const hasLoginEmail = value.login_email !== undefined;
    const hasLoginPassword = value.login_password !== undefined;

    if (hasLoginEmail !== hasLoginPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasLoginEmail ? ['login_password'] : ['login_email'],
        message:
          'ログインID（メールアドレス）と初期パスワードはセットで指定してください',
      });
    }
  });

const requireAdmin = (role: string) => role === 'admin';
const CLINIC_ADMIN_ROLE = 'clinic_admin';
const MANAGED_PASSWORD_PLACEHOLDER = 'managed_by_supabase';
const TENANTS_ENDPOINT = '/api/admin/tenants';
const TENANT_GET_ROLES = [
  'admin',
  'manager',
] as const satisfies readonly Role[];
type AdminClient = ReturnType<typeof createAdminClient>;

type ClinicCreateInput = z.infer<typeof ClinicCreateSchema>;
type NormalizedClinicCreateInput = {
  clinic: {
    name: string;
    address: string | null;
    phone_number: string | null;
    is_active: boolean;
    parent_id: string;
    billing_activation_status?: BillingActivationStatus;
    billing_activation_requested_at?: string | null;
    billing_activated_at?: string | null;
    billing_activation_failed_at?: string | null;
    billing_activation_error?: string | null;
  };
  loginFullName: string | null;
  loginEmail: string | null;
  loginPassword: string | null;
  shouldCreateClinicAdmin: boolean;
};
type RollbackStage =
  | 'rollback_user_permissions'
  | 'rollback_resources'
  | 'rollback_staff'
  | 'rollback_profiles'
  | 'rollback_clinic'
  | 'rollback_auth_user';
type CreateClinicAdminResourcesInput = {
  adminClient: AdminClient;
  endpointUserId: string;
  clinicId: string;
  clinicName: string;
  clinicAdminName: string;
  loginEmail: string;
  loginPassword: string;
  activationMode: ClinicAdminActivationMode;
};
type CreateClinicAdminResourcesResult =
  | {
      success: true;
      adminAccount: ClinicAdminAccount;
    }
  | {
      success: false;
      errorResponse: Response;
    };
type ParentClinicRow = ScopedClinicLookupRow & {
  is_active: boolean | null;
};
type ParentValidationResult =
  | {
      success: true;
      parent: ParentClinicRow | null;
    }
  | {
      success: false;
      errorResponse: Response;
    };

type ClinicAdminRecordInput = {
  createdUserId: string;
  clinicId: string;
  clinicAdminName: string;
  loginEmail: string;
  timestamp: string;
  activationMode: ClinicAdminActivationMode;
};
type ClinicAdminPersistenceInput = ClinicAdminRecordInput & {
  adminClient: AdminClient;
  endpointUserId: string;
};
type ClinicAdminWriteFailure = {
  stage: string;
  message: string;
  error: unknown;
};
type ClinicAdminActivationMode = 'active' | 'pending';
type PendingClinicAdminRow = {
  id: string;
  email: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isScopedClinicLookupRow(
  value: unknown
): value is ScopedClinicLookupRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isNullableString(value.parent_id)
  );
}

function isClinicListRow(value: unknown): value is ClinicListRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isNullableString(value.parent_id) &&
    isNullableString(value.address) &&
    isNullableString(value.phone_number) &&
    typeof value.is_active === 'boolean' &&
    typeof value.created_at === 'string'
  );
}

function toClinicListRows(value: unknown): ClinicListRow[] {
  return Array.isArray(value) ? value.filter(isClinicListRow) : [];
}

function toScopedClinicLookupRows(value: unknown): ScopedClinicLookupRow[] {
  return Array.isArray(value) ? value.filter(isScopedClinicLookupRow) : [];
}

function buildClinicAdminName(clinicName: string) {
  return `${clinicName} 管理者`;
}

function logTenantPostError(
  error: unknown,
  userId: string,
  params?: Record<string, unknown>
) {
  logError(error, {
    endpoint: TENANTS_ENDPOINT,
    method: 'POST',
    userId,
    params,
  });
}

function logTenantRollbackError(
  error: unknown,
  userId: string,
  stage: RollbackStage,
  extraParams?: Record<string, unknown>
) {
  logTenantPostError(error, userId, {
    stage,
    ...extraParams,
  });
}

function normalizeClinicCreateInput(
  input: ClinicCreateInput
): NormalizedClinicCreateInput {
  const clinicName = sanitizeInput(input.name) as string;
  const loginFullName = input.login_full_name
    ? (sanitizeInput(input.login_full_name) as string)
    : null;
  const loginEmail = input.login_email
    ? sanitizeAuthInput(input.login_email).toLowerCase()
    : null;
  const loginPassword = input.login_password
    ? sanitizeAuthInput(input.login_password)
    : null;

  return {
    clinic: {
      name: clinicName,
      address:
        input.address !== undefined
          ? (sanitizeInput(input.address) as string) || null
          : null,
      phone_number:
        input.phone_number !== undefined
          ? (sanitizeInput(input.phone_number) as string) || null
          : null,
      is_active: input.is_active ?? true,
      parent_id: input.parent_id,
    },
    loginFullName,
    loginEmail,
    loginPassword,
    shouldCreateClinicAdmin: loginEmail !== null && loginPassword !== null,
  };
}

async function validateParentClinic(
  adminClient: ReturnType<typeof createAdminClient>,
  scopedClinicIds: string[],
  parentId: string
): Promise<ParentValidationResult> {
  if (!scopedClinicIds.includes(parentId)) {
    return {
      success: false,
      errorResponse: createErrorResponse(
        '指定した親テナントへのアクセス権限がありません',
        403
      ),
    };
  }

  const { data: parentClinic, error } = await adminClient
    .from('clinics')
    .select('id, name, parent_id, is_active')
    .eq('id', parentId)
    .single();

  if (error || !parentClinic) {
    return {
      success: false,
      errorResponse: createErrorResponse('親テナントが見つかりません', 400),
    };
  }

  if (parentClinic.is_active !== true) {
    return {
      success: false,
      errorResponse: createErrorResponse(
        '無効な親テナントは指定できません',
        400
      ),
    };
  }

  if (parentClinic.parent_id !== null) {
    return {
      success: false,
      errorResponse: createErrorResponse(
        '親テナントには本部テナントのみ指定できます',
        400
      ),
    };
  }

  return {
    success: true,
    parent: parentClinic,
  };
}

function createBillingActivationPlanErrorResponse(
  plan: Extract<StoreActivationPlan, { success: false }>
) {
  switch (plan.errorCode) {
    case 'subscription_not_found':
      return createErrorResponse('店舗追加には有効なGroup契約が必要です', 402);
    case 'subscription_not_group':
      return createErrorResponse(
        'Single Clinicプランでは子テナントを追加できません',
        403
      );
    case 'subscription_not_writable':
      return createErrorResponse('現在の契約状態では店舗を追加できません', 402);
  }
}

function mapCreateUserErrorMessage(error?: { message?: string | null } | null) {
  const normalizedMessage = error?.message?.toLowerCase();
  if (
    normalizedMessage?.includes('already') ||
    normalizedMessage?.includes('registered')
  ) {
    return 'ログインID（メールアドレス）は既に使用されています';
  }

  return '店舗アカウントの作成に失敗しました';
}

async function rollbackCreatedClinicAdminResources(
  adminClient: AdminClient,
  userId: string,
  clinicId: string
) {
  const { error: deletePermissionError } = await adminClient
    .from('user_permissions')
    .delete()
    .eq('staff_id', userId)
    .eq('clinic_id', clinicId);
  if (deletePermissionError) {
    logTenantRollbackError(
      deletePermissionError,
      userId,
      'rollback_user_permissions'
    );
  }

  const { error: deleteResourceError } = await adminClient
    .from('resources')
    .delete()
    .eq('id', userId)
    .eq('clinic_id', clinicId);
  if (deleteResourceError) {
    logTenantRollbackError(deleteResourceError, userId, 'rollback_resources');
  }

  const { error: deleteStaffError } = await adminClient
    .from('staff')
    .delete()
    .eq('id', userId)
    .eq('clinic_id', clinicId);
  if (deleteStaffError) {
    logTenantRollbackError(deleteStaffError, userId, 'rollback_staff');
  }

  const { error: deleteProfileError } = await adminClient
    .from('profiles')
    .delete()
    .eq('user_id', userId)
    .eq('clinic_id', clinicId);
  if (deleteProfileError) {
    logTenantRollbackError(deleteProfileError, userId, 'rollback_profiles');
  }

  const { error: deleteUserError } =
    await adminClient.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    logTenantRollbackError(deleteUserError, userId, 'rollback_auth_user');
  }
}

async function rollbackCreatedClinicRecord(
  adminClient: AdminClient,
  clinicId: string,
  parentClinicId: string,
  userId: string
) {
  const { data: deletedClinic, error: deleteClinicError } = await adminClient
    .from('clinics')
    .delete()
    .eq('id', clinicId)
    .eq('parent_id', parentClinicId)
    .select('id')
    .maybeSingle();

  if (deleteClinicError || !deletedClinic) {
    const rollbackError =
      deleteClinicError ??
      new Error('Scoped clinic rollback did not delete a row');
    logTenantRollbackError(rollbackError, userId, 'rollback_clinic', {
      clinicId,
      parentClinicId,
    });
    throw rollbackError;
  }
}

function buildClinicAdminProfileRow({
  createdUserId,
  clinicId,
  clinicAdminName,
  loginEmail,
  timestamp,
  activationMode,
}: ClinicAdminRecordInput) {
  return {
    user_id: createdUserId,
    clinic_id: clinicId,
    email: loginEmail,
    full_name: clinicAdminName,
    role: CLINIC_ADMIN_ROLE,
    is_active: activationMode === 'active',
    updated_at: timestamp,
  };
}

function buildClinicAdminStaffRow({
  createdUserId,
  clinicId,
  clinicAdminName,
  loginEmail,
  timestamp,
  activationMode,
}: ClinicAdminRecordInput) {
  return {
    id: createdUserId,
    clinic_id: clinicId,
    name: clinicAdminName,
    role: CLINIC_ADMIN_ROLE,
    email: loginEmail,
    password_hash: MANAGED_PASSWORD_PLACEHOLDER,
    is_therapist: activationMode === 'active',
    updated_at: timestamp,
  };
}

function buildClinicAdminResourceRow({
  createdUserId,
  clinicId,
  clinicAdminName,
  loginEmail,
  timestamp,
  endpointUserId,
  activationMode,
}: ClinicAdminPersistenceInput) {
  const isActive = activationMode === 'active';
  return {
    id: createdUserId,
    clinic_id: clinicId,
    name: clinicAdminName,
    type: 'staff',
    staff_code: `clinic-admin-${createdUserId}`,
    email: loginEmail,
    max_concurrent: 1,
    is_active: isActive,
    is_bookable: isActive,
    is_deleted: false,
    updated_at: timestamp,
    created_by: endpointUserId,
  };
}

function buildClinicAdminPermissionRow({
  createdUserId,
  clinicId,
  loginEmail,
  timestamp,
}: ClinicAdminRecordInput) {
  return {
    staff_id: createdUserId,
    clinic_id: clinicId,
    role: CLINIC_ADMIN_ROLE,
    username: loginEmail,
    hashed_password: MANAGED_PASSWORD_PLACEHOLDER,
    updated_at: timestamp,
  };
}

async function resolveWriteFailure(
  stage: string,
  message: string,
  promise: PromiseLike<{ error: unknown }>
): Promise<ClinicAdminWriteFailure | null> {
  try {
    const result = await promise;
    return result.error ? { stage, message, error: result.error } : null;
  } catch (error) {
    return { stage, message, error };
  }
}

async function upsertClinicAdminBaseRecords(
  input: ClinicAdminPersistenceInput
): Promise<ClinicAdminWriteFailure | null> {
  const { adminClient } = input;
  const [profileFailure, staffFailure, resourceFailure] = await Promise.all([
    resolveWriteFailure(
      'upsert_profiles',
      '店舗アカウントのプロフィール作成に失敗しました',
      adminClient
        .from('profiles')
        .upsert(buildClinicAdminProfileRow(input), { onConflict: 'user_id' })
    ),
    resolveWriteFailure(
      'upsert_staff',
      '店舗アカウントの作成に失敗しました',
      adminClient
        .from('staff')
        .upsert(buildClinicAdminStaffRow(input), { onConflict: 'id' })
    ),
    resolveWriteFailure(
      'upsert_resources',
      '店舗管理者の施術者リソース作成に失敗しました',
      adminClient
        .from('resources')
        .upsert(buildClinicAdminResourceRow(input), { onConflict: 'id' })
    ),
  ]);

  return profileFailure ?? staffFailure ?? resourceFailure;
}

async function upsertClinicAdminPermission(input: ClinicAdminPersistenceInput) {
  return await resolveWriteFailure(
    'upsert_user_permissions',
    '店舗アカウントの権限設定に失敗しました',
    input.adminClient
      .from('user_permissions')
      .upsert(buildClinicAdminPermissionRow(input), {
        onConflict: 'staff_id',
      })
  );
}

async function createClinicAdminResources({
  adminClient,
  endpointUserId,
  clinicId,
  clinicName,
  clinicAdminName,
  loginEmail,
  loginPassword,
  activationMode,
}: CreateClinicAdminResourcesInput): Promise<CreateClinicAdminResourcesResult> {
  const timestamp = new Date().toISOString();

  const { data: authData, error: createUserError } =
    await adminClient.auth.admin.createUser({
      email: loginEmail,
      password: loginPassword,
      email_confirm: true,
      user_metadata: {
        full_name: clinicAdminName,
      },
    });

  if (createUserError || !authData.user) {
    logTenantPostError(createUserError, endpointUserId, {
      clinic_name: clinicName,
      login_email: loginEmail,
      stage: 'create_auth_user',
    });
    return {
      success: false as const,
      errorResponse: createErrorResponse(
        mapCreateUserErrorMessage(createUserError),
        400
      ),
    };
  }

  const createdUserId = authData.user.id;
  const persistenceInput = {
    adminClient,
    endpointUserId,
    createdUserId,
    clinicId,
    clinicAdminName,
    loginEmail,
    timestamp,
    activationMode,
  };

  const cleanupAndReturn = async (
    error: unknown,
    message: string,
    stage: string
  ): Promise<CreateClinicAdminResourcesResult> => {
    await rollbackCreatedClinicAdminResources(
      adminClient,
      createdUserId,
      clinicId
    );
    logTenantPostError(error, endpointUserId, {
      clinic_name: clinicName,
      clinic_id: clinicId,
      login_email: loginEmail,
      stage,
    });
    return {
      success: false as const,
      errorResponse: createErrorResponse(message, 500),
    };
  };

  const baseRecordFailure =
    await upsertClinicAdminBaseRecords(persistenceInput);
  if (baseRecordFailure) {
    return await cleanupAndReturn(
      baseRecordFailure.error,
      baseRecordFailure.message,
      baseRecordFailure.stage
    );
  }

  if (activationMode === 'active') {
    const permissionFailure =
      await upsertClinicAdminPermission(persistenceInput);
    if (permissionFailure) {
      return await cleanupAndReturn(
        permissionFailure.error,
        permissionFailure.message,
        permissionFailure.stage
      );
    }
  }

  return {
    success: true as const,
    adminAccount: {
      email: loginEmail,
      role: CLINIC_ADMIN_ROLE,
    },
  };
}

function isPendingClinicAdminRow(
  value: unknown
): value is PendingClinicAdminRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.email === 'string'
  );
}

function toPendingClinicAdminRows(value: unknown): PendingClinicAdminRow[] {
  return Array.isArray(value) ? value.filter(isPendingClinicAdminRow) : [];
}

async function enablePendingClinicAdminResources(input: {
  adminClient: AdminClient;
  clinicId: string;
}): Promise<ClinicAdminAccount | null> {
  const timestamp = new Date().toISOString();
  const { data: staffRows, error: staffError } = await input.adminClient
    .from('staff')
    .select('id, email')
    .eq('clinic_id', input.clinicId)
    .eq('role', CLINIC_ADMIN_ROLE);

  if (staffError) {
    throw staffError;
  }

  const pendingAdmins = toPendingClinicAdminRows(staffRows);

  const [profileUpdate, staffUpdate, resourceUpdate] = await Promise.all([
    input.adminClient
      .from('profiles')
      .update({ is_active: true, updated_at: timestamp })
      .eq('clinic_id', input.clinicId)
      .eq('role', CLINIC_ADMIN_ROLE),
    input.adminClient
      .from('staff')
      .update({ is_therapist: true, updated_at: timestamp })
      .eq('clinic_id', input.clinicId)
      .eq('role', CLINIC_ADMIN_ROLE),
    input.adminClient
      .from('resources')
      .update({
        is_active: true,
        is_bookable: true,
        is_deleted: false,
        updated_at: timestamp,
      })
      .eq('clinic_id', input.clinicId)
      .eq('type', 'staff'),
  ]);

  const writeFailure =
    profileUpdate.error ?? staffUpdate.error ?? resourceUpdate.error ?? null;
  if (writeFailure) {
    throw writeFailure;
  }

  if (pendingAdmins.length === 0) {
    return null;
  }

  const permissionRows = pendingAdmins.map(row => ({
    staff_id: row.id,
    clinic_id: input.clinicId,
    role: CLINIC_ADMIN_ROLE,
    username: row.email,
    hashed_password: MANAGED_PASSWORD_PLACEHOLDER,
    updated_at: timestamp,
  }));
  const { error: permissionError } = await input.adminClient
    .from('user_permissions')
    .upsert(permissionRows, { onConflict: 'staff_id' });

  if (permissionError) {
    throw permissionError;
  }

  return {
    email: pendingAdmins[0].email,
    role: CLINIC_ADMIN_ROLE,
  };
}

interface ClinicWithKPI extends ClinicListRow, ClinicHierarchySummary {
  kpi?: {
    revenue: number;
    patients: number;
    staff_performance_score: number | null;
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim() ?? '';
  const isActiveParam = searchParams.get('is_active');
  const includeKpi = searchParams.get('include_kpi') === 'true';

  const isActiveFilter =
    isActiveParam === 'true'
      ? true
      : isActiveParam === 'false'
        ? false
        : undefined;

  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: TENANT_GET_ROLES,
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const { permissions, auth } = processResult;
    const isManagerAreaKpiRequest =
      isAreaManagerRole(permissions.role) && includeKpi;
    if (!requireAdmin(permissions.role) && !isManagerAreaKpiRequest) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    let adminCtx;
    try {
      adminCtx = createScopedAdminContext(permissions);
    } catch (e) {
      if (e instanceof ScopeNotConfiguredError) {
        return createErrorResponse(e.message, 403);
      }
      throw e;
    }

    const adminSupabase = adminCtx.client;
    let query = adminSupabase
      .from('clinics')
      .select(CLINIC_LIST_SELECT)
      .in('id', adminCtx.scopedClinicIds)
      .order('created_at', { ascending: false });

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const effectiveIsActiveFilter = isManagerAreaKpiRequest
      ? true
      : isActiveFilter;

    if (effectiveIsActiveFilter !== undefined) {
      query = query.eq('is_active', effectiveIsActiveFilter);
    }

    const [{ data, error }, { data: hierarchySource, error: hierarchyError }] =
      await Promise.all([
        query,
        adminSupabase
          .from('clinics')
          .select(CLINIC_HIERARCHY_SELECT)
          .in('id', adminCtx.scopedClinicIds),
      ]);

    if (error || hierarchyError) {
      logError(error ?? hierarchyError, {
        endpoint: TENANTS_ENDPOINT,
        method: 'GET',
        userId: auth.id,
        params: { search, is_active: isActiveParam },
      });
      return createErrorResponse('クリニック情報の取得に失敗しました', 500);
    }

    const clinicListRows = toClinicListRows(data);
    const hierarchyRows = toScopedClinicLookupRows(hierarchySource);
    const clinicRows = isManagerAreaKpiRequest
      ? selectReservableAdminClinicRows(clinicListRows).filter(
          clinic => clinic.is_active
        )
      : clinicListRows;

    let items: ClinicWithKPI[] = buildClinicHierarchyRows(
      clinicRows,
      hierarchyRows
    );

    // KPIデータが要求された場合
    if (includeKpi && items.length > 0) {
      const clinicIds = items.map(c => c.id);
      const analyticsService = new AnalyticsReadService(adminSupabase);
      const kpiMap = await analyticsService.fetchMultiClinicKPI(clinicIds);

      items = items.map(clinic => ({
        ...clinic,
        kpi: kpiMap.get(clinic.id) ?? {
          revenue: 0,
          patients: 0,
          staff_performance_score: null,
        },
      }));
    }

    return createSuccessResponse({
      items,
      total: items.length,
    });
  } catch (error) {
    logError(error, {
      endpoint: TENANTS_ENDPOINT,
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
      allowedRoles: ['admin'],
      requireClinicMatch: false,
      sanitizeInputValues: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const { auth, permissions, body } = processResult;
    if (!requireAdmin(permissions.role)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    const parsed = ClinicCreateSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    const normalizedInput = normalizeClinicCreateInput(parsed.data);
    const parentClinicId = normalizedInput.clinic.parent_id;

    let adminCtx;
    try {
      adminCtx = createScopedAdminContext(permissions);
      adminCtx.assertClinicInScope(parentClinicId);
    } catch (e) {
      if (
        e instanceof ScopeNotConfiguredError ||
        e instanceof ScopeAccessError
      ) {
        return createErrorResponse(e.message, 403);
      }
      throw e;
    }

    const adminSupabase = adminCtx.client;
    const serviceAdminClient = createAdminClient();
    const parentValidation = await validateParentClinic(
      adminSupabase,
      adminCtx.scopedClinicIds,
      normalizedInput.clinic.parent_id
    );

    if (parentValidation.success === false) {
      return parentValidation.errorResponse;
    }

    const tenantBillingGuardActive = isTenantBillingGuardActive();
    let storeActivationPlan: StoreActivationPlan | null = null;
    let tenantBillingSubscription: Awaited<
      ReturnType<typeof fetchTenantBillingSubscription>
    > = null;

    if (tenantBillingGuardActive) {
      const [subscription, activeBillableStoreCount] = await Promise.all([
        fetchTenantBillingSubscription({
          client: adminSupabase,
          orgRootClinicId: normalizedInput.clinic.parent_id,
        }),
        countActiveChildClinics({
          client: adminSupabase,
          orgRootClinicId: normalizedInput.clinic.parent_id,
        }),
      ]);
      const plan = buildStoreActivationPlan({
        subscription,
        activeBillableStoreCount,
      });

      if (plan.success === false) {
        return createBillingActivationPlanErrorResponse(plan);
      }

      tenantBillingSubscription = subscription;
      storeActivationPlan = plan;
      normalizedInput.clinic.is_active = false;
      normalizedInput.clinic.billing_activation_status = 'pending_billing';
      normalizedInput.clinic.billing_activation_requested_at =
        new Date().toISOString();
      normalizedInput.clinic.billing_activated_at = null;
      normalizedInput.clinic.billing_activation_failed_at = null;
      normalizedInput.clinic.billing_activation_error = null;
    }

    const clinicInsert = {
      name: normalizedInput.clinic.name,
      address: normalizedInput.clinic.address,
      phone_number: normalizedInput.clinic.phone_number,
      is_active: normalizedInput.clinic.is_active,
      parent_id: parentClinicId,
      billing_activation_status:
        normalizedInput.clinic.billing_activation_status,
      billing_activation_requested_at:
        normalizedInput.clinic.billing_activation_requested_at,
      billing_activated_at: normalizedInput.clinic.billing_activated_at,
      billing_activation_failed_at:
        normalizedInput.clinic.billing_activation_failed_at,
      billing_activation_error: normalizedInput.clinic.billing_activation_error,
    };
    const { data, error } = await adminSupabase
      .from('clinics')
      .insert(clinicInsert)
      .select(CLINIC_LIST_SELECT)
      .single();

    if (error || !data) {
      logTenantPostError(error, auth.id, {
        name: normalizedInput.clinic.name,
        login_email: normalizedInput.loginEmail,
      });
      return createErrorResponse('クリニックの作成に失敗しました', 500);
    }

    let childClinicId: string;
    try {
      childClinicId = await resolveChildClinicInScope(
        adminCtx,
        data.id,
        parentClinicId
      );
    } catch (scopeResolutionError) {
      await rollbackCreatedClinicRecord(
        serviceAdminClient,
        data.id,
        parentClinicId,
        auth.id
      );
      logTenantPostError(scopeResolutionError, auth.id, {
        clinic_id: data.id,
        parent_clinic_id: parentClinicId,
        stage: 'resolve_child_clinic_scope',
      });
      return createErrorResponse('クリニックの作成に失敗しました', 500);
    }

    if (
      tenantBillingGuardActive &&
      storeActivationPlan?.success === true &&
      tenantBillingSubscription
    ) {
      const requestId = request.headers.get('x-request-id');
      const tenantAuditMetadata = {
        child_clinic_id: childClinicId,
        child_clinic_name: data.name,
        parent_clinic_id: normalizedInput.clinic.parent_id,
        stripe_subscription_id:
          tenantBillingSubscription.stripe_subscription_id,
        stripe_store_subscription_item_id:
          tenantBillingSubscription.stripe_store_subscription_item_id,
        active_billable_store_count:
          storeActivationPlan.activeBillableStoreCount,
        target_active_billable_store_count:
          storeActivationPlan.targetActiveBillableStoreCount,
        current_paid_extra_store_quantity:
          storeActivationPlan.currentPaidExtraStoreQuantity,
        target_paid_extra_store_quantity:
          storeActivationPlan.targetPaidExtraStoreQuantity,
      };

      await writeBillingAuditLog({
        client: adminSupabase,
        audit: {
          orgRootClinicId: normalizedInput.clinic.parent_id,
          actorType: 'user',
          actorUserId: auth.id,
          eventType: 'billing.tenant_add_requested',
          beforeState: tenantBillingSubscription,
          afterState: {
            clinic: data,
            billing_activation_plan: storeActivationPlan,
          },
          requestId,
          metadata: tenantAuditMetadata,
        },
      });

      await writeBillingAuditLog({
        client: adminSupabase,
        audit: {
          orgRootClinicId: normalizedInput.clinic.parent_id,
          actorType: 'user',
          actorUserId: auth.id,
          eventType: 'billing.tenant_pending_created',
          afterState: data,
          requestId,
          metadata: tenantAuditMetadata,
        },
      });
    }

    let adminAccount: ClinicAdminAccount | null = null;

    if (
      normalizedInput.shouldCreateClinicAdmin &&
      normalizedInput.loginEmail &&
      normalizedInput.loginPassword
    ) {
      const adminAccountResult = await createClinicAdminResources({
        adminClient: serviceAdminClient,
        endpointUserId: auth.id,
        clinicId: childClinicId,
        clinicName: normalizedInput.clinic.name,
        clinicAdminName:
          normalizedInput.loginFullName ??
          buildClinicAdminName(normalizedInput.clinic.name),
        loginEmail: normalizedInput.loginEmail,
        loginPassword: normalizedInput.loginPassword,
        activationMode: tenantBillingGuardActive ? 'pending' : 'active',
      });

      if (adminAccountResult.success === false) {
        await rollbackCreatedClinicRecord(
          serviceAdminClient,
          childClinicId,
          parentClinicId,
          auth.id
        );
        return adminAccountResult.errorResponse;
      }

      adminAccount = adminAccountResult.adminAccount;
    }

    let responseStatus = 201;
    const responseClinic = { ...data };
    let billingActivationResult: {
      status:
        | 'not_required'
        | 'activated'
        | 'pending_webhook'
        | 'billing_failed'
        | 'pending_capacity';
      error_code?: string | null;
    } | null = null;

    if (
      tenantBillingGuardActive &&
      storeActivationPlan?.success === true &&
      tenantBillingSubscription
    ) {
      if (storeActivationPlan.requiresStripeQuantityIncrease) {
        try {
          const requestId = request.headers.get('x-request-id');
          await writeBillingAuditLog({
            client: adminSupabase,
            audit: {
              orgRootClinicId: normalizedInput.clinic.parent_id,
              actorType: 'user',
              actorUserId: auth.id,
              eventType: 'billing.stripe_store_addon_quantity_change_initiated',
              beforeState: tenantBillingSubscription,
              afterState: {
                target_paid_extra_store_quantity:
                  storeActivationPlan.targetPaidExtraStoreQuantity,
              },
              requestId,
              metadata: {
                child_clinic_id: childClinicId,
                stripe_subscription_id:
                  tenantBillingSubscription.stripe_subscription_id,
                stripe_store_subscription_item_id:
                  tenantBillingSubscription.stripe_store_subscription_item_id,
                current_paid_extra_store_quantity:
                  tenantBillingSubscription.paid_extra_store_quantity,
                target_paid_extra_store_quantity:
                  storeActivationPlan.targetPaidExtraStoreQuantity,
              },
            },
          });
          const storeAddOnResult = await ensureStripeStoreAddOnQuantity({
            subscription: tenantBillingSubscription,
            targetPaidExtraStoreQuantity:
              storeActivationPlan.targetPaidExtraStoreQuantity,
          });
          await writeBillingAuditLog({
            client: adminSupabase,
            audit: {
              orgRootClinicId: normalizedInput.clinic.parent_id,
              actorType: 'user',
              actorUserId: auth.id,
              eventType: 'billing.stripe_store_addon_quantity_change_completed',
              beforeState: tenantBillingSubscription,
              afterState: {
                paid_extra_store_quantity:
                  storeActivationPlan.targetPaidExtraStoreQuantity,
                stripe_store_addon_sync: storeAddOnResult,
              },
              requestId,
              metadata: {
                child_clinic_id: childClinicId,
                stripe_subscription_id:
                  tenantBillingSubscription.stripe_subscription_id,
                stripe_store_subscription_item_id:
                  storeAddOnResult.subscriptionItemId,
                target_paid_extra_store_quantity:
                  storeActivationPlan.targetPaidExtraStoreQuantity,
              },
            },
          });
          responseStatus = 202;
          billingActivationResult = { status: 'pending_webhook' };
        } catch (stripeError) {
          const errorMessage =
            stripeError instanceof Error
              ? stripeError.message
              : 'Stripe store add-on quantity update failed';
          await markClinicBillingActivationFailed({
            client: adminSupabase,
            clinicId: childClinicId,
            errorMessage,
          });
          responseStatus = 202;
          responseClinic.billing_activation_status = 'billing_failed';
          responseClinic.billing_activation_failed_at =
            new Date().toISOString();
          responseClinic.billing_activation_error = errorMessage;
          billingActivationResult = {
            status: 'billing_failed',
            error_code: 'stripe_quantity_update_failed',
          };
          logTenantPostError(stripeError, auth.id, {
            clinic_id: childClinicId,
            stage: 'stripe_store_addon_quantity_update',
          });
        }
      } else {
        const activationResult = await activateBillableStoreIfCapacity({
          client: adminSupabase,
          orgRootClinicId: normalizedInput.clinic.parent_id,
          clinicId: childClinicId,
        });

        if (activationResult.success) {
          const enabledAdminAccount = await enablePendingClinicAdminResources({
            adminClient: serviceAdminClient,
            clinicId: childClinicId,
          });
          adminAccount = enabledAdminAccount ?? adminAccount;
          responseClinic.is_active = true;
          responseClinic.billing_activation_status = 'active';
          responseClinic.billing_activated_at = new Date().toISOString();
          billingActivationResult = { status: 'activated' };
        } else {
          responseStatus = 202;
          billingActivationResult = {
            status: 'pending_capacity',
            error_code: activationResult.error_code,
          };
        }
      }
    }

    await AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'clinic_create',
      childClinicId,
      {
        name: normalizedInput.clinic.name,
        parent_id: normalizedInput.clinic.parent_id,
        parent_name: parentValidation.parent?.name ?? null,
        login_full_name: normalizedInput.loginFullName,
        login_email: normalizedInput.loginEmail,
        created_clinic_admin: normalizedInput.shouldCreateClinicAdmin,
        billing_activation_status:
          responseClinic.billing_activation_status ?? null,
        billing_activation_result: billingActivationResult,
      }
    );

    return createSuccessResponse(
      {
        ...buildClinicHierarchySummary(responseClinic, {
          parentName: parentValidation.parent?.name ?? null,
          childCount: 0,
        }),
        admin_account: adminAccount,
        billing_activation_result: billingActivationResult,
      },
      responseStatus
    );
  } catch (error) {
    logTenantPostError(error, 'unknown');
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
