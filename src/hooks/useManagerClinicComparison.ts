'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  handleApiError,
  isErrorResponse,
  isSuccessResponse,
} from '@/lib/api-client';
import type { ManagerAnalysisPeriodType } from '@/lib/manager-analysis-period';
import type {
  ManagerClinicComparisonCompareMode,
  ManagerClinicComparisonResponse,
} from '@/types/manager-clinic-comparison';

export type UseManagerClinicComparisonResult = {
  data: ManagerClinicComparisonResponse | null;
  loading: boolean;
  error: string | null;
  period: ManagerAnalysisPeriodType;
  setPeriod: (period: ManagerAnalysisPeriodType) => void;
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
  compare: ManagerClinicComparisonCompareMode;
  setCompare: (compare: ManagerClinicComparisonCompareMode) => void;
  refetch: () => Promise<void>;
};

const MANAGER_CLINIC_COMPARISON_ERROR =
  '担当院比較分析の取得に失敗しました。時間をおいて再度お試しください。';

export function useManagerClinicComparison(): UseManagerClinicComparisonResult {
  const [data, setData] = useState<ManagerClinicComparisonResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<ManagerAnalysisPeriodType>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [compare, setCompare] =
    useState<ManagerClinicComparisonCompareMode>('previous_period');
  const requestIdRef = useRef(0);

  const loadComparison = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isCurrentRequest = () => requestIdRef.current === requestId;

    try {
      setLoading(true);
      setError(null);

      const response = await api.managerClinicComparison.get({
        period,
        ...(period === 'custom' ? { startDate, endDate } : {}),
        compare,
      });

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
        setError(
          handleApiError(response.error, MANAGER_CLINIC_COMPARISON_ERROR)
        );
        setData(null);
        return;
      }

      if (!isCurrentRequest()) {
        return;
      }
      setError(MANAGER_CLINIC_COMPARISON_ERROR);
      setData(null);
    } catch {
      if (!isCurrentRequest()) {
        return;
      }
      setError(MANAGER_CLINIC_COMPARISON_ERROR);
      setData(null);
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, [compare, endDate, period, startDate]);

  useEffect(() => {
    void loadComparison();
  }, [loadComparison]);

  return {
    data,
    loading,
    error,
    period,
    setPeriod,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    compare,
    setCompare,
    refetch: loadComparison,
  };
}
