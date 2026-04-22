'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type AdminNotification,
  type AdminNotificationsUpdatePayload,
  isAdminNotificationsPayload,
  isApiSuccessEnvelope,
} from '@/lib/notifications/admin-notifications';
import type { Database } from '@/types/supabase';

type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'degraded';

interface RefreshOptions {
  silent?: boolean;
}

interface UseAdminNotificationsOptions {
  clinicId: string | null;
  enabled: boolean;
  limit?: number;
}

interface UseAdminNotificationsResult {
  notifications: AdminNotification[];
  unreadCount: number;
  total: number;
  loading: boolean;
  updating: boolean;
  error: string | null;
  realtimeStatus: RealtimeStatus;
  refresh: (options?: RefreshOptions) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const DEFAULT_LIMIT = 10;
const REALTIME_REFRESH_DEBOUNCE_MS = 300;
const POLL_FALLBACK_INTERVAL_MS = 60_000;

type RealtimeClient = SupabaseClient<Database>;
type RealtimeChannel = ReturnType<RealtimeClient['channel']>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function createRealtimeClient(): Promise<RealtimeClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  const { createBrowserClient } = await import('@supabase/ssr');
  return createBrowserClient<Database>(url, anonKey);
}

function isUpdatePayload(
  value: unknown
): value is AdminNotificationsUpdatePayload {
  if (!isRecord(value) || !Array.isArray(value.updatedIds)) {
    return false;
  }

  return (
    value.updatedIds.every(item => typeof item === 'string') &&
    typeof value.updatedCount === 'number' &&
    typeof value.unreadCount === 'number'
  );
}

function buildNotificationsUrl(clinicId: string, limit: number): string {
  const params = new URLSearchParams({
    clinic_id: clinicId,
    include_count: 'true',
    limit: String(limit),
  });

  return `/api/admin/notifications?${params}`;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function useAdminNotifications({
  clinicId,
  enabled,
  limit = DEFAULT_LIMIT,
}: UseAdminNotificationsOptions): UseAdminNotificationsResult {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('idle');
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetState = useCallback(() => {
    abortControllerRef.current?.abort();
    setNotifications(current => (current.length === 0 ? current : []));
    setUnreadCount(current => (current === 0 ? current : 0));
    setTotal(current => (current === 0 ? current : 0));
    setLoading(current => (current ? false : current));
    setUpdating(current => (current ? false : current));
    setError(current => (current === null ? current : null));
    setRealtimeStatus(current => (current === 'idle' ? current : 'idle'));
  }, []);

  const refresh = useCallback(
    async (options: RefreshOptions = {}) => {
      if (!enabled || !clinicId) {
        resetState();
        return;
      }

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      if (!options.silent) {
        setLoading(true);
      }

      try {
        const response = await fetch(buildNotificationsUrl(clinicId, limit), {
          cache: 'no-store',
          signal: abortController.signal,
        });
        const payload = await parseJsonResponse(response);

        if (!response.ok) {
          throw new Error('通知の取得に失敗しました');
        }

        if (
          !isApiSuccessEnvelope(payload, isAdminNotificationsPayload) ||
          abortController.signal.aborted
        ) {
          return;
        }

        setNotifications(payload.data.notifications);
        setUnreadCount(payload.data.unreadCount);
        setTotal(payload.data.total);
        setError(null);
      } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.name === 'AbortError') {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : '通知の取得に失敗しました'
        );
      } finally {
        if (!abortController.signal.aborted && !options.silent) {
          setLoading(false);
        }
      }
    },
    [clinicId, enabled, limit, resetState]
  );

  const scheduleRealtimeRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(() => {
      void refresh({ silent: true });
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  const updateReadState = useCallback(
    async (requestBody: { ids?: string[]; mark_all?: boolean }) => {
      if (!enabled || !clinicId) {
        return;
      }

      setUpdating(true);
      setError(null);

      try {
        const response = await fetch('/api/admin/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinic_id: clinicId,
            is_read: true,
            ...requestBody,
          }),
        });
        const payload = await parseJsonResponse(response);

        if (!response.ok) {
          throw new Error('通知の既読更新に失敗しました');
        }

        if (!isApiSuccessEnvelope(payload, isUpdatePayload)) {
          await refresh({ silent: true });
          return;
        }

        const readAt = new Date().toISOString();
        setUnreadCount(payload.data.unreadCount);
        setNotifications(currentNotifications => {
          if (requestBody.mark_all) {
            return currentNotifications.map(notification => ({
              ...notification,
              is_read: true,
              read_at: notification.read_at ?? readAt,
            }));
          }

          const updatedIds = new Set(payload.data.updatedIds);
          return currentNotifications.map(notification =>
            updatedIds.has(notification.id)
              ? {
                  ...notification,
                  is_read: true,
                  read_at: notification.read_at ?? readAt,
                }
              : notification
          );
        });
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : '通知の既読更新に失敗しました'
        );
      } finally {
        setUpdating(false);
      }
    },
    [clinicId, enabled, refresh]
  );

  const markAsRead = useCallback(
    async (notificationId: string) => {
      await updateReadState({ ids: [notificationId] });
    },
    [updateReadState]
  );

  const markAllAsRead = useCallback(async () => {
    await updateReadState({ mark_all: true });
  }, [updateReadState]);

  useEffect(() => {
    void refresh();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !clinicId) {
      setRealtimeStatus('idle');
      return;
    }

    let cancelled = false;
    let realtimeClient: RealtimeClient | null = null;
    let channel: RealtimeChannel | null = null;
    setRealtimeStatus('connecting');

    const subscribeRealtime = async () => {
      try {
        realtimeClient = await createRealtimeClient();
        if (cancelled) {
          return;
        }

        if (!realtimeClient) {
          setRealtimeStatus('degraded');
          return;
        }

        channel = realtimeClient
          .channel(`admin-notifications:${clinicId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'notifications',
              filter: `clinic_id=eq.${clinicId}`,
            },
            scheduleRealtimeRefresh
          )
          .subscribe(status => {
            setRealtimeStatus(
              status === 'SUBSCRIBED' ? 'connected' : 'degraded'
            );
          });
      } catch {
        if (!cancelled) {
          setRealtimeStatus('degraded');
        }
      }
    };

    void subscribeRealtime();

    return () => {
      cancelled = true;
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      if (realtimeClient && channel) {
        void realtimeClient.removeChannel(channel);
      }
    };
  }, [clinicId, enabled, scheduleRealtimeRefresh]);

  useEffect(() => {
    if (!enabled || !clinicId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refresh({ silent: true });
    }, POLL_FALLBACK_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh({ silent: true });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clinicId, enabled, refresh]);

  return {
    notifications,
    unreadCount,
    total,
    loading,
    updating,
    error,
    realtimeStatus,
    refresh,
    markAsRead,
    markAllAsRead,
  };
}
