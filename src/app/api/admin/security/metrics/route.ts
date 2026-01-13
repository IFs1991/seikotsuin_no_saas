/**
 * セキュリティメトリクス API
 * 仕様書: docs/セキュリティ監視運用_MVP仕様書.md
 *
 * GET /api/admin/security/metrics - ダッシュボード用の集計値を返す
 */

import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';

/**
 * GET /api/admin/security/metrics
 * セキュリティダッシュボード用のメトリクスを取得
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clinicId = searchParams.get('clinic_id');
  const days = parseInt(searchParams.get('days') || '30', 10);

  try {
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (DOD-08)
    const processResult = await processApiRequest(request, {
      allowedRoles: Array.from(ADMIN_UI_ROLES),
      clinicId,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { supabase, auth } = processResult;

    // バリデーション
    if (!clinicId) {
      return createErrorResponse('clinic_idは必須です', 400);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Math.min(days, 90));

    // 並列でメトリクスを取得
    const [
      eventsResult,
      sessionsResult,
      totalUsersResult,
      mfaEnabledResult,
      recentThreatsResult,
    ] = await Promise.all([
      // セキュリティイベント数
      supabase
        .from('security_events')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .gte('created_at', startDate.toISOString()),

      // アクティブセッション数
      supabase
        .from('user_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('is_active', true),

      // 総ユーザー数
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId),

      // MFA有効ユーザー数
      supabase
        .from('user_mfa_settings')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('is_enabled', true),

      // 直近の脅威イベント（high/critical）
      supabase
        .from('security_events')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .in('severity_level', ['error', 'critical'])
        .gte('created_at', startDate.toISOString()),
    ]);

    // ブロックされた試行数（failed_login系のイベント）
    const blockedResult = await supabase
      .from('security_events')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .in('event_type', ['brute_force_blocked', 'login_blocked', 'ip_blocked'])
      .gte('created_at', startDate.toISOString());

    // 成功ログイン数
    const successfulLoginsResult = await supabase
      .from('security_events')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('event_type', 'login_success')
      .gte('created_at', startDate.toISOString());

    // イベントタイプ別集計
    const { data: eventsByType } = await supabase
      .from('security_events')
      .select('event_type')
      .eq('clinic_id', clinicId)
      .gte('created_at', startDate.toISOString());

    const eventTypeCount: Record<string, number> = {};
    if (eventsByType) {
      for (const event of eventsByType) {
        eventTypeCount[event.event_type] =
          (eventTypeCount[event.event_type] || 0) + 1;
      }
    }

    // 日別集計
    const { data: eventsByDay } = await supabase
      .from('security_events')
      .select('created_at, severity_level')
      .eq('clinic_id', clinicId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    const dailyCounts: Record<string, { count: number; severity: string }> = {};
    if (eventsByDay) {
      for (const event of eventsByDay) {
        const date = new Date(event.created_at).toISOString().split('T')[0];
        if (!dailyCounts[date]) {
          dailyCounts[date] = { count: 0, severity: 'low' };
        }
        dailyCounts[date].count++;

        // 最も高い重要度を保持
        const severityOrder = ['info', 'warning', 'error', 'critical'];
        const currentIdx = severityOrder.indexOf(dailyCounts[date].severity);
        const newIdx = severityOrder.indexOf(event.severity_level);
        if (newIdx > currentIdx) {
          dailyCounts[date].severity = event.severity_level;
        }
      }
    }

    const totalUsers = totalUsersResult.count || 0;
    const mfaEnabledUsers = mfaEnabledResult.count || 0;

    // メトリクス構築
    const metrics = {
      totalEvents: eventsResult.count || 0,
      activeSessions: sessionsResult.count || 0,
      totalUsers,
      mfaEnabledUsers,
      recentThreats: recentThreatsResult.count || 0,
      blockedAttempts: blockedResult.count || 0,
      successfulLogins: successfulLoginsResult.count || 0,
      eventsByType: eventTypeCount,
      eventsByDay: Object.entries(dailyCounts).map(([date, data]) => ({
        date,
        count: data.count,
        severity: data.severity,
      })),
      mfaPercentage:
        totalUsers > 0 ? Math.round((mfaEnabledUsers / totalUsers) * 100) : 0,
    };

    return createSuccessResponse(metrics);
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/security/metrics',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
