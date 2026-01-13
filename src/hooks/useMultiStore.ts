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

type SortDirection = 'asc' | 'desc';

export function useMultiStore() {
  const [clinics, setClinics] = useState<ClinicWithKPI[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClinicsWithKPI = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('include_kpi', 'true');

      const response = await fetch(
        `${API_ENDPOINTS.ADMIN.TENANTS}?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || ERROR_MESSAGES.SERVER_ERROR);
      }

      setClinics(result.data?.items ?? []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : ERROR_MESSAGES.NETWORK_ERROR;
      setError(message);
      console.error('Failed to fetch clinics with KPI', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const sortByRevenue = useCallback((direction: SortDirection) => {
    setClinics((prev) =>
      [...prev].sort((a, b) => {
        const aRevenue = a.kpi?.revenue ?? 0;
        const bRevenue = b.kpi?.revenue ?? 0;
        return direction === 'desc' ? bRevenue - aRevenue : aRevenue - bRevenue;
      })
    );
  }, []);

  const sortByPatients = useCallback((direction: SortDirection) => {
    setClinics((prev) =>
      [...prev].sort((a, b) => {
        const aPatients = a.kpi?.patients ?? 0;
        const bPatients = b.kpi?.patients ?? 0;
        return direction === 'desc'
          ? bPatients - aPatients
          : aPatients - bPatients;
      })
    );
  }, []);

  const sortByPerformance = useCallback((direction: SortDirection) => {
    setClinics((prev) =>
      [...prev].sort((a, b) => {
        const aScore = a.kpi?.staff_performance_score ?? 0;
        const bScore = b.kpi?.staff_performance_score ?? 0;
        return direction === 'desc' ? bScore - aScore : aScore - bScore;
      })
    );
  }, []);

  const totalRevenue = useMemo(() => {
    return clinics.reduce((sum, clinic) => sum + (clinic.kpi?.revenue ?? 0), 0);
  }, [clinics]);

  const totalPatients = useMemo(() => {
    return clinics.reduce(
      (sum, clinic) => sum + (clinic.kpi?.patients ?? 0),
      0
    );
  }, [clinics]);

  const averagePerformanceScore = useMemo(() => {
    const scores = clinics
      .map((c) => c.kpi?.staff_performance_score)
      .filter((s): s is number => s !== null && s !== undefined);
    if (scores.length === 0) return null;
    return scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }, [clinics]);

  return {
    clinics,
    loading,
    error,
    fetchClinicsWithKPI,
    sortByRevenue,
    sortByPatients,
    sortByPerformance,
    totalRevenue,
    totalPatients,
    averagePerformanceScore,
  };
}

export default useMultiStore;
