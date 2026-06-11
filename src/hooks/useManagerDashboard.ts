'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  handleApiError,
  isErrorResponse,
  isSuccessResponse,
} from '@/lib/api-client';
import type { ManagerDashboardResponse } from '@/types/manager-dashboard';

export type UseManagerDashboardResult = {
  data: ManagerDashboardResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

const MANAGER_DASHBOARD_ERROR =
  '担当エリアダッシュボードの取得に失敗しました。時間をおいて再度お試しください。';

export function useManagerDashboard(): UseManagerDashboardResult {
  const [data, setData] = useState<ManagerDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadDashboard = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isCurrentRequest = () => requestIdRef.current === requestId;

    try {
      setLoading(true);
      setError(null);

      const response = await api.managerDashboard.get();

      if (isSuccessResponse(response)) {
        if (!isCurrentRequest()) {
          return;
        }
        setData(response.data);
        return;
      }

      if (isErrorResponse(response)) {
        if (!isCurrentRequest()) {
          return;
        }
        setError(handleApiError(response.error, MANAGER_DASHBOARD_ERROR));
        setData(null);
        return;
      }

      if (!isCurrentRequest()) {
        return;
      }
      setError(MANAGER_DASHBOARD_ERROR);
      setData(null);
    } catch {
      if (!isCurrentRequest()) {
        return;
      }
      setError(MANAGER_DASHBOARD_ERROR);
      setData(null);
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return {
    data,
    loading,
    error,
    refetch: loadDashboard,
  };
}
