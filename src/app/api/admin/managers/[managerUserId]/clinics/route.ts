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
  type ManagerClinicAssignment,
  resolveManagerAssignedClinics,
} from '@/lib/auth/manager-scope';
import { normalizeRole } from '@/lib/constants/roles';
import { createAdminClient } from '@/lib/supabase';

const ADMIN_MANAGER_API_ROLES = ['admin'] as const;
const ENDPOINT = '/api/admin/managers/[managerUserId]/clinics';

const ManagerUserIdSchema = z.string().uuid();
const ReplaceAssignmentsSchema = z.object({
  clinic_ids: z.array(z.string().uuid()),
  primary_clinic_id: z.string().uuid().nullable().optional(),
  revoke_reason: z.string().max(500).nullable().optional(),
});

type RouteContext = {
  params:
    | {
        managerUserId: string;
      }
    | Promise<{
        managerUserId: string;
      }>;
};

type DatabaseErrorLike = {
  code?: string;
  message?: string;
};
type ManagerPrimaryClinic = {
  primary_clinic_id: string | null;
  primary_clinic_name: string | null;
};
type ManagerAssignedClinicResponse = {
  assignment_id: string;
  clinic_id: string;
  clinic_name: string | null;
  assigned_at: string;
};
type ReplaceManagerAssignmentsRpcParams = {
  p_actor_user_id: string;
  p_clinic_ids: string[];
  p_manager_user_id: string;
  p_revoke_reason: string | null;
  p_primary_clinic_id?: string | null;
};

function readDatabaseError(error: unknown): DatabaseErrorLike {
  if (!error || typeof error !== 'object') {
    return {};
  }

  const code =
    'code' in error && typeof error.code === 'string' ? error.code : undefined;
  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message
      : undefined;

  return { code, message };
}

function resolveReplaceAssignmentsError(error: unknown): {
  message: string;
  status: number;
} {
  const { code, message } = readDatabaseError(error);

  if (code === '42501') {
    return {
      message: '管理者権限が必要です',
      status: 403,
    };
  }

  if (message?.includes('clinic_ids must reference active child clinics')) {
    return {
      message: '担当店舗には有効な子クリニックのみ指定できます',
      status: 400,
    };
  }

  if (message?.includes('所属拠点は担当店舗の中から選択してください')) {
    return {
      message: '所属拠点は担当店舗の中から選択してください',
      status: 400,
    };
  }

  if (
    message?.includes('clinic_ids are required') ||
    message?.includes('clinic_ids cannot contain null values')
  ) {
    return {
      message: '担当店舗の指定が不正です',
      status: 400,
    };
  }

  if (
    code === '23514' ||
    message?.includes('manager_user_id must have manager role')
  ) {
    return {
      message: '対象ユーザーはmanagerロールではありません',
      status: 400,
    };
  }

  return {
    message: '担当店舗の更新に失敗しました',
    status: 500,
  };
}

async function resolveManagerUserId(context: RouteContext): Promise<string> {
  const params = await context.params;
  return params.managerUserId;
}

function toUniqueClinicIds(clinicIds: readonly string[]): string[] {
  return Array.from(new Set(clinicIds));
}

function readClinicNameFromUnknown(clinics: unknown): string | null {
  const clinic = Array.isArray(clinics) ? (clinics[0] ?? null) : clinics;
  if (!clinic || typeof clinic !== 'object') {
    return null;
  }

  return 'name' in clinic && typeof clinic.name === 'string'
    ? clinic.name
    : null;
}

function readPrimaryClinicFromRow(row: unknown): ManagerPrimaryClinic {
  if (!row || typeof row !== 'object') {
    return {
      primary_clinic_id: null,
      primary_clinic_name: null,
    };
  }

  const clinicId =
    'clinic_id' in row && typeof row.clinic_id === 'string'
      ? row.clinic_id
      : null;
  const clinics = 'clinics' in row ? row.clinics : null;

  return {
    primary_clinic_id: clinicId,
    primary_clinic_name: clinicId ? readClinicNameFromUnknown(clinics) : null,
  };
}

async function fetchManagerPrimaryClinic(
  adminClient: ReturnType<typeof createAdminClient>,
  managerUserId: string
): Promise<ManagerPrimaryClinic> {
  const { data, error } = await adminClient
    .from('user_permissions')
    .select('clinic_id, clinics(name)')
    .eq('staff_id', managerUserId)
    .eq('role', 'manager')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return readPrimaryClinicFromRow(data);
}

function toAssignedClinicResponse(
  assignment: ManagerClinicAssignment
): ManagerAssignedClinicResponse {
  return {
    assignment_id: assignment.id,
    clinic_id: assignment.clinic_id,
    clinic_name: assignment.clinic_name,
    assigned_at: assignment.assigned_at,
  };
}

