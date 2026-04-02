'use client';

import { useState, useEffect } from 'react';
import {
  api,
  handleApiError,
  isErrorResponse,
  isSuccessResponse,
} from '@/lib/api-client';

export interface SystemStatus {
  activeClinicCount: number;
  systemStatus: 'operational' | 'degraded' | 'maintenance';
  aiAnalysisStatus: 'active' | 'inactive';
  lastUpdated: string;
}

interface UseSystemStatusResult {
  status: SystemStatus | null;
  loading: boolean;
  error: string | null;
}

/**
 * システム状態を取得するカスタムフック
 * /api/system/status から店舗数・システム状態・AI分析状態を一括取得する
 */
export function useSystemStatus(): UseSystemStatusResult {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadStatus() {
      setLoading(true);
      setError(null);

      try {
        const response = await api.system.getStatus();
        if (!isMounted) {
          return;
        }

        if (isSuccessResponse(response)) {
          setStatus(response.data);
          return;
        }

        if (isErrorResponse(response)) {
          setStatus(null);
          setError(
            handleApiError(response.error, 'システム状態の取得に失敗しました')
          );
          return;
        }

        setStatus(null);
        setError('システム状態の取得に失敗しました');
      } catch (err) {
        if (!isMounted) {
          return;
        }

        setStatus(null);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  return { status, loading, error };
}
