'use client';

import { useQuery } from '@tanstack/react-query';
import {
  api,
  isSuccessResponse,
  type DailyReportsListData,
} from '@/lib/api-client';
import { queryKeys } from '@/providers/query-provider';

export interface DailyReportsQueryParams {
  clinicId: string | null;
  startDate?: string | null;
  endDate?: string | null;
  initialData?: DailyReportsListData;
  enabled?: boolean;
}

export function useDailyReportsQuery({
  clinicId,
  startDate = null,
  endDate = null,
  initialData,
  enabled = true,
}: DailyReportsQueryParams) {
  return useQuery({
    queryKey: queryKeys.dailyReports.list(clinicId ?? 'unassigned', {
      startDate,
      endDate,
    }),
    enabled: Boolean(clinicId) && enabled,
    initialData,
    staleTime: 60_000,
    queryFn: async (): Promise<DailyReportsListData> => {
      if (!clinicId) {
        throw new Error('clinic_id is required');
      }

      const response = await api.dailyReports.get(
        clinicId,
        startDate ?? undefined,
        endDate ?? undefined
      );

      if (isSuccessResponse(response)) {
        return response.data;
      }

      throw new Error('日報データの取得に失敗しました');
    },
  });
}
