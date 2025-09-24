'use client';

import { useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  fetchAdminDashboard,
  type AggregatedClinicData,
  type AdminDashboardPayload,
} from '@/lib/api/admin/dashboard-client';

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
  const queryClient = useQueryClient();
  const [sort, setSortState] = useState<SortState>({
    sortBy: 'totalRevenue',
    order: 'desc',
  });
  const [clinicFilter, setClinicFilter] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin-dashboard', clinicFilter ?? 'all'],
    queryFn: () =>
      fetchAdminDashboard(
        clinicFilter ? { clinic_id: clinicFilter } : undefined
      ),
  });

  const clinicsData = query.data?.clinicsData ?? [];

  const sortedData = useMemo(() => {
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
  }, [clinicsData, sort]);

  const refreshMutation = useMutation({
    mutationFn: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['admin-dashboard'],
      });
      await query.refetch();
    },
  });

  return {
    clinicsData: sortedData,
    overallKpis: query.data?.overallKpis ?? null,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    setSort: (sortBy, order) => setSortState({ sortBy, order }),
    setClinicFilter,
    refreshData: () => refreshMutation.mutateAsync(),
    isRefreshing: query.isFetching || refreshMutation.isPending,
  };
}
