/**
 * セキュリティセッション API
 * 仕様書: docs/セキュリティ監視運用_MVP仕様書.md
 *
 * GET /api/admin/security/sessions - アクティブセッション一覧を取得
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
 * GET /api/admin/security/sessions
 * アクティブセッション一覧を取得
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clinicId = searchParams.get('clinic_id');
  const userId = searchParams.get('user_id');
  const limit = parseInt(searchParams.get('limit') || '50', 10);

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

    // クエリ構築
    let query = supabase
      .from('user_sessions')
      .select(`
        id,
        user_id,
        clinic_id,
        device_info,
        ip_address,
        user_agent,
        geolocation,
        created_at,
        last_activity,
        expires_at,
        is_active,
        is_revoked,
        max_idle_minutes,
        max_session_hours
      `)
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .eq('is_revoked', false)
      .order('last_activity', { ascending: false })
      .limit(Math.min(limit, 100));

    // ユーザーIDでフィルタリング
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: sessions, error } = await query;

    if (error) {
      logError(error, {
        endpoint: '/api/admin/security/sessions',
        method: 'GET',
        userId: auth.id,
        params: { clinic_id: clinicId, user_id: userId },
      });
      return createErrorResponse('セッション一覧の取得に失敗しました', 500);
    }

    // ユーザー情報を取得
    const userIds = [...new Set(sessions?.map((s) => s.user_id) || [])];
    let userMap: Record<string, { email?: string; name?: string }> = {};

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, email, full_name')
        .in('user_id', userIds);

      if (profiles) {
        userMap = profiles.reduce(
          (acc, p) => {
            acc[p.user_id] = {
              email: p.email,
              name: p.full_name || undefined,
            };
            return acc;
          },
          {} as Record<string, { email?: string; name?: string }>
        );
      }
    }

    // セッション情報を拡張
    const enrichedSessions = (sessions || []).map((session) => {
      const user = userMap[session.user_id] || {};
      const deviceInfo = session.device_info || {};

      // リスクレベル計算
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      const sessionAge =
        Date.now() - new Date(session.created_at).getTime();
      const maxAge = (session.max_session_hours || 8) * 60 * 60 * 1000;

      if (sessionAge > maxAge * 0.9) {
        riskLevel = 'high';
      } else if (sessionAge > maxAge * 0.5) {
        riskLevel = 'medium';
      }

      return {
        id: session.id,
        userId: session.user_id,
        userName: user.name || user.email || 'Unknown',
        userEmail: user.email,
        device: `${deviceInfo.browser || 'Unknown'} on ${deviceInfo.os || 'Unknown'}`,
        deviceType: deviceInfo.device || 'unknown',
        ipAddress: session.ip_address,
        location: session.geolocation
          ? `${session.geolocation.city || ''}, ${session.geolocation.country || ''}`
          : 'Unknown',
        loginTime: session.created_at,
        lastActivity: session.last_activity,
        expiresAt: session.expires_at,
        riskLevel,
      };
    });

    return createSuccessResponse({
      sessions: enrichedSessions,
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/security/sessions',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
