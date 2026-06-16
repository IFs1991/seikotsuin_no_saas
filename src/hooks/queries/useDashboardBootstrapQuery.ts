'use client';

import { useQuery } from '@tanstack/react-query';

import {
  api,
  isSuccessResponse,
  type DashboardBootstrapData,
} from '@/lib/api-client';
import { queryKeys } from '@/providers/query-provider';

export interface DashboardBootstrapQueryParams {
  clinicId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  enabled?: boolean;
}

export function useDashboardBootstrapQuery({
  clinicId = null,
  startDate = null,
  endDate = null,
  enabled = true,
}: DashboardBootstrapQueryParams = {}) {
  return useQuery({
    queryKey: queryKeys.dashboardBootstrap.detail(clinicId, {
      startDate,
      endDate,
    }),
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<DashboardBootstrapData> => {
      const response = await api.dashboardBootstrap.get({
        clinicId,
        startDate,
        endDate,
      });

      if (isSuccessResponse(response)) {
        return response.data;
      }

      throw new Error('初期表示データの取得に失敗しました');
    },
  });
}
