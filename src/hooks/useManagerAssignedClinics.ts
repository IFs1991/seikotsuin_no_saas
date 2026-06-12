'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  handleApiError,
  isErrorResponse,
  isSuccessResponse,
} from '@/lib/api-client';
import type { ManagerAssignedClinicsResponse } from '@/types/manager-assigned-clinics';

export type UseManagerAssignedClinicsResult = {
  data: ManagerAssignedClinicsResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

const MANAGER_ASSIGNED_CLINICS_ERROR =
  '担当院一覧の取得に失敗しました。時間をおいて再度お試しください。';

export function useManagerAssignedClinics(): UseManagerAssignedClinicsResult {
  const [data, setData] = useState<ManagerAssignedClinicsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadAssignedClinics = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isCurrentRequest = () => requestIdRef.current === requestId;

    try {
      setLoading(true);
      setError(null);

      const response = await api.managerAssignedClinics.get();

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
          handleApiError(response.error, MANAGER_ASSIGNED_CLINICS_ERROR)
        );
        setData(null);
        return;
      }

      if (!isCurrentRequest()) {
        return;
      }
      setError(MANAGER_ASSIGNED_CLINICS_ERROR);
      setData(null);
    } catch {
      if (!isCurrentRequest()) {
        return;
      }
      setError(MANAGER_ASSIGNED_CLINICS_ERROR);
      setData(null);
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadAssignedClinics();
  }, [loadAssignedClinics]);

  return {
    data,
    loading,
    error,
    refetch: loadAssignedClinics,
  };
}
