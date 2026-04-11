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
  createScopedAdminContext,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';
import { HQ_ROLES } from '@/lib/constants/roles';
import { AnalyticsReadService } from '@/lib/services/analytics-read-service';

/**
 * Clinic Create Schema for admin tenant management.
 *
 * NOTE (DOD-08): Parent-child tenant creation is NOT supported via this endpoint.
 * - This endpoint is for managing EXISTING flat clinics without parent-child hierarchy.
 * - For parent-child tenant creation with admin setup, use:
 *   POST /api/onboarding/clinic (supports parent_id via create_clinic_with_admin RPC)
 *
 * @see docs/stabilization/spec-tenant-table-api-guard-v0.1.md (Follow-ups: 追加修正2)
 * @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md (Parent-scope model)
 */
const ClinicCreateSchema = z.object({
  name: z.string().min(1, 'クリニック名は必須です').max(255),
  address: z.string().max(500).optional(),
  phone_number: z.string().max(50).optional(),
  is_active: z.boolean().optional(),
  // NOTE: parent_id is intentionally NOT included.
  // Parent-child tenant creation should use /api/onboarding/clinic endpoint.
});

const requireAdmin = (role: string) => role === 'admin';

interface ClinicWithKPI {
  id: string;
  name: string;
  address: string | null;
  phone_number: string | null;
  is_active: boolean;
  created_at: string;
  kpi?: { revenue: number; patients: number; staff_performance_score: number | null };
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
      .select('id, name, address, phone_number, is_active, created_at')
      .in('id', adminCtx.scopedClinicIds)
      .order('created_at', { ascending: false });

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    if (isActiveFilter !== undefined) {
      query = query.eq('is_active', isActiveFilter);
    }

    const { data, error } = await query;
    if (error) {
      logError(error, {
        endpoint: '/api/admin/tenants',
        method: 'GET',
        userId: auth.id,
        params: { search, is_active: isActiveParam },
      });
      return createErrorResponse('クリニック情報の取得に失敗しました', 500);
    }

    let items: ClinicWithKPI[] = data ?? [];

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
      endpoint: '/api/admin/tenants',
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

    const { name, address, phone_number, is_active } = parsed.data;

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

    const { data, error } = await adminSupabase
      .from('clinics')
      .insert({
        name,
        address: address || null,
        phone_number: phone_number || null,
        is_active: is_active ?? true,
      })
      .select('id, name, address, phone_number, is_active, created_at')
      .single();

    if (error) {
      logError(error, {
        endpoint: '/api/admin/tenants',
        method: 'POST',
        userId: auth.id,
        params: { name },
      });
      return createErrorResponse('クリニックの作成に失敗しました', 500);
    }

    await AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'clinic_create',
      data.id,
      { name }
    );

    return createSuccessResponse(data, 201);
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/tenants',
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
