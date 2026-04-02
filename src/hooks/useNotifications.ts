'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  api,
  isSuccessResponse,
  isErrorResponse,
  handleApiError,
} from '@/lib/api-client';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

const POLL_INTERVAL_MS = 30_000;

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await api.notifications.get();

      if (isSuccessResponse(response)) {
        setNotifications(response.data.notifications);
        setUnreadCount(response.data.unreadCount);
        setError(null);
      } else if (isErrorResponse(response)) {
        setError(handleApiError(response.error));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await api.notifications.getUnreadCount();

      if (isSuccessResponse(response)) {
        setUnreadCount(response.data.unreadCount);
      }
    } catch {
      // polling failure is silent
    }
  }, []);

  useEffect(() => {
    // fetchNotifications のレスポンスに unreadCount が含まれるため、
    // mount 時は fetchNotifications だけで十分。
    // ポーリングでは軽量な fetchUnreadCount のみを定期実行する。
    fetchNotifications();

    intervalRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchNotifications, fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
  };
}