function resolvePrimaryClinicFromAssignments(
  assignments: readonly ManagerClinicAssignment[],
  primaryClinicId: string | null
): ManagerPrimaryClinic {
  if (!primaryClinicId) {
    return {
      primary_clinic_id: null,
      primary_clinic_name: null,
    };
  }

  const assignment = assignments.find(
    currentAssignment => currentAssignment.clinic_id === primaryClinicId
  );

  return {
    primary_clinic_id: primaryClinicId,
    primary_clinic_name: assignment?.clinic_name ?? null,
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const managerUserId = await resolveManagerUserId(context);
  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: ADMIN_MANAGER_API_ROLES,
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const { permissions } = processResult;
    if (normalizeRole(permissions.role) !== 'admin') {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    const parsedManagerUserId = ManagerUserIdSchema.safeParse(managerUserId);
    if (!parsedManagerUserId.success) {
      return createErrorResponse('managerUserIdの形式が不正です', 400);
    }

    const adminClient = createAdminClient();
    const assignments = await resolveManagerAssignedClinics(
      adminClient,
      parsedManagerUserId.data
    );

    return createSuccessResponse({
      assignments,
      total: assignments.length,
    });
  } catch (error) {
    logError(error, {
      endpoint: ENDPOINT,
      method: 'GET',
      userId: 'unknown',
      params: { managerUserId },
    });
    return createErrorResponse('担当店舗の取得に失敗しました', 500);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const managerUserId = await resolveManagerUserId(context);
  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: ADMIN_MANAGER_API_ROLES,
      requireBody: true,
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const { auth, body, permissions } = processResult;
    if (normalizeRole(permissions.role) !== 'admin') {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    const parsedManagerUserId = ManagerUserIdSchema.safeParse(managerUserId);
    if (!parsedManagerUserId.success) {
      return createErrorResponse('managerUserIdの形式が不正です', 400);
    }

    const parsedBody = ReplaceAssignmentsSchema.safeParse(body);
    if (!parsedBody.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedBody.error.flatten()
      );
    }

    const clinicIds = toUniqueClinicIds(parsedBody.data.clinic_ids);
    const requestedPrimaryClinicId = parsedBody.data.primary_clinic_id;
    if (
      requestedPrimaryClinicId !== undefined &&
      requestedPrimaryClinicId !== null &&
      !clinicIds.includes(requestedPrimaryClinicId)
    ) {
      return createErrorResponse(
        '所属拠点は担当店舗の中から選択してください',
        400
      );
    }

    const revokeReason = parsedBody.data.revoke_reason ?? null;
    const adminClient = createAdminClient();
    const rpcParams: ReplaceManagerAssignmentsRpcParams = {
      p_actor_user_id: auth.id,
      p_clinic_ids: clinicIds,
      p_manager_user_id: parsedManagerUserId.data,
      p_revoke_reason: revokeReason,
    };

    if (requestedPrimaryClinicId !== undefined) {
      rpcParams.p_primary_clinic_id = requestedPrimaryClinicId;
    }

    const { error } = await adminClient.rpc(
      'replace_manager_clinic_assignments',
      rpcParams
    );

    if (error) {
      const mappedError = resolveReplaceAssignmentsError(error);
      logError(error, {
        endpoint: ENDPOINT,
        method: 'PUT',
        userId: auth.id,
        params: { managerUserId, clinic_ids: clinicIds },
      });
      return createErrorResponse(mappedError.message, mappedError.status);
    }

    const assignments = await resolveManagerAssignedClinics(
      adminClient,
      parsedManagerUserId.data
    );
    const responsePrimaryClinic =
      requestedPrimaryClinicId === undefined
        ? await fetchManagerPrimaryClinic(adminClient, parsedManagerUserId.data)
        : resolvePrimaryClinicFromAssignments(
            assignments,
            requestedPrimaryClinicId
          );
    const responseAssignments = assignments.map(toAssignedClinicResponse);

    void AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'manager_clinic_assignments_replace',
      parsedManagerUserId.data,
      {
        manager_user_id: parsedManagerUserId.data,
        clinic_ids: clinicIds,
        primary_clinic_id: responsePrimaryClinic.primary_clinic_id,
        assigned_clinic_count: assignments.length,
        revoke_reason: revokeReason,
      }
    );

    return createSuccessResponse({
      assignments: responseAssignments,
      primary_clinic_id: responsePrimaryClinic.primary_clinic_id,
      primary_clinic_name: responsePrimaryClinic.primary_clinic_name,
      total: assignments.length,
    });
  } catch (error) {
    logError(error, {
      endpoint: ENDPOINT,
      method: 'PUT',
      userId: 'unknown',
      params: { managerUserId },
    });
    return createErrorResponse('担当店舗の更新に失敗しました', 500);
  }
}
