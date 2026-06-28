import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { createAdminClient } from '@/lib/supabase';
import { HQ_ROLES } from '@/lib/constants/roles';
import {
  buildClinicHierarchySummary,
  CLINIC_LIST_SELECT,
} from '@/lib/admin/tenants';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';
import { countActiveChildClinics } from '@/lib/billing/admin';
import {
  activateBillableStoreIfCapacity,
  buildStoreActivationPlan,
  ensureStripeStoreAddOnQuantity,
  fetchTenantBillingSubscription,
  isTenantBillingGuardActive,
  markClinicBillingActivationFailed,
  type StoreActivationPlan,
} from '@/lib/billing/tenant-activation';

const PATCH_ENDPOINT = '/api/admin/tenants/[clinic_id]';
const CLINIC_ADMIN_ROLE = 'clinic_admin';
const MANAGED_PASSWORD_PLACEHOLDER = 'managed_by_supabase';

const ClinicUpdateSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    address: z.string().max(500).optional().nullable(),
    phone_number: z.string().max(50).optional().nullable(),
    is_active: z.boolean().optional(),
    parent_id: z
      .string()
      .uuid('親テナントIDの形式が不正です')
      .optional()
      .nullable(),
  })
  .refine(
    data =>
      data.name !== undefined ||
      data.address !== undefined ||
      data.phone_number !== undefined ||
      data.is_active !== undefined ||
      data.parent_id !== undefined,
    {
      message: '更新対象が指定されていません',
    }
  );

const requireAdmin = (role: string) => role === 'admin';

type ClinicUpdateInput = z.infer<typeof ClinicUpdateSchema>;
type ClinicHierarchyRow = {
  id: string;
  name: string;
  parent_id: string | null;
  is_active: boolean;
};
type HierarchyValidationResult =
  | {
      success: true;
      currentClinic: ClinicHierarchyRow;
      childCount: number;
      parentClinic: ClinicHierarchyRow | null;
    }
  | {
      success: false;
      errorResponse: Response;
    };

