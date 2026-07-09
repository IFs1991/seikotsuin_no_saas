import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { ADMIN_UI_ROLES, normalizeRole } from '@/lib/constants/roles';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';
import type { Database } from '@/types/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENDPOINT = '/api/admin/mobile-uiux/entitlements';
const ADMIN_ALLOWED_ROLES = Array.from(ADMIN_UI_ROLES);

const ENTITLEMENT_COLUMNS = [
  'clinic_id',
  'mobile_uiux_enabled',
  'mobile_uiux_real_data_enabled',
  'mobile_uiux_write_enabled',
  'mobile_uiux_reservation_write_enabled',
  'mobile_uiux_daily_report_write_enabled',
  'mobile_uiux_settings_write_enabled',
  'rollout_phase',
  'updated_at',
  'updated_by',
].join(', ');

const EntitlementQuerySchema = z.object({
  clinic_id: z.string().uuid('clinic_idの形式が不正です'),
});

type EntitlementUpsertInput = {
  clinic_id: string;
  mobile_uiux_enabled: boolean;
  mobile_uiux_real_data_enabled: boolean;
  mobile_uiux_write_enabled: boolean;
  mobile_uiux_reservation_write_enabled: boolean;
  mobile_uiux_daily_report_write_enabled: boolean;
  mobile_uiux_settings_write_enabled: boolean;
  rollout_phase: string;
};

const EntitlementUpsertSchema = z.object({
  clinic_id: z.string().uuid('clinic_idの形式が不正です'),
  mobile_uiux_enabled: z.boolean(),
  mobile_uiux_real_data_enabled: z.boolean(),
  mobile_uiux_write_enabled: z.boolean(),
  mobile_uiux_reservation_write_enabled: z.boolean(),
  mobile_uiux_daily_report_write_enabled: z.boolean(),
  mobile_uiux_settings_write_enabled: z.boolean(),
  rollout_phase: z.string().trim().min(1).max(64),
});

type ClinicFeatureFlagsRow =
  Database['public']['Tables']['clinic_feature_flags']['Row'];
type ClinicFeatureFlagsInsert =
  Database['public']['Tables']['clinic_feature_flags']['Insert'];
type ScopedAdminContext = ReturnType<typeof createScopedAdminContext>;

function toScopeErrorResponse(error: unknown) {
  if (
    error instanceof ScopeNotConfiguredError ||
    error instanceof ScopeAccessError
  ) {
    return createErrorResponse(error.message, 403);
  }

  return null;
}

function validateAdminOnly(role: string) {
  return normalizeRole(role) === 'admin';
}

function isEntitlementUpsertInput(
  value: z.infer<typeof EntitlementUpsertSchema>
): value is EntitlementUpsertInput {
  return (
    typeof value.clinic_id === 'string' &&
    typeof value.mobile_uiux_enabled === 'boolean' &&
    typeof value.mobile_uiux_real_data_enabled === 'boolean' &&
    typeof value.mobile_uiux_write_enabled === 'boolean' &&
    typeof value.mobile_uiux_reservation_write_enabled === 'boolean' &&
    typeof value.mobile_uiux_daily_report_write_enabled === 'boolean' &&
    typeof value.mobile_uiux_settings_write_enabled === 'boolean' &&
    typeof value.rollout_phase === 'string'
  );
}

function buildAuditDetails(
  row: ClinicFeatureFlagsRow
): Record<string, unknown> {
  return {
    action_target: 'mobile_uiux_entitlement',
    clinic_id: row.clinic_id,
    mobile_uiux_enabled: row.mobile_uiux_enabled,
    mobile_uiux_real_data_enabled: row.mobile_uiux_real_data_enabled,
    mobile_uiux_write_enabled: row.mobile_uiux_write_enabled,
    mobile_uiux_reservation_write_enabled:
      row.mobile_uiux_reservation_write_enabled,
    mobile_uiux_daily_report_write_enabled:
      row.mobile_uiux_daily_report_write_enabled,
    mobile_uiux_settings_write_enabled: row.mobile_uiux_settings_write_enabled,
    rollout_phase: row.rollout_phase,
  };
}

