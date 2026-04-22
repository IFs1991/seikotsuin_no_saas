/**
 * Admin notifications API
 *
 * GET /api/admin/notifications - list notifications
 * PATCH /api/admin/notifications - mark notifications as read/unread
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';
import {
  type AdminNotification,
  type AdminNotificationsPayload,
  type AdminNotificationsUpdatePayload,
} from '@/lib/notifications/admin-notifications';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

const MAX_NOTIFICATION_LIMIT = 100;
const DEFAULT_NOTIFICATION_LIMIT = 50;
const ADMIN_NOTIFICATION_SELECT =
  'id,user_id,clinic_id,title,message,type,is_read,related_entity_type,related_entity_id,created_at,read_at';

const markNotificationsSchema = z
  .object({
    clinic_id: z.string().uuid('clinic_idが不正です'),
    ids: z.array(z.string().uuid('通知IDが不正です')).max(100).optional(),
    notification_ids: z
      .array(z.string().uuid('通知IDが不正です'))
      .max(100)
      .optional(),
    mark_all: z.boolean().optional().default(false),
    is_read: z.boolean().optional().default(true),
  })
  .superRefine((value, context) => {
    const ids = value.ids ?? value.notification_ids;
    if (!value.mark_all && (!ids || ids.length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ids'],
        message: 'ids または mark_all が必要です',
      });
    }
  });

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(
    value ?? String(DEFAULT_NOTIFICATION_LIMIT),
    10
  );
  if (!Number.isFinite(parsed)) {
    return DEFAULT_NOTIFICATION_LIMIT;
  }

  return Math.min(Math.max(parsed, 0), MAX_NOTIFICATION_LIMIT);
}

function parseOffset(value: string | null): number {
  const parsed = Number.parseInt(value ?? '0', 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(parsed, 0);
}

function handleScopeError(error: unknown) {
  if (
    error instanceof ScopeAccessError ||
    error instanceof ScopeNotConfiguredError
  ) {
    return createErrorResponse(error.message, 403);
  }

  throw error;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clinicId = searchParams.get('clinic_id');
  const type = searchParams.get('type');
  const unreadOnly = searchParams.get('unread_only') === 'true';
  const includeCount = searchParams.get('include_count') !== 'false';
  const limit = parseLimit(searchParams.get('limit'));
  const offset = parseOffset(searchParams.get('offset'));

  try {
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (DOD-08)
    const processResult = await processApiRequest(request, {
      allowedRoles: Array.from(ADMIN_UI_ROLES),
      clinicId,
    });

    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth } = processResult;

    if (!clinicId) {
      return createErrorResponse('clinic_idは必須です', 400);
    }

    try {
      const adminCtx = createScopedAdminContext(processResult.permissions);
      adminCtx.assertClinicInScope(clinicId);
      const adminSupabase = adminCtx.client;

      let notifications: AdminNotification[] = [];
      let total = 0;

      if (limit > 0) {
        let query = adminSupabase
          .from('notifications')
          .select(ADMIN_NOTIFICATION_SELECT, { count: 'exact' })
          .eq('clinic_id', clinicId);

        if (type) {
          query = query.eq('type', type);
        }

        if (unreadOnly) {
          query = query.eq('is_read', false);
        }

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          logError(error, {
            endpoint: '/api/admin/notifications',
            method: 'GET',
            userId: auth.id,
            params: { clinic_id: clinicId, type, unread_only: unreadOnly },
          });
          return createErrorResponse('通知一覧の取得に失敗しました', 500);
        }

        notifications = data ?? [];
        total = count ?? notifications.length;
      }

      let unreadCount = 0;
      if (includeCount) {
        let unreadQuery = adminSupabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('clinic_id', clinicId)
          .eq('is_read', false);

        if (type) {
          unreadQuery = unreadQuery.eq('type', type);
        }

        const { count, error } = await unreadQuery;

        if (error) {
          logError(error, {
            endpoint: '/api/admin/notifications',
            method: 'GET',
            userId: auth.id,
            params: { clinic_id: clinicId, type, include_count: true },
          });
          return createErrorResponse('通知未読数の取得に失敗しました', 500);
        }

        unreadCount = count ?? 0;
      }

      const payload: AdminNotificationsPayload = {
        notifications,
        total,
        unreadCount,
      };

      return createSuccessResponse(payload);
    } catch (error) {
      return handleScopeError(error);
    }
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/notifications',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: Array.from(ADMIN_UI_ROLES),
      requireBody: true,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const parsed = markNotificationsSchema.safeParse(processResult.body);
    if (!parsed.success) {
      return createErrorResponse(
        parsed.error.issues[0]?.message ?? '入力値が不正です',
        400,
        parsed.error.flatten()
      );
    }

    const { auth } = processResult;
    const { clinic_id, mark_all, is_read } = parsed.data;
    const ids = parsed.data.ids ?? parsed.data.notification_ids ?? [];

    try {
      const adminCtx = createScopedAdminContext(processResult.permissions);
      adminCtx.assertClinicInScope(clinic_id);

      const readAt = is_read ? new Date().toISOString() : null;
      let updateQuery = adminCtx.client
        .from('notifications')
        .update({ is_read, read_at: readAt })
        .eq('clinic_id', clinic_id);

      if (mark_all && is_read) {
        updateQuery = updateQuery.eq('is_read', false);
      }

      if (!mark_all) {
        updateQuery = updateQuery.in('id', ids);
      }

      const { data: updatedRows, error: updateError } =
        await updateQuery.select('id,is_read,read_at');

      if (updateError) {
        logError(updateError, {
          endpoint: '/api/admin/notifications',
          method: 'PATCH',
          userId: auth.id,
          params: { clinic_id, ids, mark_all, is_read },
        });
        return createErrorResponse('通知の既読状態更新に失敗しました', 500);
      }

      const { count: unreadCount, error: countError } = await adminCtx.client
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinic_id)
        .eq('is_read', false);

      if (countError) {
        logError(countError, {
          endpoint: '/api/admin/notifications',
          method: 'PATCH',
          userId: auth.id,
          params: { clinic_id, include_count: true },
        });
      }

      const updatedIds = (updatedRows ?? []).map(row => row.id);
      const payload: AdminNotificationsUpdatePayload = {
        updatedIds,
        updatedCount: updatedIds.length,
        unreadCount: unreadCount ?? 0,
      };

      return createSuccessResponse(payload, 200, '通知を更新しました');
    } catch (error) {
      return handleScopeError(error);
    }
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/notifications',
      method: 'PATCH',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
