/**
 * ベータ利用状況メトリクスAPI
 *
 * このAPIは以下の機能を提供します：
 * - GET: ベータ期間中の利用状況メトリクスを取得
 * - POST: メトリクスの記録（システム自動）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// メトリクス取得パラメータスキーマ
const metricsQuerySchema = z.object({
  clinicId: z.string().uuid().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

/**
 * GET /api/beta/metrics
 * ベータ利用状況メトリクスの取得
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    // 認証チェック
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      logger.warn('Unauthorized metrics access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // プロフィール取得
    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id, role')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // クエリパラメータ検証
    const queryParams = {
      clinicId: searchParams.get('clinicId') || undefined,
      periodStart: searchParams.get('periodStart') || undefined,
      periodEnd: searchParams.get('periodEnd') || undefined,
    };

    const validation = metricsQuerySchema.safeParse(queryParams);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { clinicId, periodStart, periodEnd } = validation.data;

    // クエリ構築
    let query = supabase
      .from('beta_usage_metrics')
      .select('*, clinics(id, name)')
      .order('period_start', { ascending: false });

    // 管理者以外は自分のクリニックのみ
    if (profile.role !== 'admin') {
      query = query.eq('clinic_id', profile.clinic_id);
    } else if (clinicId) {
      query = query.eq('clinic_id', clinicId);
    }

    // 期間フィルター
    if (periodStart) {
      query = query.gte('period_start', periodStart);
    }
    if (periodEnd) {
      query = query.lte('period_end', periodEnd);
    }

    const { data: metrics, error } = await query;

    if (error) {
      logger.error('Failed to fetch beta metrics', { error, userId: user.id });
      return NextResponse.json(
        { error: 'Failed to fetch metrics' },
        { status: 500 }
      );
    }

    logger.info('Beta metrics fetched successfully', {
      userId: user.id,
      count: metrics?.length || 0,
    });

    return NextResponse.json({ metrics });
  } catch (error) {
    logger.error('Unexpected error in GET /api/beta/metrics', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/beta/metrics
 * メトリクスの記録（システム自動・管理者のみ）
 *
 * このエンドポイントはシステムの自動バッチ処理または管理者が手動でメトリクスを記録する際に使用
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 認証チェック（システムまたは管理者のみ）
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      logger.warn('Unauthorized metrics recording attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 管理者権限チェック
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      logger.warn('Non-admin metrics recording attempt', { userId: user.id });
      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // リクエストボディ取得
    const body = await request.json();
    const { clinicId, periodStart, periodEnd } = body;

    if (!clinicId || !periodStart || !periodEnd) {
      return NextResponse.json(
        { error: 'Missing required fields: clinicId, periodStart, periodEnd' },
        { status: 400 }
      );
    }

    // 期間内のメトリクスを計算
    const metrics = await calculateMetrics(
      supabase,
      clinicId,
      periodStart,
      periodEnd
    );

    // メトリクス保存
    const { data: savedMetrics, error: insertError } = await supabase
      .from('beta_usage_metrics')
      .insert({
        clinic_id: clinicId,
        period_start: periodStart,
        period_end: periodEnd,
        ...metrics,
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Failed to insert beta metrics', {
        error: insertError,
        clinicId,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Failed to record metrics' },
        { status: 500 }
      );
    }

    logger.info('Beta metrics recorded successfully', {
      userId: user.id,
      clinicId,
      metricsId: savedMetrics.id,
    });

    return NextResponse.json({ metrics: savedMetrics }, { status: 201 });
  } catch (error) {
    logger.error('Unexpected error in POST /api/beta/metrics', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * メトリクス計算関数
 */
async function calculateMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
  periodStart: string,
  periodEnd: string
) {
  // セキュリティイベントからログイン数を集計
  const { data: loginEvents } = await supabase
    .from('security_events')
    .select('user_id, created_at')
    .eq('clinic_id', clinicId)
    .eq('event_type', 'login_success')
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd);

  const loginCount = loginEvents?.length || 0;
  const uniqueUsers = new Set(loginEvents?.map(e => e.user_id)).size;

  // ダッシュボード閲覧数
  const { data: dashboardViews } = await supabase
    .from('security_events')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('event_type', 'dashboard_view')
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd);

  const dashboardViewCount = dashboardViews?.length || 0;

  // 日報登録数
  const { data: dailyReports } = await supabase
    .from('security_events')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('event_type', 'daily_report_submit')
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd);

  const dailyReportSubmissions = dailyReports?.length || 0;

  // 患者分析閲覧数
  const { data: patientAnalysisViews } = await supabase
    .from('security_events')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('event_type', 'patient_analysis_view')
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd);

  const patientAnalysisViewCount = patientAnalysisViews?.length || 0;

  // セッション情報から平均セッション時間を計算
  const { data: sessions } = await supabase
    .from('user_sessions')
    .select('created_at, last_activity')
    .eq('clinic_id', clinicId)
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd);

  let totalSessionDuration = 0;
  if (sessions && sessions.length > 0) {
    sessions.forEach(session => {
      const start = new Date(session.created_at).getTime();
      const end = new Date(session.last_activity).getTime();
      totalSessionDuration += (end - start) / 1000 / 60; // 分単位
    });
  }
  const averageSessionDuration = sessions?.length
    ? totalSessionDuration / sessions.length
    : 0;

  // 日次アクティブ率の計算（簡易版）
  const periodDays = Math.ceil(
    (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  const dailyActiveRate =
    uniqueUsers > 0 ? (loginCount / periodDays / uniqueUsers) * 100 : 0;

  // 機能採用率（ダミーデータ - 実際は各機能の利用ユーザー数を計算）
  const featureAdoptionRate = {
    dashboard:
      dashboardViewCount > 0
        ? uniqueUsers > 0
          ? (dashboardViewCount / uniqueUsers) * 100
          : 0
        : 0,
    dailyReports:
      dailyReportSubmissions > 0
        ? uniqueUsers > 0
          ? (dailyReportSubmissions / uniqueUsers) * 100
          : 0
        : 0,
    patientAnalysis:
      patientAnalysisViewCount > 0
        ? uniqueUsers > 0
          ? (patientAnalysisViewCount / uniqueUsers) * 100
          : 0
        : 0,
    aiInsights: 0, // AIインサイトはMVPではモックなので0
  };

  // 日報完了率（簡易版 - 営業日数と実際の日報数を比較）
  const expectedDailyReports = periodDays; // 簡易版では全日を営業日とする
  const dailyReportCompletionRate =
    expectedDailyReports > 0
      ? (dailyReportSubmissions / expectedDailyReports) * 100
      : 0;

  return {
    login_count: loginCount,
    unique_users: uniqueUsers,
    dashboard_view_count: dashboardViewCount,
    daily_report_submissions: dailyReportSubmissions,
    patient_analysis_view_count: patientAnalysisViewCount,
    average_session_duration: Math.round(averageSessionDuration * 100) / 100,
    daily_active_rate: Math.round(dailyActiveRate * 100) / 100,
    feature_adoption_rate: featureAdoptionRate,
    daily_report_completion_rate:
      Math.round(dailyReportCompletionRate * 100) / 100,
    data_accuracy: 95.0, // データ精度はマニュアル確認が必要なのでダミー値
    average_load_time: 500, // 平均ロード時間はパフォーマンスモニタリングから取得（ダミー値）
    error_rate: 0.5, // エラー率も同様（ダミー値）
  };
}
