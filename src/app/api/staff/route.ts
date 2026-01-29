import { NextRequest } from 'next/server';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
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
import {
  ADMIN_UI_ROLES,
  STAFF_ROLES,
  canAccessCrossClinicWithCompat,
} from '@/lib/constants/roles';

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

    const { clinic_id: queryClinicId } = parsedQuery.data;

    // Q3決定: 一般スタッフも閲覧可能（自院限定）
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    const { supabase, permissions } = await ensureClinicAccess(
      request,
      PATH,
      queryClinicId,
      {
        allowedRoles: Array.from(STAFF_ROLES),
        requireClinicMatch: true,
      }
    );

    // DOD-09: テナント境界の明示 - permissions.clinic_idでスコープし、欠落時は拒否
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    const isHQ = canAccessCrossClinicWithCompat(permissions.role);

    // HQロール以外はpermissions.clinic_idが必須
    if (!isHQ && !permissions.clinic_id) {
      return createErrorResponse('クリニックが割り当てられていません', 403);
    }

    // 使用するclinic_id: HQロールはクエリパラメータ、それ以外はpermissions.clinic_id
    const clinic_id = isHQ ? queryClinicId : permissions.clinic_id!;

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

    // シフト分析：時間帯別予約数を取得
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: reservations, error: reservationsError } = await supabase
      .from('reservations')
      .select('id, staff_id, start_time, end_time, status')
      .eq('clinic_id', clinic_id)
      .gte('start_time', thirtyDaysAgo.toISOString())
      .lte('start_time', new Date().toISOString());

    if (reservationsError) {
      throw normalizeSupabaseError(reservationsError, PATH);
    }

    // 時間帯別予約数を集計
    const hourlyReservations: { hour: number; count: number }[] = [];
    const hourCounts: Record<number, number> = {};

    reservations?.forEach(res => {
      const hour = new Date(res.start_time).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    for (let h = 0; h < 24; h++) {
      hourlyReservations.push({ hour: h, count: hourCounts[h] || 0 });
    }

    // スタッフリソースの稼働時間を取得
    const { data: resources, error: resourcesError } = await supabase
      .from('resources')
      .select('id, name, type, working_hours')
      .eq('clinic_id', clinic_id)
      .eq('type', 'staff');

    if (resourcesError) {
      throw normalizeSupabaseError(resourcesError, PATH);
    }

    // 稼働率を計算
    let totalAvailableMinutes = 0;
    let totalBookedMinutes = 0;

    resources?.forEach(resource => {
      // 営業時間から利用可能時間を計算（簡易計算：平日5日 x 8時間 x 30日/7 = 約171時間）
      const workingHours = resource.working_hours as Record<
        string,
        { start: string; end: string } | null
      > | null;
      if (workingHours) {
        const weekdays = [
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
          'sunday',
        ];
        let weeklyMinutes = 0;

        weekdays.forEach(day => {
          const dayHours = workingHours[day];
          if (dayHours && dayHours.start && dayHours.end) {
            const [startH, startM] = dayHours.start.split(':').map(Number);
            const [endH, endM] = dayHours.end.split(':').map(Number);
            const dailyMinutes = endH * 60 + endM - (startH * 60 + startM);
            weeklyMinutes += dailyMinutes;
          }
        });

        // 30日分 ≒ 約4.3週
        totalAvailableMinutes += weeklyMinutes * (30 / 7);
      }
    });

    // 予約時間を集計
    reservations?.forEach(res => {
      if (res.status !== 'cancelled' && res.status !== 'no_show') {
        const start = new Date(res.start_time);
        const end = new Date(res.end_time);
        const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
        totalBookedMinutes += durationMinutes;
      }
    });

    const utilizationRate =
      totalAvailableMinutes > 0
        ? Math.round((totalBookedMinutes / totalAvailableMinutes) * 100)
        : 0;

    // 推奨コメントを生成
    const recommendations: string[] = [];

    // ピーク時間帯の分析
    const peakHours = hourlyReservations
      .filter(h => h.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    if (peakHours.length > 0) {
      const peakHourLabels = peakHours.map(h => `${h.hour}時`).join('、');
      recommendations.push(
        `ピーク時間帯は${peakHourLabels}です。この時間帯にスタッフを増員することを検討してください。`
      );
    }

    // 稼働率に基づく推奨
    if (utilizationRate < 50) {
      recommendations.push(
        `稼働率が${utilizationRate}%と低めです。予約促進キャンペーンの実施を検討してください。`
      );
    } else if (utilizationRate > 85) {
      recommendations.push(
        `稼働率が${utilizationRate}%と高いです。スタッフの増員または営業時間の拡大を検討してください。`
      );
    } else {
      recommendations.push(
        `稼働率は${utilizationRate}%で適正範囲内です。現在のシフト体制を維持してください。`
      );
    }

    // 閑散時間帯の分析
    const lowHours = hourlyReservations
      .filter(h => h.hour >= 9 && h.hour <= 18 && h.count === 0)
      .map(h => h.hour);

    if (lowHours.length > 0) {
      const lowHourLabels = lowHours
        .slice(0, 3)
        .map(h => `${h}時`)
        .join('、');
      recommendations.push(
        `${lowHourLabels}は予約が少ない傾向があります。この時間帯限定の割引を検討してください。`
      );
    }

    const shiftAnalysis = {
      hourlyReservations,
      utilizationRate,
      recommendations,
    };

    return createSuccessResponse({
      staffMetrics,
      revenueRanking,
      satisfactionCorrelation,
      performanceTrends,
      shiftAnalysis,
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

    const { supabase } = await ensureClinicAccess(
      request,
      PATH,
      dto.clinic_id,
      {
        allowedRoles: Array.from(ADMIN_UI_ROLES),
        requireClinicMatch: true,
      }
    );

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
