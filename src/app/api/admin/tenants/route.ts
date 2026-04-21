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
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';
import { HQ_ROLES } from '@/lib/constants/roles';
import { AnalyticsReadService } from '@/lib/services/analytics-read-service';
import {
  emailSchema,
  passwordSchema,
  sanitizeAuthInput,
} from '@/lib/schemas/auth';

/**
 * Clinic Create Schema for admin tenant management.
 *
 * Supports:
 * - Standalone/HQ clinic creation (parent_id = null)
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
      .string()
      .uuid('親テナントIDの形式が不正です')
      .optional()
      .nullable(),
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

type ClinicCreateInput = z.infer<typeof ClinicCreateSchema>;
type ClinicAdminAccount = {
  email: string;
  role: typeof CLINIC_ADMIN_ROLE;
};
type NormalizedClinicCreateInput = {
  clinic: {
    name: string;
    address: string | null;
    phone_number: string | null;
    is_active: boolean;
    parent_id: string | null;
  };
  loginEmail: string | null;
  loginPassword: string | null;
  shouldCreateClinicAdmin: boolean;
};
type RollbackStage =
  | 'rollback_user_permissions'
  | 'rollback_staff'
  | 'rollback_profiles'
  | 'rollback_clinic'
  | 'rollback_auth_user';
type CreateClinicAdminResourcesInput = {
  adminClient: ReturnType<typeof createAdminClient>;
  endpointUserId: string;
  clinicId: string;
  clinicName: string;
  loginEmail: string;
  loginPassword: string;
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
type ScopedClinicLookupRow = {
  id: string;
  name: string;
  parent_id: string | null;
};
type ClinicListRow = {
  id: string;
  name: string;
  address: string | null;
  phone_number: string | null;
  is_active: boolean;
  created_at: string;
  parent_id: string | null;
};
type ParentClinicRow = ScopedClinicLookupRow & {
  is_active: boolean;
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
      parent_id: input.parent_id ?? null,
    },
    loginEmail,
    loginPassword,
    shouldCreateClinicAdmin: loginEmail !== null && loginPassword !== null,
  };
}

function buildClinicHierarchyRows(
  clinics: ClinicListRow[],
  hierarchySource: ScopedClinicLookupRow[]
) {
  const clinicNameMap = new Map(
    hierarchySource.map(clinic => [clinic.id, clinic.name] as const)
  );
  const childCountMap = new Map<string, number>();

  for (const clinic of hierarchySource) {
    if (!clinic.parent_id) {
      continue;
    }

    childCountMap.set(
      clinic.parent_id,
      (childCountMap.get(clinic.parent_id) ?? 0) + 1
    );
  }

  return clinics.map(clinic => ({
    ...clinic,
    parent_name: clinic.parent_id
      ? (clinicNameMap.get(clinic.parent_id) ?? null)
      : null,
    clinic_type: clinic.parent_id ? ('child' as const) : ('hq' as const),
    child_count: childCountMap.get(clinic.id) ?? 0,
  }));
}

async function validateParentClinic(
  adminClient: ReturnType<typeof createAdminClient>,
  scopedClinicIds: string[],
  parentId: string | null
): Promise<ParentValidationResult> {
  if (!parentId) {
    return {
      success: true,
      parent: null,
    };
  }

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

  if (!parentClinic.is_active) {
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

function mapCreateUserErrorMessage(error?: { message?: string | null }) {
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
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const { error: deletePermissionError } = await adminClient
    .from('user_permissions')
    .delete()
    .eq('staff_id', userId);
  if (deletePermissionError) {
    logTenantRollbackError(
      deletePermissionError,
      userId,
      'rollback_user_permissions'
    );
  }

  const { error: deleteStaffError } = await adminClient
    .from('staff')
    .delete()
    .eq('id', userId);
  if (deleteStaffError) {
    logTenantRollbackError(deleteStaffError, userId, 'rollback_staff');
  }

  const { error: deleteProfileError } = await adminClient
    .from('profiles')
    .delete()
    .eq('user_id', userId);
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
  adminClient: ReturnType<typeof createAdminClient>,
  clinicId: string,
  userId: string
) {
  const { error: deleteClinicError } = await adminClient
    .from('clinics')
    .delete()
    .eq('id', clinicId);

  if (deleteClinicError) {
    logTenantRollbackError(deleteClinicError, userId, 'rollback_clinic', {
      clinicId,
    });
  }
}

async function createClinicAdminResources({
  adminClient,
  endpointUserId,
  clinicId,
  clinicName,
  loginEmail,
  loginPassword,
}: CreateClinicAdminResourcesInput): Promise<CreateClinicAdminResourcesResult> {
  const clinicAdminName = buildClinicAdminName(clinicName);
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

  const cleanupAndReturn = async (
    error: unknown,
    message: string,
    stage: string
  ): Promise<CreateClinicAdminResourcesResult> => {
    await rollbackCreatedClinicAdminResources(adminClient, createdUserId);
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

  const { error: profileError } = await adminClient.from('profiles').upsert(
    {
      user_id: createdUserId,
      clinic_id: clinicId,
      email: loginEmail,
      full_name: clinicAdminName,
      role: CLINIC_ADMIN_ROLE,
      is_active: true,
      updated_at: timestamp,
    },
    { onConflict: 'user_id' }
  );

  if (profileError) {
    return await cleanupAndReturn(
      profileError,
      '店舗アカウントのプロフィール作成に失敗しました',
      'upsert_profiles'
    );
  }

  const { error: staffError } = await adminClient.from('staff').upsert(
    {
      id: createdUserId,
      clinic_id: clinicId,
      name: clinicAdminName,
      role: CLINIC_ADMIN_ROLE,
      email: loginEmail,
      password_hash: MANAGED_PASSWORD_PLACEHOLDER,
      is_therapist: false,
      updated_at: timestamp,
    },
    { onConflict: 'id' }
  );

  if (staffError) {
    return await cleanupAndReturn(
      staffError,
      '店舗アカウントの作成に失敗しました',
      'upsert_staff'
    );
  }

  const { error: permissionError } = await adminClient
    .from('user_permissions')
    .upsert(
      {
        staff_id: createdUserId,
        clinic_id: clinicId,
        role: CLINIC_ADMIN_ROLE,
        username: loginEmail,
        hashed_password: MANAGED_PASSWORD_PLACEHOLDER,
        updated_at: timestamp,
      },
      { onConflict: 'staff_id' }
    );

  if (permissionError) {
    return await cleanupAndReturn(
      permissionError,
      '店舗アカウントの権限設定に失敗しました',
      'upsert_user_permissions'
    );
  }

  return {
    success: true as const,
    adminAccount: {
      email: loginEmail,
      role: CLINIC_ADMIN_ROLE,
    },
  };
}

interface ClinicWithKPI extends ClinicListRow {
  parent_name: string | null;
  clinic_type: 'hq' | 'child';
  child_count: number;
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
      allowedRoles: Array.from(HQ_ROLES),
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { permissions, auth } = processResult;
    if (!requireAdmin(permissions.role)) {
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
      .select(
        'id, name, address, phone_number, is_active, created_at, parent_id'
      )
      .in('id', adminCtx.scopedClinicIds)
      .order('created_at', { ascending: false });

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    if (isActiveFilter !== undefined) {
      query = query.eq('is_active', isActiveFilter);
    }

    const [{ data, error }, { data: hierarchySource, error: hierarchyError }] =
      await Promise.all([
        query,
        adminSupabase
          .from('clinics')
          .select('id, name, parent_id')
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

    let items = buildClinicHierarchyRows(
      data ?? [],
      hierarchySource ?? []
    ) as ClinicWithKPI[];

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
      allowedRoles: Array.from(HQ_ROLES),
      requireClinicMatch: false,
      sanitizeInputValues: false,
    });

    if (!processResult.success) {
      return processResult.error!;
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
    const serviceAdminClient = createAdminClient();
    const parentValidation = await validateParentClinic(
      adminSupabase,
      adminCtx.scopedClinicIds,
      normalizedInput.clinic.parent_id
    );

    if (parentValidation.success === false) {
      return parentValidation.errorResponse;
    }

    const { data, error } = await adminSupabase
      .from('clinics')
      .insert(normalizedInput.clinic)
      .select(
        'id, name, address, phone_number, is_active, created_at, parent_id'
      )
      .single();

    if (error) {
      logTenantPostError(error, auth.id, {
        name: normalizedInput.clinic.name,
        login_email: normalizedInput.loginEmail,
      });
      return createErrorResponse('クリニックの作成に失敗しました', 500);
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
        clinicId: data.id,
        clinicName: normalizedInput.clinic.name,
        loginEmail: normalizedInput.loginEmail,
        loginPassword: normalizedInput.loginPassword,
      });

      if (adminAccountResult.success === false) {
        await rollbackCreatedClinicRecord(serviceAdminClient, data.id, auth.id);
        return adminAccountResult.errorResponse;
      }

      adminAccount = adminAccountResult.adminAccount;
    }

    await AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'clinic_create',
      data.id,
      {
        name: normalizedInput.clinic.name,
        parent_id: normalizedInput.clinic.parent_id,
        parent_name: parentValidation.parent?.name ?? null,
        login_email: normalizedInput.loginEmail,
        created_clinic_admin: normalizedInput.shouldCreateClinicAdmin,
      }
    );

    return createSuccessResponse(
      {
        ...data,
        parent_name: parentValidation.parent?.name ?? null,
        clinic_type: data.parent_id ? 'child' : 'hq',
        child_count: 0,
        admin_account: adminAccount,
      },
      201
    );
  } catch (error) {
    logTenantPostError(error, 'unknown');
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
