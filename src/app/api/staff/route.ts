import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
} from '@/lib/api-helpers';
import {
  AppError,
  createApiError,
  ERROR_CODES,
  normalizeSupabaseError,
  logError,
} from '@/lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import {
  mapStaffInsertToRow,
  staffInsertSchema,
  staffQuerySchema,
} from './schema';

const PATH = '/api/staff';

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = staffQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
    });

    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const { clinic_id } = parsedQuery.data;

    const { supabase } = await ensureClinicAccess(request, PATH, clinic_id, {
      requireClinicMatch: true,
    });

    const { data: staffPerformance, error: staffError } = await supabase
      .from('staff_performance_summary')
      .select('*')
      .eq('clinic_id', clinic_id);

    if (staffError) {
      throw normalizeSupabaseError(staffError, PATH);
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const { data: monthlyPerformance, error: monthlyError } = await supabase
      .from('staff_performance')
      .select(
        `
        *,
        staff(name, role)
      `
      )
      .eq('clinic_id', clinic_id)
      .gte('performance_date', `${currentMonth}-01`)
      .order('performance_date', { ascending: false });

    if (monthlyError) {
      throw normalizeSupabaseError(monthlyError, PATH);
    }

    const staffMetrics = {
      dailyPatients:
        (staffPerformance?.reduce((sum, staff) => {
          const avgDaily = staff.total_visits / Math.max(staff.working_days, 1);
          return sum + avgDaily;
        }, 0) ?? 0) / Math.max(staffPerformance?.length || 1, 1),
      totalRevenue:
        staffPerformance?.reduce(
          (sum, staff) => sum + (staff.total_revenue_generated || 0),
          0
        ) || 0,
      averageSatisfaction:
        (staffPerformance?.reduce((sum, staff) => {
          return sum + (staff.average_satisfaction_score || 0);
        }, 0) ?? 0) / Math.max(staffPerformance?.length || 1, 1),
    };

    const revenueRanking =
      staffPerformance
        ?.slice()
        .sort(
          (a, b) =>
            (b.total_revenue_generated || 0) - (a.total_revenue_generated || 0)
        )
        .slice(0, 10)
        .map(staff => ({
          staff_id: staff.staff_id,
          name: staff.staff_name,
          revenue: staff.total_revenue_generated || 0,
          patients: staff.unique_patients || 0,
          satisfaction: staff.average_satisfaction_score || 0,
        })) || [];

    const satisfactionCorrelation =
      staffPerformance?.map(staff => ({
        name: staff.staff_name,
        satisfaction: staff.average_satisfaction_score || 0,
        revenue: staff.total_revenue_generated || 0,
        patients: staff.unique_patients || 0,
      })) || [];

    const performanceTrends =
      monthlyPerformance?.reduce(
        (acc, record) => {
          const staffName = record.staff?.name || 'Unknown';
          if (!acc[staffName]) {
            acc[staffName] = [];
          }
          acc[staffName].push({
            date: record.performance_date,
            revenue: record.revenue_generated || 0,
            patients: record.patient_count || 0,
            satisfaction: record.satisfaction_score || 0,
          });
          return acc;
        },
        {} as Record<string, any[]>
      ) || {};

    const skillMatrix =
      staffPerformance?.map(staff => ({
        id: staff.staff_id,
        name: staff.staff_name,
        skills: [
          { name: '基本施術', level: Math.floor(Math.random() * 5) + 1 },
          { name: 'カウンセリング', level: Math.floor(Math.random() * 5) + 1 },
          { name: '専門技術', level: Math.floor(Math.random() * 5) + 1 },
          { name: '接客', level: Math.floor(Math.random() * 5) + 1 },
        ],
      })) || [];

    const trainingHistory = [
      {
        id: 1,
        staff_id: staffPerformance?.[0]?.staff_id,
        title: '基礎施術研修',
        date: '2024-01-15',
        completed: true,
      },
      {
        id: 2,
        staff_id: staffPerformance?.[0]?.staff_id,
        title: 'コミュニケーション研修',
        date: '2024-02-20',
        completed: true,
      },
    ];

    return createSuccessResponse({
      staffMetrics,
      revenueRanking,
      satisfactionCorrelation,
      performanceTrends,
      skillMatrix,
      trainingHistory,
      totalStaff: staffPerformance?.length || 0,
      activeStaff:
        staffPerformance?.filter(s => s.working_days > 0).length || 0,
    });
  } catch (error) {
    let apiError;
    let statusCode = 500;

    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = error;
    } else {
      apiError = createApiError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'Staff data fetch failed',
        undefined,
        PATH
      );
    }

    logError(error instanceof Error ? error : new Error(String(error)), {
      path: PATH,
    });

    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}

export async function POST(request: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return createErrorResponse('無効なJSONデータです', 400);
    }

    const parsedBody = staffInsertSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedBody.error.flatten()
      );
    }

    const dto = parsedBody.data;

    const { supabase } = await ensureClinicAccess(request, PATH, dto.clinic_id, {
      allowedRoles: ['admin', 'clinic_manager'],
      requireClinicMatch: true,
    });

    const insertPayload = mapStaffInsertToRow(dto);

    const { data, error } = await supabase
      .from('staff')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse(data, 201);
  } catch (error) {
    let apiError;
    let statusCode = 500;

    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = normalizeSupabaseError(error, PATH);
    } else {
      apiError = createApiError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'Staff creation failed',
        undefined,
        PATH
      );
    }

    logError(error instanceof Error ? error : new Error(String(error)), {
      path: PATH,
    });

    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}
