'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  handleApiError,
  isErrorResponse,
  isSuccessResponse,
} from '@/lib/api-client';
import type {
  ManagerPatientAnalysisPeriodType,
  ManagerPatientAnalysisResponse,
} from '@/lib/manager-patient-analysis';

export type UseManagerPatientAnalysisResult = {
  data: ManagerPatientAnalysisResponse | null;
  loading: boolean;
  error: string | null;
  selectedClinicId: string | null;
  setSelectedClinicId: (clinicId: string | null) => void;
  refetch: () => Promise<void>;
};

const MANAGER_PATIENT_ANALYSIS_ERROR =
  '患者分析の取得に失敗しました。時間をおいて再度お試しください。';

export function useManagerPatientAnalysis(
  params: {
    period?: ManagerPatientAnalysisPeriodType;
  } = {}
): UseManagerPatientAnalysisResult {
  const [data, setData] = useState<ManagerPatientAnalysisResponse | null>(null);
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

      const response = await api.managerPatients.getAnalysis({
        ...(requestedClinicId ? { clinicId: requestedClinicId } : {}),
        ...(params.period ? { period: params.period } : {}),
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
          handleApiError(response.error, MANAGER_PATIENT_ANALYSIS_ERROR)
        );
        setData(null);
        return;
      }

      if (!isCurrentRequest()) {
        return;
      }
      setError(MANAGER_PATIENT_ANALYSIS_ERROR);
      setData(null);
    } catch (fetchError) {
      if (!isCurrentRequest()) {
        return;
      }
      console.warn('useManagerPatientAnalysis fetch error:', fetchError);
      setError(MANAGER_PATIENT_ANALYSIS_ERROR);
      setData(null);
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, [params.period, requestedClinicId]);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  const selectedClinicId = useMemo(
    () => requestedClinicId ?? data?.selectedClinic?.clinicId ?? null,
    [data?.selectedClinic?.clinicId, requestedClinicId]
  );

  return {
    data,
    loading,
    error,
    selectedClinicId,
    setSelectedClinicId: setRequestedClinicId,
    refetch: loadAnalysis,
  };
}
