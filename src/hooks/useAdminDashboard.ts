'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AdminDashboardRequestError,
  fetchAdminDashboard,
} from '@/lib/api/admin/dashboard-client';
import type {
  AggregatedClinicData,
  AdminDashboardPayload,
} from '@/lib/admin/dashboard';

interface SortState {
  sortBy: keyof AggregatedClinicData | 'name';
  order: 'asc' | 'desc';
}

interface UseAdminDashboardReturn {
  clinicsData: AggregatedClinicData[];
  overallKpis: AdminDashboardPayload['overallKpis'] | null;
  loading: boolean;
  error: string | null;
  setSort: (sortBy: SortState['sortBy'], order: SortState['order']) => void;
  setClinicFilter: (clinicId: string | null) => void;
  refreshData: () => Promise<void>;
  isRefreshing: boolean;
}

export default function useAdminDashboard(): UseAdminDashboardReturn {
  const [sort, setSortState] = useState<SortState>({
    sortBy: 'averagePerformanceScore',
    order: 'desc',
  });
  const [clinicFilter, setClinicFilter] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin-dashboard', clinicFilter ?? 'all'],
    queryFn: ({ signal }) =>
      fetchAdminDashboard(
        clinicFilter ? { clinic_id: clinicFilter } : undefined,
        signal
      ),
    placeholderData: previousData => previousData,
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (
        error instanceof AdminDashboardRequestError &&
        (error.status === 401 || error.status === 403 || error.status === 404)
      ) {
        return false;
      }

      return failureCount < 2;
    },
  });

  const sortedData = useMemo(() => {
    const clinicsData = query.data?.clinicsData ?? [];
    const dataCopy = [...clinicsData];
    dataCopy.sort((a, b) => {
      const valueA = a[sort.sortBy as keyof AggregatedClinicData];
      const valueB = b[sort.sortBy as keyof AggregatedClinicData];

      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return sort.order === 'asc' ? valueA - valueB : valueB - valueA;
      }

      const stringA = String(valueA);
      const stringB = String(valueB);
      return sort.order === 'asc'
        ? stringA.localeCompare(stringB)
        : stringB.localeCompare(stringA);
    });
    return dataCopy;
  }, [query.data?.clinicsData, sort]);

  return {
    clinicsData: sortedData,
    overallKpis: query.data?.overallKpis ?? null,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    setSort: (sortBy, order) => setSortState({ sortBy, order }),
    setClinicFilter,
    refreshData: async () => {
      await query.refetch();
    },
    isRefreshing: query.isRefetching,
  };
}
