'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ManagerStaffAnalysisCompareMode,
  ManagerStaffAnalysisResponse,
  ManagerStaffAnalysisTarget,
} from '@/types/manager-staff-analysis';
import type { ManagerAnalysisPeriodType } from '@/lib/manager-analysis-period';

export type UseManagerStaffAnalysisParams = {
  target: ManagerStaffAnalysisTarget;
  clinicId: string | null;
  period: ManagerAnalysisPeriodType;
  startDate: string | null;
  endDate: string | null;
  compare: ManagerStaffAnalysisCompareMode;
};

export type UseManagerStaffAnalysisResult = {
  data: ManagerStaffAnalysisResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

function buildQuery(params: UseManagerStaffAnalysisParams): string {
  const searchParams = new URLSearchParams();
  searchParams.set('target', params.target);
  searchParams.set('period', params.period);
  searchParams.set('compare', params.compare);

  if (params.target === 'clinic' && params.clinicId) {
    searchParams.set('clinic_id', params.clinicId);
  }
  if (params.period === 'custom' && params.startDate && params.endDate) {
    searchParams.set('start_date', params.startDate);
    searchParams.set('end_date', params.endDate);
  }

  return searchParams.toString();
}

function readErrorMessage(value: unknown): string | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'string'
  ) {
    return value.error;
  }

  return null;
}

function isManagerStaffAnalysisResponse(
  value: unknown
): value is ManagerStaffAnalysisResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'generatedAt' in value &&
    typeof value.generatedAt === 'string' &&
    'summary' in value &&
    'scope' in value &&
    'staff' in value &&
    Array.isArray(value.staff) &&
    'disclaimers' in value &&
    Array.isArray(value.disclaimers)
  );
}

function unwrapResponse(value: unknown): ManagerStaffAnalysisResponse | null {
  if (isManagerStaffAnalysisResponse(value)) {
    return value;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    isManagerStaffAnalysisResponse(value.data)
  ) {
    return value.data;
  }

  return null;
}

export function useManagerStaffAnalysis(
  params: UseManagerStaffAnalysisParams
): UseManagerStaffAnalysisResult {
  const [data, setData] = useState<ManagerStaffAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const query = useMemo(() => buildQuery(params), [params]);

  const refetch = useCallback(() => {
    setReloadKey(key => key + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/manager/staff-analysis?${query}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as unknown;

        if (!response.ok) {
          const message =
            readErrorMessage(body) ?? 'スタッフ分析データの取得に失敗しました';
          setError(message);
          setData(null);
          return;
        }

        const nextData = unwrapResponse(body);
        if (!nextData) {
          setError('スタッフ分析データの形式が正しくありません');
          setData(null);
          return;
        }

        setData(nextData);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') {
          return;
        }

        setError('スタッフ分析データの取得に失敗しました');
        setData(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void fetchData();

    return () => {
      controller.abort();
    };
  }, [query, reloadKey]);

  return {
    data,
    loading,
    error,
    refetch,
  };
}