function buildUpsertPayload(
  input: EntitlementUpsertInput,
  userId: string
): ClinicFeatureFlagsInsert {
  return {
    clinic_id: input.clinic_id,
    mobile_uiux_enabled: input.mobile_uiux_enabled,
    mobile_uiux_real_data_enabled: input.mobile_uiux_real_data_enabled,
    mobile_uiux_write_enabled: input.mobile_uiux_write_enabled,
    mobile_uiux_reservation_write_enabled:
      input.mobile_uiux_reservation_write_enabled,
    mobile_uiux_daily_report_write_enabled:
      input.mobile_uiux_daily_report_write_enabled,
    mobile_uiux_settings_write_enabled:
      input.mobile_uiux_settings_write_enabled,
    rollout_phase: input.rollout_phase,
    updated_by: userId,
  };
}

async function fetchEntitlementByClinicId(
  client: ScopedAdminContext['client'],
  clinicId: string
): Promise<ClinicFeatureFlagsRow | null> {
  const { data, error } = await client
    .from('clinic_feature_flags')
    .select(ENTITLEMENT_COLUMNS)
    .eq('clinic_id', clinicId)
    .returns<ClinicFeatureFlagsRow>()
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function GET(request: NextRequest) {
  const parsedQuery = EntitlementQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!parsedQuery.success) {
    return createErrorResponse(
      '入力値にエラーがあります',
      400,
      parsedQuery.error.flatten()
    );
  }

  const authResult = await processApiRequest(request, {
    allowedRoles: ADMIN_ALLOWED_ROLES,
    clinicId: parsedQuery.data.clinic_id,
    requireClinicMatch: false,
  });
  if (!authResult.success) {
    return authResult.error;
  }

  let adminCtx: ScopedAdminContext;
  try {
    adminCtx = createScopedAdminContext(authResult.permissions);
    adminCtx.assertClinicInScope(parsedQuery.data.clinic_id);
  } catch (error) {
    const scopeResponse = toScopeErrorResponse(error);
    if (scopeResponse) {
      return scopeResponse;
    }
    throw error;
  }

  try {
    const data = await fetchEntitlementByClinicId(
      adminCtx.client,
      parsedQuery.data.clinic_id
    );
    return createSuccessResponse({ entitlement: data ?? null });
  } catch (error) {
    logError(error, {
      endpoint: ENDPOINT,
      method: 'GET',
      userId: authResult.auth.id,
      params: { clinic_id: parsedQuery.data.clinic_id },
    });
    return createErrorResponse('entitlementの取得に失敗しました', 500);
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await processApiRequest(request, {
    requireBody: true,
    allowedRoles: ADMIN_ALLOWED_ROLES,
    requireClinicMatch: false,
  });
  if (!authResult.success) {
    return authResult.error;
  }

  if (!validateAdminOnly(authResult.permissions.role)) {
    return createErrorResponse('この操作はadminのみ実行できます', 403);
  }

  const parsedBody = EntitlementUpsertSchema.safeParse(authResult.body);
  if (!parsedBody.success) {
    return createErrorResponse(
      '入力値にエラーがあります',
      400,
      parsedBody.error.flatten()
    );
  }
  if (!isEntitlementUpsertInput(parsedBody.data)) {
    return createErrorResponse('入力値にエラーがあります', 400);
  }

  let adminCtx: ScopedAdminContext;
  try {
    adminCtx = createScopedAdminContext(authResult.permissions);
    adminCtx.assertClinicInScope(parsedBody.data.clinic_id);
  } catch (error) {
    const scopeResponse = toScopeErrorResponse(error);
    if (scopeResponse) {
      return scopeResponse;
    }
    throw error;
  }

  const upsertPayload = buildUpsertPayload(parsedBody.data, authResult.auth.id);

  try {
    const { error } = await adminCtx.client
      .from('clinic_feature_flags')
      .upsert(upsertPayload, { onConflict: 'clinic_id' });

    if (error) {
      throw error;
    }

    const data = await fetchEntitlementByClinicId(
      adminCtx.client,
      parsedBody.data.clinic_id
    );
    if (!data) {
      throw new Error('clinic_feature_flags upsert returned no row');
    }

    await AuditLogger.logAdminAction(
      authResult.auth.id,
      authResult.auth.email,
      'mobile_uiux_entitlement_upsert',
      data.clinic_id,
      buildAuditDetails(data)
    );

    return createSuccessResponse({ entitlement: data });
  } catch (error) {
    logError(error, {
      endpoint: ENDPOINT,
      method: 'PUT',
      userId: authResult.auth.id,
      params: { clinic_id: parsedBody.data.clinic_id },
    });
    return createErrorResponse('entitlementの保存に失敗しました', 500);
  }
}
