/**
 * セキュリティイベント API
 * 仕様書: docs/セキュリティ監視運用_MVP仕様書.md
 *
 * GET   /api/admin/security/events - イベント一覧取得
 * PATCH /api/admin/security/events - イベントステータス更新
 * POST  /api/admin/security/events - イベント作成（内部用）
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

// ステータス定義
const VALID_STATUSES = [
  'new',
  'investigating',
  'resolved',
  'false_positive',
] as const;
type EventStatus = (typeof VALID_STATUSES)[number];

// 重要度定義
const SEVERITY_LEVELS = ['info', 'warning', 'error', 'critical'] as const;
type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

// イベント更新スキーマ
// 注意: clinic_idはリクエストから受け取らず、JWTのpermissionsから取得する（設計改善）
const UpdateEventSchema = z.object({
  id: z.string().uuid('有効なイベントIDを指定してください'),
  status: z.enum(VALID_STATUSES).optional(),
  resolution_notes: z
    .string()
    .max(2000, '解決メモは2000文字以内で入力してください')
    .optional(),
  actions_taken: z.array(z.string()).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

// イベント作成スキーマ
const CreateEventSchema = z.object({
  clinic_id: z.string().uuid('有効なclinic_idを指定してください'),
  event_type: z.string().min(1, 'イベントタイプは必須です'),
  event_category: z.string().min(1, 'イベントカテゴリは必須です'),
  severity_level: z.enum(SEVERITY_LEVELS),
  event_description: z.string().min(1, 'イベント説明は必須です'),
  user_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  source_component: z.string().optional(),
  event_data: z.record(z.unknown()).optional(),
});

// 管理者権限チェック（定数化 + 互換マッピング対応）
// @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (DOD-08)
const isAdmin = (role: string) => canAccessAdminUIWithCompat(role);

/**
 * GET /api/admin/security/events
 * セキュリティイベント一覧を取得
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clinicId = searchParams.get('clinic_id');
  const status = searchParams.get('status');
  const severity = searchParams.get('severity');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const eventId = searchParams.get('id');

  try {
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
      .from('security_events')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 100));

    // フィルタリング
    if (status && VALID_STATUSES.includes(status as EventStatus)) {
      query = query.eq('status', status);
    }

    if (severity && SEVERITY_LEVELS.includes(severity as SeverityLevel)) {
      query = query.eq('severity_level', severity);
    }

    if (eventId) {
      query = query.eq('id', eventId);
    }

    const { data: events, error } = await query;

    if (error) {
      logError(error, {
        endpoint: '/api/admin/security/events',
        method: 'GET',
        userId: auth.id,
        params: { clinic_id: clinicId, status, severity },
      });
      return createErrorResponse('イベント一覧の取得に失敗しました', 500);
    }

    return createSuccessResponse({ events: events || [] });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/security/events',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

/**
 * PATCH /api/admin/security/events
 * セキュリティイベントのステータスを更新
 */
