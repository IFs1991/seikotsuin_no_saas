'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  handleApiError,
  isErrorResponse,
  isSuccessResponse,
} from '@/lib/api-client';
import type {
  ManagerRevenueAnalysisPeriodType,
  ManagerRevenueAnalysisResponse,
  ManagerRevenueAnalysisTarget,
  ManagerRevenueCompareMode,
} from '@/lib/manager-revenue-analysis';

export type UseManagerRevenueAnalysisResult = {
  data: ManagerRevenueAnalysisResponse | null;
  loading: boolean;
  error: string | null;
  selectedClinicId: string | null;
  setSelectedClinicId: (clinicId: string | null) => void;
  refetch: () => Promise<void>;
};

const MANAGER_REVENUE_ANALYSIS_ERROR =
  '収益分析の取得に失敗しました。時間をおいて再度お試しください。';

export function useManagerRevenueAnalysis(
  params: {
    target?: ManagerRevenueAnalysisTarget;
    period?: ManagerRevenueAnalysisPeriodType;
    startDate?: string | null;
    endDate?: string | null;
    compare?: ManagerRevenueCompareMode;
  } = {}
): UseManagerRevenueAnalysisResult {
  const [data, setData] = useState<ManagerRevenueAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestedClinicId, setRequestedClinicId] = useState<string | null>(
    null
  );
  const requestIdRef = useRef(0);

  const loadAnalysis = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isCurrentRequest = () => requestIdRef.current === requestId;

    try {
      setLoading(true);
      setError(null);

      const response = await api.managerRevenue.getAnalysis({
        ...(requestedClinicId ? { clinicId: requestedClinicId } : {}),
        ...(params.target ? { target: params.target } : {}),
        ...(params.period ? { period: params.period } : {}),
        ...(params.startDate ? { startDate: params.startDate } : {}),
        ...(params.endDate ? { endDate: params.endDate } : {}),
        ...(params.compare ? { compare: params.compare } : {}),
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
          handleApiError(response.error, MANAGER_REVENUE_ANALYSIS_ERROR)
        );
        setData(null);
        return;
      }

      if (!isCurrentRequest()) {
        return;
      }
      setError(MANAGER_REVENUE_ANALYSIS_ERROR);
      setData(null);
    } catch {
      if (!isCurrentRequest()) {
        return;
      }
      setError(MANAGER_REVENUE_ANALYSIS_ERROR);
      setData(null);
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, [
    params.compare,
    params.endDate,
    params.period,
    params.startDate,
    params.target,
    requestedClinicId,
  ]);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  const selectedClinicId =
    requestedClinicId ??
    data?.target.clinicId ??
    data?.assignedClinics[0]?.id ??
    null;

  return {
    data,
    loading,
    error,
    selectedClinicId,
    setSelectedClinicId: setRequestedClinicId,
    refetch: loadAnalysis,
  };
}