function logTenantPatchError(
  error: unknown,
  userId: string,
  params?: Record<string, unknown>
) {
  logError(error, {
    endpoint: PATCH_ENDPOINT,
    method: 'PATCH',
    userId,
    params,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPendingClinicAdminRow(
  value: unknown
): value is { id: string; email: string } {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.email === 'string'
  );
}

function toPendingClinicAdminRows(value: unknown) {
  return Array.isArray(value) ? value.filter(isPendingClinicAdminRow) : [];
}

async function fetchClinicHierarchyRow(
  adminClient: ReturnType<typeof createAdminClient>,
  clinicId: string
) {
  return await adminClient
    .from('clinics')
    .select('id, name, parent_id, is_active')
    .eq('id', clinicId)
    .single();
}

async function countChildClinics(
  adminClient: ReturnType<typeof createAdminClient>,
  clinicId: string
) {
  const { count, error } = await adminClient
    .from('clinics')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', clinicId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function resolveParentName(
  adminClient: ReturnType<typeof createAdminClient>,
  parentClinic: ClinicHierarchyRow | null,
  parentId: string | null
) {
  if (parentClinic) {
    return parentClinic.name;
  }

  if (!parentId) {
    return null;
  }

  const { data, error } = await adminClient
    .from('clinics')
    .select('name')
    .eq('id', parentId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.name;
}

async function validateHierarchyChange(
  adminClient: ReturnType<typeof createAdminClient>,
  clinicId: string,
  requestedParentId: string | null | undefined,
  scopedClinicIds: string[]
): Promise<HierarchyValidationResult> {
  const [{ data: currentClinic, error: currentClinicError }, childCount] =
    await Promise.all([
      fetchClinicHierarchyRow(adminClient, clinicId),
      countChildClinics(adminClient, clinicId),
    ]);

  if (currentClinicError || !currentClinic) {
    return {
      success: false,
      errorResponse: createErrorResponse('クリニックが見つかりません', 404),
    };
  }

  if (
    requestedParentId === undefined ||
    requestedParentId === currentClinic.parent_id
  ) {
    return {
      success: true,
      currentClinic,
      childCount,
      parentClinic: null,
    };
  }

  if (childCount > 0) {
    return {
      success: false,
      errorResponse: createErrorResponse(
        '子テナントを持つテナントの親変更はできません。先に子テナントを整理してください',
        400
      ),
    };
  }

  if (requestedParentId === null) {
    return {
      success: false,
      errorResponse: createErrorResponse(
        '子テナントを本部/単独テナントへ変更することはできません',
        400
      ),
    };
  }

  if (requestedParentId === clinicId) {
    return {
      success: false,
      errorResponse: createErrorResponse(
        '自分自身を親テナントには設定できません',
        400
      ),
    };
  }

  if (!scopedClinicIds.includes(requestedParentId)) {
    return {
      success: false,
      errorResponse: createErrorResponse(
        '指定した親テナントへのアクセス権限がありません',
        403
      ),
    };
  }

  const { data: parentClinic, error: parentClinicError } =
    await fetchClinicHierarchyRow(adminClient, requestedParentId);

  if (parentClinicError || !parentClinic) {
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
    currentClinic,
    childCount,
    parentClinic,
  };
}

function buildClinicUpdatePayload(input: ClinicUpdateInput) {
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) {
    updatePayload.name = input.name;
  }

  if (input.address !== undefined) {
    updatePayload.address = input.address;
  }

  if (input.phone_number !== undefined) {
    updatePayload.phone_number = input.phone_number;
  }

  if (input.is_active !== undefined) {
    updatePayload.is_active = input.is_active;
  }

  if (input.parent_id !== undefined) {
    updatePayload.parent_id = input.parent_id;
  }

  return updatePayload;
}

function hasDirectClinicUpdateFields(input: ClinicUpdateInput) {
  return (
    input.name !== undefined ||
    input.address !== undefined ||
    input.phone_number !== undefined ||
    input.is_active !== undefined ||
    input.parent_id !== undefined
  );
}

function createBillingActivationPlanErrorResponse(
  plan: Extract<StoreActivationPlan, { success: false }>
) {
  switch (plan.errorCode) {
    case 'subscription_not_found':
      return createErrorResponse(
        '店舗有効化には有効なGroup契約が必要です',
        402
      );
    case 'subscription_not_group':
      return createErrorResponse(
        'Single Clinicプランでは子テナントを有効化できません',
        403
      );
    case 'subscription_not_writable':
      return createErrorResponse(
        '現在の契約状態では店舗を有効化できません',
        402
      );
  }
}

async function fetchClinicListRow(
  adminClient: ReturnType<typeof createAdminClient>,
  clinicId: string
) {
  return await adminClient
    .from('clinics')
    .select(CLINIC_LIST_SELECT)
    .eq('id', clinicId)
    .single();
}

async function enablePendingClinicAdminResources(input: {
  adminClient: ReturnType<typeof createAdminClient>;
  clinicId: string;
}) {
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
    return;
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
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ clinic_id: string }> }
) {
  const { clinic_id } = await context.params;

  try {
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: Array.from(HQ_ROLES),
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, permissions, body } = processResult;
    if (!requireAdmin(permissions.role)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    const parsed = ClinicUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    let adminCtx;
    try {
      adminCtx = createScopedAdminContext(permissions);
      adminCtx.assertClinicInScope(clinic_id);
    } catch (error) {
      if (error instanceof ScopeNotConfiguredError) {
        return createErrorResponse(error.message, 403);
      }
      if (error instanceof ScopeAccessError) {
        return createErrorResponse(
          '指定クリニックへのアクセス権限がありません',
          403
        );
      }
      throw error;
    }

    const adminSupabase = adminCtx.client;
    const hierarchyValidation = await validateHierarchyChange(
      adminSupabase,
      clinic_id,
      parsed.data.parent_id,
      adminCtx.scopedClinicIds
    );

    if (hierarchyValidation.success === false) {
      return hierarchyValidation.errorResponse;
    }

    const targetParentId =
      parsed.data.parent_id !== undefined
        ? parsed.data.parent_id
        : hierarchyValidation.currentClinic.parent_id;
    const shouldUseBillingActivation =
      isTenantBillingGuardActive() &&
      parsed.data.is_active === true &&
      targetParentId !== null &&
      !hierarchyValidation.currentClinic.is_active;
    const directUpdateInput: ClinicUpdateInput = { ...parsed.data };

    if (shouldUseBillingActivation) {
      directUpdateInput.is_active = undefined;
    }

    const updatePayload = buildClinicUpdatePayload(directUpdateInput);
    const directUpdateResult = hasDirectClinicUpdateFields(directUpdateInput)
      ? await adminSupabase
          .from('clinics')
          .update(updatePayload)
          .eq('id', clinic_id)
          .select(CLINIC_LIST_SELECT)
          .single()
      : await fetchClinicListRow(adminSupabase, clinic_id);

    const { data, error } = directUpdateResult;

    if (error) {
      logTenantPatchError(error, auth.id, { clinic_id, updatePayload });
      return createErrorResponse('クリニックの更新に失敗しました', 500);
    }

    let responseStatus = 200;
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

    if (shouldUseBillingActivation && targetParentId) {
      if (!adminCtx.scopedClinicIds.includes(targetParentId)) {
        return createErrorResponse(
          '指定した親テナントへのアクセス権限がありません',
          403
        );
      }

      const [subscription, activeBillableStoreCount] = await Promise.all([
        fetchTenantBillingSubscription({
          client: adminSupabase,
          orgRootClinicId: targetParentId,
        }),
        countActiveChildClinics({
          client: adminSupabase,
          orgRootClinicId: targetParentId,
        }),
      ]);
      const plan = buildStoreActivationPlan({
        subscription,
        activeBillableStoreCount,
      });

      if (plan.success === false) {
        return createBillingActivationPlanErrorResponse(plan);
      }

      const { error: pendingUpdateError } = await adminSupabase
        .from('clinics')
        .update({
          billing_activation_status: 'pending_billing',
          billing_activation_requested_at: new Date().toISOString(),
          billing_activation_failed_at: null,
          billing_activation_error: null,
        })
        .eq('id', clinic_id)
        .eq('is_active', false);

      if (pendingUpdateError) {
        throw pendingUpdateError;
      }

      responseClinic.billing_activation_status = 'pending_billing';
      responseClinic.billing_activation_error = null;

      if (plan.requiresStripeQuantityIncrease && subscription) {
        try {
          await ensureStripeStoreAddOnQuantity({
            subscription,
            targetPaidExtraStoreQuantity: plan.targetPaidExtraStoreQuantity,
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
            clinicId: clinic_id,
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
          logTenantPatchError(stripeError, auth.id, {
            clinic_id,
            stage: 'stripe_store_addon_quantity_update',
          });
        }
      } else {
        const activationResult = await activateBillableStoreIfCapacity({
          client: adminSupabase,
          orgRootClinicId: targetParentId,
          clinicId: clinic_id,
        });

        if (activationResult.success) {
          await enablePendingClinicAdminResources({
            adminClient: createAdminClient(),
            clinicId: clinic_id,
          });
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

    const parentName = await resolveParentName(
      adminSupabase,
      hierarchyValidation.parentClinic,
      responseClinic.parent_id
    );

    await AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'clinic_update',
      clinic_id,
      {
        ...updatePayload,
        billing_activation_result: billingActivationResult,
      }
    );

    return createSuccessResponse(
      {
        ...buildClinicHierarchySummary(responseClinic, {
          parentName,
          childCount: hierarchyValidation.childCount,
        }),
        billing_activation_result: billingActivationResult,
      },
      responseStatus
    );
  } catch (error) {
    logTenantPatchError(error, 'unknown');
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
