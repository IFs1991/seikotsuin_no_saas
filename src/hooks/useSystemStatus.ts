'use client';

import { useState, useEffect } from 'react';

export interface SystemStatus {
  activeClinicCount: number;
  systemStatus: 'operational' | 'degraded' | 'outage';
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
 * - アクティブ店舗数を /api/clinics から取得（認証あり）
 * - ヘルスチェックを /api/health から取得
 * - 未認証時は clinicCount = 0 のフォールバック
 */
export function useSystemStatus(): UseSystemStatusResult {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      fetch('/api/clinics')
        .then(r => r.json())
        .catch(() => null),
      fetch('/api/health')
        .then(r => r.json())
        .catch(() => null),
    ])
      .then(([clinicsResult, healthResult]) => {
        const activeClinicCount =
          clinicsResult?.success === true
            ? (clinicsResult.data.items as unknown[]).length
            : 0;

        const systemStatus: SystemStatus['systemStatus'] =
          healthResult?.ok === true ? 'operational' : 'degraded';

        setStatus({
          activeClinicCount,
          systemStatus,
          aiAnalysisStatus: 'active',
          lastUpdated: new Date().toISOString(),
        });
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => setLoading(false));
  }, []);

  return { status, loading, error };
}
