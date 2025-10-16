import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, DashboardData, ApiError } from '../../../types/api';
import {
  normalizeSupabaseError,
  createApiError,
  ERROR_CODES,
  AppError,
  logError,
  validation,
  ValidationErrorCollector,
} from '../../../lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<DashboardData>>> {
  const path = '/api/dashboard';

  try {
    const searchParams = request.nextUrl.searchParams;
    const clinicId = searchParams.get('clinic_id');
    const period = searchParams.get('period') || 'day';

    // バリデーション
    const validator = new ValidationErrorCollector();

    const clinicIdError = validation.required(clinicId, 'clinic_id');
    if (clinicIdError) {
      validator.add(clinicIdError.field, clinicIdError.message);
    }

    const uuidError = clinicId ? validation.uuid(clinicId, 'clinic_id') : null;
    if (uuidError) {
      validator.add(uuidError.field, uuidError.message);
    }

    if (validator.hasErrors()) {
      return NextResponse.json(
        { success: false, error: validator.getApiError() },
        { status: 400 }
      );
    }

    const { supabase } = await ensureClinicAccess(request, path, clinicId);

    const resolvedClinicId = clinicId!;

    // 基本的なダッシュボードデータを取得
    const today = new Date().toISOString().split('T')[0];

    // 日次収益データ
    const { data: dailyRevenue, error: revenueError } = await supabase
      .from('daily_revenue_summary')
      .select('*')
      .eq('clinic_id', resolvedClinicId)
      .eq('revenue_date', today)
      .single();

    if (revenueError && revenueError.code !== 'PGRST116') {
      throw normalizeSupabaseError(revenueError, path);
    }

    // 患者数データ
    const { data: patientCount, error: patientError } = await supabase
      .from('visits')
      .select('patient_id')
      .eq('clinic_id', resolvedClinicId)
      .gte('visit_date', today)
      .lt(
        'visit_date',
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      );

    if (patientError) {
      throw normalizeSupabaseError(patientError, path);
    }

    // AIコメント取得
    const { data: aiComment, error: aiError } = await supabase
      .from('daily_ai_comments')
      .select('*')
      .eq('clinic_id', resolvedClinicId)
      .eq('comment_date', today)
      .single();

    if (aiError && aiError.code !== 'PGRST116') {
      throw normalizeSupabaseError(aiError, path);
    }

    // 収益トレンドデータ（過去7日）
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const { data: revenueChartData, error: chartError } = await supabase
      .from('daily_revenue_summary')
      .select('*')
      .eq('clinic_id', resolvedClinicId)
      .gte('revenue_date', sevenDaysAgo)
      .order('revenue_date', { ascending: true });

    if (chartError) {
      throw normalizeSupabaseError(chartError, path);
    }

    // ヒートマップデータ（時間別来院パターン）
    const { data: heatmapData, error: heatmapError } = await supabase.rpc(
      'get_hourly_visit_pattern',
      { clinic_uuid: resolvedClinicId }
    );

    if (heatmapError) {
      logError(new Error('Failed to fetch heatmap data'), {
        clinicId,
        heatmapError,
      });
      // ヒートマップエラーは致命的でないため、空配列で継続
    }

    // 前日データ取得（差分アラート用）
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const { data: yesterdayRevenue } = await supabase
      .from('daily_revenue_summary')
      .select('*')
      .eq('clinic_id', resolvedClinicId)
      .eq('revenue_date', yesterday)
      .single();

    const { data: yesterdayPatientCount } = await supabase
      .from('visits')
      .select('patient_id')
      .eq('clinic_id', resolvedClinicId)
      .gte('visit_date', yesterday)
      .lt('visit_date', today);

    // 差分アラート生成
    const alerts: string[] = [];
    const ALERT_THRESHOLDS = {
      REVENUE_DECREASE: 0.2, // 20%減少
      REVENUE_INCREASE: 0.3, // 30%増加
      PATIENTS_DECREASE: 0.2, // 20%減少
      PATIENTS_INCREASE: 0.3, // 30%増加
    };

    const todayRevenue = dailyRevenue?.total_revenue || 0;
    const todayPatients = patientCount?.length || 0;
    const prevRevenue = yesterdayRevenue?.total_revenue || 0;
    const prevPatients = yesterdayPatientCount?.length || 0;

    if (prevRevenue > 0) {
      const revenueChange = (todayRevenue - prevRevenue) / prevRevenue;
      if (revenueChange < -ALERT_THRESHOLDS.REVENUE_DECREASE) {
        const changePercent = Math.abs(Math.round(revenueChange * 100));
        alerts.push(
          `売上が前日比${changePercent}%減少しています（前日: ¥${prevRevenue.toLocaleString()}, 本日: ¥${todayRevenue.toLocaleString()}）`
        );
      } else if (revenueChange > ALERT_THRESHOLDS.REVENUE_INCREASE) {
        const changePercent = Math.round(revenueChange * 100);
        alerts.push(
          `売上が前日比${changePercent}%増加しています（前日: ¥${prevRevenue.toLocaleString()}, 本日: ¥${todayRevenue.toLocaleString()}）`
        );
      }
    }

    if (prevPatients > 0) {
      const patientsChange = (todayPatients - prevPatients) / prevPatients;
      if (patientsChange < -ALERT_THRESHOLDS.PATIENTS_DECREASE) {
        const changePercent = Math.abs(Math.round(patientsChange * 100));
        alerts.push(
          `患者数が前日比${changePercent}%減少しています（前日: ${prevPatients}名, 本日: ${todayPatients}名）`
        );
      } else if (patientsChange > ALERT_THRESHOLDS.PATIENTS_INCREASE) {
        const changePercent = Math.round(patientsChange * 100);
        alerts.push(
          `患者数が前日比${changePercent}%増加しています（前日: ${prevPatients}名, 本日: ${todayPatients}名）`
        );
      }
    }

    // レスポンスデータの構築
    const dashboardData: DashboardData = {
      dailyData: {
        revenue: todayRevenue,
        patients: todayPatients,
        insuranceRevenue: dailyRevenue?.insurance_revenue || 0,
        privateRevenue: dailyRevenue?.private_revenue || 0,
      },
      aiComment: aiComment
        ? {
            id: aiComment.id,
            summary: aiComment.summary || '',
            highlights: aiComment.good_points ? [aiComment.good_points] : [],
            improvements: aiComment.improvement_points
              ? [aiComment.improvement_points]
              : [],
            suggestions: aiComment.suggestion_for_tomorrow
              ? [aiComment.suggestion_for_tomorrow]
              : [],
            created_at: aiComment.created_at,
          }
        : null,
      revenueChartData:
        revenueChartData?.map(item => ({
          name: item.revenue_date,
          総売上: Number(item.total_revenue) || 0,
          保険診療: Number(item.insurance_revenue) || 0,
          自費診療: Number(item.private_revenue) || 0,
        })) || [],
      heatmapData: heatmapData || [],
      alerts,
    };

    const response: ApiResponse<DashboardData> = {
      success: true,
      data: dashboardData,
    };

    return NextResponse.json(response);
  } catch (error) {
    let apiError: ApiError;
    let statusCode = 500;

    if (error instanceof AppError) {
      apiError = error.toApiError(path);
      statusCode = error.statusCode;
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = normalizeSupabaseError(error, path);
      statusCode = 500;
    } else {
      apiError = createApiError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'Dashboard data fetch failed',
        undefined,
        path
      );
    }

    logError(error instanceof Error ? error : new Error(String(error)), {
      path,
      clinicId: request.nextUrl.searchParams.get('clinic_id'),
    });

    const response: ApiResponse<DashboardData> = {
      success: false,
      error: apiError,
    };

    return NextResponse.json(response, { status: statusCode });
  }
}
