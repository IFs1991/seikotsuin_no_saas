import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { createAdminClient } from '@/lib/supabase/server';

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

// KPIデータの型定義
interface ClinicKPI {
  revenue: number;
  patients: number;
  staff_performance_score: number | null;
}

interface ClinicWithKPI {
  id: string;
  name: string;
  address: string | null;
  phone_number: string | null;
  is_active: boolean;
  created_at: string;
  kpi?: ClinicKPI;
}

// KPIデータを取得するヘルパー関数
async function fetchClinicKPIData(
  supabase: ReturnType<typeof processApiRequest> extends Promise<infer T>
    ? T extends { success: true; supabase: infer S }
      ? S
      : never
    : never,
  clinicIds: string[]
): Promise<Map<string, ClinicKPI>> {
  const kpiMap = new Map<string, ClinicKPI>();

  // 初期値を設定
  clinicIds.forEach((id) => {
    kpiMap.set(id, { revenue: 0, patients: 0, staff_performance_score: null });
  });

  // 収益データ取得
  const { data: revenueData } = await supabase
    .from('daily_revenue_summary')
    .select('clinic_id, total_revenue');

  if (revenueData) {
    const revenueByClinic = new Map<string, number>();
    revenueData.forEach((row: { clinic_id: string; total_revenue: number }) => {
      const current = revenueByClinic.get(row.clinic_id) ?? 0;
      revenueByClinic.set(row.clinic_id, current + Number(row.total_revenue));
    });
    revenueByClinic.forEach((total, clinicId) => {
      const kpi = kpiMap.get(clinicId);
      if (kpi) {
        kpi.revenue = total;
      }
    });
  }

  // 患者数データ取得
  const { data: patientData } = await supabase
    .from('patient_visit_summary')
    .select('clinic_id, patient_id');

  if (patientData) {
    const patientsByClinic = new Map<string, Set<string>>();
    patientData.forEach((row: { clinic_id: string; patient_id: string }) => {
      if (!patientsByClinic.has(row.clinic_id)) {
        patientsByClinic.set(row.clinic_id, new Set());
      }
      patientsByClinic.get(row.clinic_id)!.add(row.patient_id);
    });
    patientsByClinic.forEach((patients, clinicId) => {
      const kpi = kpiMap.get(clinicId);
      if (kpi) {
        kpi.patients = patients.size;
      }
    });
  }

  // スタッフパフォーマンスデータ取得
  const { data: staffData } = await supabase
    .from('staff_performance_summary')
    .select('clinic_id, total_revenue_generated, total_visits');

  if (staffData) {
    const performanceByClinic = new Map<
      string,
      { totalRevenue: number; totalVisits: number; count: number }
    >();
    staffData.forEach(
      (row: {
        clinic_id: string;
        total_revenue_generated: number;
        total_visits: number;
      }) => {
        if (!performanceByClinic.has(row.clinic_id)) {
          performanceByClinic.set(row.clinic_id, {
            totalRevenue: 0,
            totalVisits: 0,
            count: 0,
          });
        }
        const stats = performanceByClinic.get(row.clinic_id)!;
        stats.totalRevenue += Number(row.total_revenue_generated);
        stats.totalVisits += Number(row.total_visits);
        stats.count += 1;
      }
    );
    performanceByClinic.forEach((stats, clinicId) => {
      const kpi = kpiMap.get(clinicId);
      if (kpi && stats.count > 0) {
        // パフォーマンススコア: 1スタッフあたりの売上を1000で割って正規化 (0-5スケール)
        const avgRevenuePerStaff = stats.totalRevenue / stats.count;
        kpi.staff_performance_score = Math.min(
          5,
          Math.round((avgRevenuePerStaff / 100000) * 10) / 10
        );
      }
    });
  }

  return kpiMap;
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
      allowedRoles: ['admin'],
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { permissions, auth } = processResult;
    if (!requireAdmin(permissions.role)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    const adminSupabase = createAdminClient();

    let query = adminSupabase
      .from('clinics')
      .select('id, name, address, phone_number, is_active, created_at')
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
      const clinicIds = items.map((c) => c.id);
      const kpiMap = await fetchClinicKPIData(adminSupabase, clinicIds);

      items = items.map((clinic) => ({
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
      allowedRoles: ['admin'],
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, permissions, body } = processResult;
    if (!requireAdmin(permissions.role)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    const adminSupabase = createAdminClient();

    const parsed = ClinicCreateSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    const { name, address, phone_number, is_active } = parsed.data;

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
