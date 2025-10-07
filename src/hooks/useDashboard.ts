'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardData } from '../types/api';
import {
  api,
  isSuccessResponse,
  isErrorResponse,
  handleApiError,
} from '../lib/api-client';

interface UseDashboardReturn {
  dashboardData: DashboardData | null;
  loading: boolean;
  error: string | null;
  handleQuickAction: (action: string) => void;
  refetch: () => Promise<void>;
}

const useDashboard = (
  clinicId?: string | null
): UseDashboardReturn => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(Boolean(clinicId));
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (): Promise<void> => {
    if (!clinicId) {
      setDashboardData(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.dashboard.get(clinicId);

      if (isSuccessResponse(response)) {
        setDashboardData(response.data as DashboardData);
        setError(null);
      } else if (isErrorResponse(response)) {
        setDashboardData(null);
        setError(handleApiError(response.error));
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setDashboardData(null);
      setError('ダッシュボードデータの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId) {
      setLoading(false);
      setDashboardData(null);
      return;
    }

    fetchData();

    // 5分ごとにデータを更新（リアルタイム性を向上）
    const updateTimer = setInterval(fetchData, 300000);

    // ページの可視性が変わった時の処理
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(updateTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData]);

  const handleQuickAction = useCallback((action: string): void => {
    // クイックアクションの処理を実装
    try {
      switch (action) {
        case 'daily-report':
          window.location.href = '/daily-reports';
          break;
        case 'appointments':
          window.location.href = '/patients';
          break;
        case 'ai-chat':
          window.location.href = '/chat';
          break;
        default:
          console.warn('Unknown quick action:', action);
      }
    } catch (err) {
      console.error('Failed to handle quick action:', err);
    }
  }, []);

  return {
    dashboardData,
    loading,
    error,
    handleQuickAction,
    refetch: fetchData,
  };
};

export default useDashboard;
