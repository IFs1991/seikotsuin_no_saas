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

const PATCH_ENDPOINT = '/api/admin/tenants/[clinic_id]';

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

    const updatePayload = buildClinicUpdatePayload(parsed.data);
    const { data, error } = await adminSupabase
      .from('clinics')
      .update(updatePayload)
      .eq('id', clinic_id)
      .select(CLINIC_LIST_SELECT)
      .single();

    if (error) {
      logTenantPatchError(error, auth.id, { clinic_id, updatePayload });
      return createErrorResponse('クリニックの更新に失敗しました', 500);
    }

    const parentName = await resolveParentName(
      adminSupabase,
      hierarchyValidation.parentClinic,
      data.parent_id
    );

    await AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'clinic_update',
      clinic_id,
      updatePayload
    );

    return createSuccessResponse(
      buildClinicHierarchySummary(data, {
        parentName,
        childCount: hierarchyValidation.childCount,
      })
    );
  } catch (error) {
    logTenantPatchError(error, 'unknown');
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
