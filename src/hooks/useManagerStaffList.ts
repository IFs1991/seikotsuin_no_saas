'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  handleApiError,
  isErrorResponse,
  isSuccessResponse,
} from '@/lib/api-client';
import type { ManagerStaffListResponse } from '@/types/manager-staff-list';

export type UseManagerStaffListResult = {
  data: ManagerStaffListResponse | null;
  loading: boolean;
  error: string | null;
  selectedClinicId: string;
  setSelectedClinicId: (clinicId: string) => void;
  refetch: () => Promise<void>;
};

const MANAGER_STAFF_LIST_ERROR =
  '担当院スタッフ一覧の取得に失敗しました。時間をおいて再度お試しください。';

export function useManagerStaffList(): UseManagerStaffListResult {
  const [data, setData] = useState<ManagerStaffListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClinicId, setSelectedClinicId] = useState('');
  const requestIdRef = useRef(0);

  const loadStaffList = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isCurrentRequest = () => requestIdRef.current === requestId;

    try {
      setLoading(true);
      setError(null);

      const response = await api.managerStaff.get({
        clinicId: selectedClinicId || null,
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
        setError(handleApiError(response.error, MANAGER_STAFF_LIST_ERROR));
        setData(null);
        return;
      }

      if (!isCurrentRequest()) {
        return;
      }
      setError(MANAGER_STAFF_LIST_ERROR);
      setData(null);
    } catch {
      if (!isCurrentRequest()) {
        return;
      }
      setError(MANAGER_STAFF_LIST_ERROR);
      setData(null);
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, [selectedClinicId]);

  useEffect(() => {
    void loadStaffList();
  }, [loadStaffList]);

  return {
    data,
    loading,
    error,
    selectedClinicId,
    setSelectedClinicId,
    refetch: loadStaffList,
  };
}
