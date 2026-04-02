import { NextRequest } from 'next/server';
import {
  processApiRequest,
  createSuccessResponse,
  createErrorResponse,
  logError,
} from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const result = await processApiRequest(request);

  if (!result.success) {
    return result.error;
  }

  const { auth, supabase } = result;
  const url = new URL(request.url);

  const unreadOnly = url.searchParams.get('unread_only') === 'true';
  const includeCount = url.searchParams.get('include_count') !== 'false';
  const rawLimit = parseInt(url.searchParams.get('limit') || '20', 10);
  const limit = Math.min(Math.max(rawLimit, 0), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  try {
    let notifications: any[] = [];
    let total = 0;

    if (limit > 0) {
      let listQuery = supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('user_id', auth.id);

      if (unreadOnly) {
        listQuery = listQuery.eq('is_read', false);
      }

      const { data, count, error } = await listQuery
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logError(error, { endpoint: '/api/notifications', userId: auth.id });
        return createErrorResponse('通知の取得に失敗しました', 500);
      }

      notifications = data ?? [];
      total = count ?? 0;
    }

    let unreadCount = 0;
    if (includeCount) {
      const countResult = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', auth.id)
        .eq('is_read', false);

      if (!countResult.error) {
        unreadCount = countResult.count ?? 0;
      }
    }

    return createSuccessResponse({
      notifications,
      total,
      unreadCount,
    });
  } catch (error) {
    logError(error, { endpoint: '/api/notifications', userId: auth.id });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
