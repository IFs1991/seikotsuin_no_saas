/**
 * セッション強制終了 API
 * 仕様書: docs/セキュリティ監視運用_MVP仕様書.md
 *
 * POST /api/admin/security/sessions/terminate - セッションを強制終了
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import { ADMIN_UI_ROLES, canAccessAdminUIWithCompat } from '@/lib/constants/roles';

// リクエストスキーマ
const TerminateSessionSchema = z.object({
  sessionId: z.string().uuid('有効なセッションIDを指定してください'),
  reason: z.string().max(500).optional(),
});

// 管理者権限チェック（定数化 + 互換マッピング対応）
// @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (DOD-08)
const isAdmin = (role: string) => canAccessAdminUIWithCompat(role);

/**
 * POST /api/admin/security/sessions/terminate
 * セッションを強制終了
 */
export async function POST(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: Array.from(ADMIN_UI_ROLES),
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { supabase, auth, permissions, body } = processResult;

    // 管理者権限チェック
    if (!isAdmin(permissions.role)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    // バリデーション
    const parseResult = TerminateSessionSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      const firstError =
        Object.values(errors.fieldErrors)[0]?.[0] ??
        errors.formErrors[0] ??
        '入力値にエラーがあります';
      return createErrorResponse(firstError, 400, errors);
    }

    const { sessionId, reason } = parseResult.data;

    // セッション情報を取得
    const { data: session, error: fetchError } = await supabase
      .from('user_sessions')
      .select('id, user_id, clinic_id, is_active')
      .eq('id', sessionId)
      .single();

    if (fetchError || !session) {
      return createErrorResponse('指定されたセッションが見つかりません', 404);
    }

    // 既に無効化されている場合
    if (!session.is_active) {
      return createErrorResponse('セッションは既に終了しています', 400);
    }

    // セッションを終了（revokeフラグを立てる）
    const { error: updateError } = await supabase
      .from('user_sessions')
      .update({
        is_active: false,
        is_revoked: true,
        revoked_at: new Date().toISOString(),
        revoked_by: auth.id,
        revoked_reason: reason || 'admin_terminated',
      })
      .eq('id', sessionId);

    if (updateError) {
      logError(updateError, {
        endpoint: '/api/admin/security/sessions/terminate',
        method: 'POST',
        userId: auth.id,
        params: { sessionId },
      });
      return createErrorResponse('セッションの終了に失敗しました', 500);
    }

    // セキュリティイベントを記録
    await supabase.from('security_events').insert({
      user_id: session.user_id,
      clinic_id: session.clinic_id,
      session_id: sessionId,
      event_type: 'session_terminated_by_admin',
      event_category: 'session_management',
      severity_level: 'warning',
      event_description: `管理者によってセッションが強制終了されました${reason ? `: ${reason}` : ''}`,
      event_data: {
        terminated_by: auth.id,
        reason: reason || 'admin_terminated',
      },
      source_component: 'security_api',
      created_at: new Date().toISOString(),
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    });

    // 監査ログ出力
    await AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'terminate_session',
      sessionId,
      {
        target_user_id: session.user_id,
        reason: reason || 'admin_terminated',
      }
    );

    return createSuccessResponse({
      message: 'セッションを終了しました',
      sessionId,
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/security/sessions/terminate',
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