export async function PATCH(request: NextRequest) {
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
    const parseResult = UpdateEventSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      const firstError =
        Object.values(errors.fieldErrors)[0]?.[0] ??
        errors.formErrors[0] ??
        '入力値にエラーがあります';
      return createErrorResponse(firstError, 400, errors);
    }

    const { id, status, resolution_notes, actions_taken, assigned_to } =
      parseResult.data;

    // clinic_idはJWT/permissionsから取得（リクエストから受け取らない）
    // これにより、テナント間データ漏洩のリスクを根本的に排除
    const clinic_id = permissions.clinic_id;
    if (!clinic_id) {
      return createErrorResponse('クリニックIDが特定できません', 403);
    }

    // 更新データ構築
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (status !== undefined) {
      updateData.status = status;

      // 解決済みに変更された場合はresolved_atを設定
      if (status === 'resolved' || status === 'false_positive') {
        updateData.resolved_at = new Date().toISOString();
      }
    }

    if (resolution_notes !== undefined) {
      updateData.resolution_notes = resolution_notes;
    }

    if (actions_taken !== undefined) {
      updateData.actions_taken = actions_taken;
    }

    if (assigned_to !== undefined) {
      updateData.assigned_to = assigned_to;
    }

    // 更新実行（clinic_idフィルターを追加して多層防御）
    const { data: updatedEvent, error } = await supabase
      .from('security_events')
      .update(updateData)
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('指定されたイベントが見つかりません', 404);
      }
      logError(error, {
        endpoint: '/api/admin/security/events',
        method: 'PATCH',
        userId: auth.id,
        params: { id, clinic_id },
      });
      return createErrorResponse('イベントの更新に失敗しました', 500);
    }

    // 監査ログ出力（clinic_idを含めて追跡可能性向上）
    await AuditLogger.logAdminAction(
      auth.id,
      auth.email,
      'update_security_event',
      id,
      {
        clinic_id,
        status,
        resolution_notes,
        actions_taken,
      }
    );

    return createSuccessResponse({
      message: 'イベントを更新しました',
      event: updatedEvent,
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/security/events',
      method: 'PATCH',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

/**
 * POST /api/admin/security/events
 * セキュリティイベントを作成（高重要度の場合は通知も作成）
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

    const { supabase, auth, body } = processResult;

    // バリデーション
    const parseResult = CreateEventSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten();
      const firstError =
        Object.values(errors.fieldErrors)[0]?.[0] ??
        errors.formErrors[0] ??
        '入力値にエラーがあります';
      return createErrorResponse(firstError, 400, errors);
    }

    const eventData = parseResult.data;

    // イベント作成
    const { data: createdEvent, error: eventError } = await supabase
      .from('security_events')
      .insert({
        ...eventData,
        status: 'new',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (eventError) {
      logError(eventError, {
        endpoint: '/api/admin/security/events',
        method: 'POST',
        userId: auth.id,
        params: eventData,
      });
      return createErrorResponse('イベントの作成に失敗しました', 500);
    }

    // 高重要度（critical/error）の場合は通知を作成
    if (
      eventData.severity_level === 'critical' ||
      eventData.severity_level === 'error'
    ) {
      const notificationTitle = getNotificationTitle(eventData.event_type);

      const { error: notificationError } = await supabase
        .from('notifications')
        .upsert(
          {
            clinic_id: eventData.clinic_id,
            title: notificationTitle,
            message: eventData.event_description,
            type: 'security',
            related_entity_type: 'security_event',
            related_entity_id: createdEvent.id,
            created_at: new Date().toISOString(),
          },
          {
            onConflict: 'related_entity_type,related_entity_id,type',
            ignoreDuplicates: true,
          }
        );

      if (notificationError) {
        logError(notificationError, {
          endpoint: '/api/admin/security/events',
          method: 'POST',
          userId: auth.id,
          params: { event_id: createdEvent.id, clinic_id: eventData.clinic_id },
        });
      }
    }

    return createSuccessResponse({
      message: 'イベントを作成しました',
      event: createdEvent,
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/security/events',
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

/**
 * イベントタイプから通知タイトルを生成
 */
function getNotificationTitle(eventType: string): string {
  const titleMap: Record<string, string> = {
    threat_detected_brute_force: 'ブルートフォース攻撃を検知しました',
    threat_detected_session_hijack: 'セッション乗っ取りの疑いがあります',
    threat_detected_location_anomaly: '異常な位置からのアクセスを検知しました',
    threat_detected_multiple_devices:
      '複数デバイスからの同時ログインを検知しました',
    threat_detected_suspicious_login: '疑わしいログイン試行を検知しました',
    unauthorized_access: '権限外アクセスを検知しました',
    failed_login: 'ログイン失敗が発生しました',
  };

  return titleMap[eventType] ?? 'セキュリティアラート';
}
