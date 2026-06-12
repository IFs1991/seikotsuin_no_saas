'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useManagerAssignedClinics } from '@/hooks/useManagerAssignedClinics';
import {
  api,
  handleApiError,
  isErrorResponse,
  isSuccessResponse,
} from '@/lib/api-client';
import type {
  ManagerShiftRequest,
  ManagerShiftRequestMessage,
  ManagerShiftRequestPeriod,
} from '@/types/manager-shift-requests';

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  error: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type UseManagerShiftRequestsResult = {
  clinics: { id: string; name: string }[];
  staffNameById: ReadonlyMap<string, string>;
  periods: ManagerShiftRequestPeriod[];
  requests: ManagerShiftRequest[];
  selectedClinicId: string;
  selectedPeriodId: string;
  rejectionReasons: Record<string, string>;
  selectedRequestIds: string[];
  loading: boolean;
  message: ManagerShiftRequestMessage | null;
  setSelectedClinicId: (clinicId: string) => void;
  setSelectedPeriodId: (periodId: string) => void;
  setRejectionReason: (requestId: string, reason: string) => void;
  toggleRequestSelection: (requestId: string) => void;
  approveRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  convertSelectedRequests: () => Promise<void>;
  refetch: () => Promise<void>;
};

const MANAGER_SHIFT_STAFF_ERROR =
  '担当院スタッフ一覧の取得に失敗しました。時間をおいて再度お試しください。';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as ApiResponse<T>;
  if (payload.success === false) {
    throw new Error(payload.error);
  }
  return payload.data;
}

function canConvert(request: ManagerShiftRequest): boolean {
  return request.status === 'approved';
}

