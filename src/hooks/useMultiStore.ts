'use client';

import { useCallback, useMemo, useState } from 'react';
import { API_ENDPOINTS, ERROR_MESSAGES } from '@/lib/constants';

export interface ClinicKPI {
  revenue: number;
  patients: number;
  staff_performance_score: number | null;
}

export interface ClinicWithKPI {
  id: string;
  name: string;
  address?: string | null;
  phone_number?: string | null;
  is_active: boolean;
  created_at?: string | null;
  kpi?: ClinicKPI;
}

export type SortDirection = 'asc' | 'desc';
export type SortField = 'revenue' | 'patients' | 'performance';

interface MultiStoreApiResponse {
  success: boolean;
  error?: string;
  data?: {
    items?: ClinicWithKPI[];
  };
}

interface MultiStoreMetrics {
  totalRevenue: number;
  totalPatients: number;
  averagePerformanceScore: number | null;
}

const getSortValue = (clinic: ClinicWithKPI, field: SortField): number => {
  if (field === 'revenue') return clinic.kpi?.revenue ?? 0;
  if (field === 'patients') return clinic.kpi?.patients ?? 0;
  return clinic.kpi?.staff_performance_score ?? 0;
};

const MULTI_STORE_KPI_URL = `${API_ENDPOINTS.ADMIN.TENANTS}?include_kpi=true`;

const isAbortError = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'AbortError';

const sortClinics = (
  clinics: readonly ClinicWithKPI[],
  field: SortField,
  direction: SortDirection
): ClinicWithKPI[] => {
  return [...clinics].sort((a, b) => {
    const diff = getSortValue(a, field) - getSortValue(b, field);
    return direction === 'desc' ? -diff : diff;
  });
};

const calculateMetrics = (
  clinics: readonly ClinicWithKPI[]
): MultiStoreMetrics => {
  let totalRevenue = 0;
  let totalPatients = 0;
  let scoreTotal = 0;
  let scoreCount = 0;

  for (const clinic of clinics) {
    totalRevenue += clinic.kpi?.revenue ?? 0;
    totalPatients += clinic.kpi?.patients ?? 0;

    const score = clinic.kpi?.staff_performance_score;
    if (score !== null && score !== undefined) {
      scoreTotal += score;
      scoreCount += 1;
    }
  }

  return {
    totalRevenue,
    totalPatients,
    averagePerformanceScore: scoreCount > 0 ? scoreTotal / scoreCount : null,
  };
};

export function useMultiStore() {
  const [clinics, setClinics] = useState<ClinicWithKPI[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClinicsWithKPI = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(MULTI_STORE_KPI_URL, {
        method: 'GET',
        signal,
        headers: {
          Accept: 'application/json',
        },
      });
      const result = (await response.json()) as MultiStoreApiResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error || ERROR_MESSAGES.SERVER_ERROR);
      }

      setClinics(result.data?.items ?? []);
    } catch (err) {
      if (isAbortError(err)) return;

      const message =
        err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
      setError(message);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setHasLoaded(true);
      }
    }
  }, []);

  const sortByRevenue = useCallback((direction: SortDirection) => {
    setClinics(prev => sortClinics(prev, 'revenue', direction));
  }, []);

  const sortByPatients = useCallback((direction: SortDirection) => {
    setClinics(prev => sortClinics(prev, 'patients', direction));
  }, []);

  const sortByPerformance = useCallback((direction: SortDirection) => {
    setClinics(prev => sortClinics(prev, 'performance', direction));
  }, []);

  const metrics = useMemo(() => calculateMetrics(clinics), [clinics]);

  return {
    clinics,
    loading,
    hasLoaded,
    error,
    fetchClinicsWithKPI,
    sortByRevenue,
    sortByPatients,
    sortByPerformance,
    totalRevenue: metrics.totalRevenue,
    totalPatients: metrics.totalPatients,
    averagePerformanceScore: metrics.averagePerformanceScore,
  };
}

export default useMultiStore;
