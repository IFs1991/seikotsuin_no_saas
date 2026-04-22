import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { buildAdminAiInsights } from '@/lib/admin/ai-insights';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

const ENDPOINT = '/api/admin/ai-insights';
const DEFAULT_PERIOD_DAYS = 30;
const MAX_PERIOD_DAYS = 365;

const QuerySchema = z.object({
  period_days: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_PERIOD_DAYS)
    .default(DEFAULT_PERIOD_DAYS),
  clinic_id: z.string().uuid().optional(),
  parent_id: z.string().uuid().optional(),
});

interface ClinicScopeRow {
  id: string;
  parent_id: string | null;
}

export async function GET(request: NextRequest) {
  const parsedQuery = QuerySchema.safeParse(
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
    allowedRoles: Array.from(ADMIN_UI_ROLES),
    requireClinicMatch: false,
  });
  if (!authResult.success) {
    return authResult.error;
  }

  const { permissions, auth } = authResult;
  let adminCtx;
  try {
    adminCtx = createScopedAdminContext(permissions);
  } catch (error) {
    if (error instanceof ScopeNotConfiguredError) {
      return createErrorResponse(error.message, 403);
    }
    throw error;
  }

  try {
    const clinicIds = await resolveTargetClinicIds(
      adminCtx.client,
      adminCtx.scopedClinicIds,
      parsedQuery.data.clinic_id,
      parsedQuery.data.parent_id
    );

    const data = await buildAdminAiInsights(
      adminCtx.client,
      clinicIds,
      parsedQuery.data.period_days
    );

    return createSuccessResponse(data);
  } catch (error) {
    if (error instanceof ScopeAccessError) {
      return createErrorResponse(error.message, 403);
    }

    logError(error, {
      endpoint: ENDPOINT,
      method: 'GET',
      userId: auth.id,
      params: parsedQuery.data,
    });
    return createErrorResponse('AI横断インサイトの取得に失敗しました', 500);
  }
}

async function resolveTargetClinicIds(
  client: ReturnType<typeof createScopedAdminContext>['client'],
  scopedClinicIds: string[],
  clinicId?: string,
  parentId?: string
): Promise<string[]> {
  if (clinicId && !scopedClinicIds.includes(clinicId)) {
    throw new ScopeAccessError();
  }
  if (parentId && !scopedClinicIds.includes(parentId)) {
    throw new ScopeAccessError(
      '指定した親テナントへのアクセス権限がありません'
    );
  }

  if (!parentId) {
    return clinicId ? [clinicId] : scopedClinicIds;
  }

  const { data, error } = await client
    .from('clinics')
    .select('id, parent_id')
    .in('id', scopedClinicIds);

  if (error) {
    throw new Error(`clinics scope query failed: ${error.message}`);
  }

  const rows = (data ?? []) as ClinicScopeRow[];
  const childIds = rows
    .filter(row => row.parent_id === parentId)
    .map(row => row.id);

  if (clinicId) {
    if (!childIds.includes(clinicId)) {
      throw new ScopeAccessError(
        '指定した店舗は親テナントの配下ではありません'
      );
    }
    return [clinicId];
  }

  return childIds;
}