export function useManagerShiftRequests(): UseManagerShiftRequestsResult {
  const assignedClinics = useManagerAssignedClinics();
  const [selectedClinicId, setSelectedClinicId] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [periods, setPeriods] = useState<ManagerShiftRequestPeriod[]>([]);
  const [requests, setRequests] = useState<ManagerShiftRequest[]>([]);
  const [staffNameById, setStaffNameById] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
  const [rejectionReasons, setRejectionReasons] = useState<
    Record<string, string>
  >({});
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<ManagerShiftRequestMessage | null>(
    null
  );
  const selectedPeriodIdRef = useRef('');
  const clinicLoadIdRef = useRef(0);
  const requestLoadIdRef = useRef(0);

  const clinicsData = assignedClinics.data?.clinics;
  const clinics = useMemo(() => clinicsData ?? [], [clinicsData]);
  const requestById = useMemo(
    () => new Map(requests.map(request => [request.id, request])),
    [requests]
  );

  useEffect(() => {
    if (!selectedClinicId && clinics[0]) {
      setSelectedClinicId(clinics[0].id);
    }
  }, [clinics, selectedClinicId]);

  useEffect(() => {
    selectedPeriodIdRef.current = selectedPeriodId;
  }, [selectedPeriodId]);

  const loadPeriods = useCallback(
    async (clinicId: string): Promise<ManagerShiftRequestPeriod[]> => {
      const params = new URLSearchParams({ clinic_id: clinicId });
      const data = await requestJson<{
        periods: ManagerShiftRequestPeriod[];
        total: number;
      }>(`/api/staff/shift-request-periods?${params.toString()}`);
      return data.periods;
    },
    []
  );

  const loadRequests = useCallback(
    async (
      clinicId: string,
      periodId: string
    ): Promise<ManagerShiftRequest[]> => {
      const params = new URLSearchParams({
        clinic_id: clinicId,
        period_id: periodId,
      });
      const data = await requestJson<{
        requests: ManagerShiftRequest[];
        total: number;
      }>(`/api/staff/shift-requests?${params.toString()}`);
      return data.requests;
    },
    []
  );

  const loadStaffNameMap = useCallback(async (clinicId: string) => {
    const response = await api.managerStaff.get({ clinicId });

    if (isSuccessResponse(response)) {
      return new Map(
        response.data.staff.map(staff => [staff.staffId, staff.staffName])
      );
    }

    if (isErrorResponse(response)) {
      throw new Error(
        handleApiError(response.error, MANAGER_SHIFT_STAFF_ERROR)
      );
    }

    throw new Error(MANAGER_SHIFT_STAFF_ERROR);
  }, []);

  const reloadRequests = useCallback(async () => {
    const requestLoadId = requestLoadIdRef.current + 1;
    requestLoadIdRef.current = requestLoadId;
    const isCurrentRequest = () => requestLoadIdRef.current === requestLoadId;

    if (!selectedClinicId || !selectedPeriodId) {
      setRequests([]);
      setSelectedRequestIds([]);
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const nextRequests = await loadRequests(
        selectedClinicId,
        selectedPeriodId
      );
      if (!isCurrentRequest()) {
        return;
      }
      setRequests(nextRequests);
      const nextRequestIds = new Set(nextRequests.map(request => request.id));
      setSelectedRequestIds(current =>
        current.filter(requestId => nextRequestIds.has(requestId))
      );
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : '希望シフトの取得に失敗しました',
      });
      setRequests([]);
      setSelectedRequestIds([]);
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, [loadRequests, selectedClinicId, selectedPeriodId]);

  const refetch = useCallback(async () => {
    const clinicLoadId = clinicLoadIdRef.current + 1;
    clinicLoadIdRef.current = clinicLoadId;
    const isCurrentRequest = () => clinicLoadIdRef.current === clinicLoadId;

    if (!selectedClinicId) {
      setPeriods([]);
      setRequests([]);
      setStaffNameById(new Map());
      setSelectedRequestIds([]);
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const [nextPeriods, nextStaffNameById] = await Promise.all([
        loadPeriods(selectedClinicId),
        loadStaffNameMap(selectedClinicId),
      ]);
      if (!isCurrentRequest()) {
        return;
      }
      setPeriods(nextPeriods);
      setStaffNameById(nextStaffNameById);
      const currentPeriodId = selectedPeriodIdRef.current;
      const nextPeriodId =
        currentPeriodId &&
        nextPeriods.some(period => period.id === currentPeriodId)
          ? currentPeriodId
          : (nextPeriods.find(period => period.status === 'open')?.id ??
            nextPeriods[0]?.id ??
            '');

      if (!nextPeriodId) {
        setSelectedPeriodId('');
        setRequests([]);
        setSelectedRequestIds([]);
        return;
      }

      if (nextPeriodId !== currentPeriodId) {
        setSelectedPeriodId(nextPeriodId);
        setRequests([]);
        setSelectedRequestIds([]);
        return;
      }

      const nextRequests = await loadRequests(selectedClinicId, nextPeriodId);
      if (!isCurrentRequest()) {
        return;
      }
      setRequests(nextRequests);
      const nextRequestIds = new Set(nextRequests.map(request => request.id));
      setSelectedRequestIds(current =>
        current.filter(requestId => nextRequestIds.has(requestId))
      );
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : '希望シフトの取得に失敗しました',
      });
      setPeriods([]);
      setRequests([]);
      setStaffNameById(new Map());
      setSelectedRequestIds([]);
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, [loadPeriods, loadRequests, loadStaffNameMap, selectedClinicId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    void reloadRequests();
  }, [reloadRequests]);

  function setRejectionReason(requestId: string, reason: string) {
    setRejectionReasons(current => ({ ...current, [requestId]: reason }));
  }

  function toggleRequestSelection(requestId: string) {
    setSelectedRequestIds(current =>
      current.includes(requestId)
        ? current.filter(id => id !== requestId)
        : [...current, requestId]
    );
  }

  const updateRequestStatus = useCallback(
    async (requestId: string, status: 'approved' | 'rejected') => {
      if (!selectedClinicId) {
        return;
      }
      const rejectionReason = rejectionReasons[requestId]?.trim() ?? '';
      if (status === 'rejected' && rejectionReason.length === 0) {
        setMessage({ type: 'error', text: '却下理由を入力してください。' });
        return;
      }

      setLoading(true);
      setMessage(null);
      try {
        const updated = await requestJson<ManagerShiftRequest>(
          `/api/staff/shift-requests/${requestId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clinic_id: selectedClinicId,
              status,
              rejection_reason:
                status === 'rejected' ? rejectionReason : undefined,
            }),
          }
        );
        // 一覧の再取得は行わず、PATCH レスポンスの行で局所更新する
        setRequests(current =>
          current.map(request =>
            request.id === updated.id ? updated : request
          )
        );
        setMessage({
          type: 'success',
          text: status === 'approved' ? '承認しました。' : '却下しました。',
        });
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : '更新に失敗しました',
        });
      } finally {
        setLoading(false);
      }
    },
    [rejectionReasons, selectedClinicId]
  );

  const convertSelectedRequests = useCallback(async () => {
    if (!selectedClinicId || !selectedPeriodId) {
      return;
    }
    const convertibleIds = selectedRequestIds.filter(requestId => {
      const request = requestById.get(requestId);
      return request ? canConvert(request) : false;
    });
    if (convertibleIds.length === 0) {
      setMessage({ type: 'error', text: '変換対象を選択してください。' });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await requestJson<{ conversions: unknown[]; total: number }>(
        '/api/staff/shift-requests/convert',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinic_id: selectedClinicId,
            period_id: selectedPeriodId,
            request_ids: convertibleIds,
            mode: 'selected',
          }),
        }
      );
      setSelectedRequestIds([]);
      await reloadRequests();
      setMessage({ type: 'success', text: 'シフトに変換しました。' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '変換に失敗しました',
      });
    } finally {
      setLoading(false);
    }
  }, [
    reloadRequests,
    requestById,
    selectedClinicId,
    selectedPeriodId,
    selectedRequestIds,
  ]);

  return {
    clinics,
    staffNameById,
    periods,
    requests,
    selectedClinicId,
    selectedPeriodId,
    rejectionReasons,
    selectedRequestIds,
    loading: loading || assignedClinics.loading,
    message,
    setSelectedClinicId,
    setSelectedPeriodId,
    setRejectionReason,
    toggleRequestSelection,
    approveRequest: requestId => updateRequestStatus(requestId, 'approved'),
    rejectRequest: requestId => updateRequestStatus(requestId, 'rejected'),
    convertSelectedRequests,
    refetch,
  };
}
