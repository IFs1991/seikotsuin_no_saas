'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, isSuccessResponse } from '@/lib/api-client';
import { canAccessAdminUIWithCompat } from '@/lib/constants/roles';
import type { RevenueEstimateAmountDetail } from '@/types/api';

interface UseRevenueEstimateDetailsOptions {
  enabled?: boolean;
  period?: string;
}

interface UseRevenueEstimateDetailsReturn {
  details: RevenueEstimateAmountDetail[];
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: UseRevenueEstimateDetailsReturn = {
  details: [],
  loading: false,
  error: null,
};

export function useRevenueEstimateDetails(
  clinicId: string,
  role: string | null | undefined,
  options: UseRevenueEstimateDetailsOptions = {}
): UseRevenueEstimateDetailsReturn {
  const [details, setDetails] = useState<RevenueEstimateAmountDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const enabled = options.enabled ?? true;
  const canFetchDetails = enabled && canAccessAdminUIWithCompat(role);

  const fetchDetails = useCallback(async () => {
    if (!canFetchDetails || !clinicId) {
      setDetails(INITIAL_STATE.details);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = options.period
        ? await api.revenueEstimates.getDetails(clinicId, options.period)
        : await api.revenueEstimates.getDetails(clinicId);

      if (!isMountedRef.current) {
        return;
      }

      if (isSuccessResponse(response)) {
        setDetails(response.data.details);
      } else {
        setDetails([]);
        setError(
          response.error?.message || '療養費見込み詳細の取得に失敗しました'
        );
      }
    } catch {
      if (isMountedRef.current) {
        setDetails([]);
        setError('療養費見込み詳細の取得に失敗しました');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [canFetchDetails, clinicId, options.period]);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchDetails();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchDetails]);

  return { details, loading, error };
}
