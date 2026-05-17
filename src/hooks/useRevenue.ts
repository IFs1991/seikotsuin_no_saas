import { useState, useEffect, useCallback, useRef } from 'react';
import { api, isSuccessResponse } from '@/lib/api-client';
import type { RevenueAnalysisData } from '@/types/api';

interface MenuRanking {
  menu: string;
  revenue: number;
  count: number;
}

interface RevenueData {
  dailyRevenue: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
  insuranceRevenue: number;
  selfPayRevenue: number;
  trafficAccidentRevenue: number;
  workersCompRevenue: number;
  productRevenue: number;
  ticketRevenue: number;
  needsReviewCount: number;
  blockedCount: number;
  revenueContextSummary: RevenueAnalysisData['revenueContextSummary'];
  careEpisodeMetrics: RevenueAnalysisData['careEpisodeMetrics'];
  menuRanking: MenuRanking[];
  hourlyRevenue: string;
  dailyRevenueByDayOfWeek: string;
  lastYearRevenue: number;
  growthRate: string;
  revenueForecast: number;
  costAnalysis: string;
  staffRevenueContribution: string;
}

interface UseRevenueReturn extends RevenueData {
  loading: boolean;
  error: string | null;
}

type FetchOptions = {
  background?: boolean;
};

type UseRevenueOptions = {
  enabled?: boolean;
};

const INITIAL_DATA: RevenueData = {
  dailyRevenue: 0,
  weeklyRevenue: 0,
  monthlyRevenue: 0,
  insuranceRevenue: 0,
  selfPayRevenue: 0,
  trafficAccidentRevenue: 0,
  workersCompRevenue: 0,
  productRevenue: 0,
  ticketRevenue: 0,
  needsReviewCount: 0,
  blockedCount: 0,
  revenueContextSummary: [],
  careEpisodeMetrics: {
    totalEpisodes: 0,
    secondVisitReachedCount: 0,
    fifthVisitReachedCount: 0,
    secondVisitReachRate: 0,
    fifthVisitReachRate: 0,
    episodeContinuationRate: 0,
    averageRevenuePerEpisode: 0,
    averageVisitsPerEpisode: 0,
  },
  menuRanking: [],
  hourlyRevenue: '',
  dailyRevenueByDayOfWeek: '',
  lastYearRevenue: 0,
  growthRate: '0%',
  revenueForecast: 0,
  costAnalysis: '',
  staffRevenueContribution: '',
};

function mapMenuRanking(
  menuRanking: RevenueAnalysisData['menuRanking']
): MenuRanking[] {
  return menuRanking.map(menu => ({
    menu: menu.menu_name,
    revenue: Number(menu.total_revenue || 0),
    count: Number(menu.transaction_count || 0),
  }));
}

function summarizeHourlyRevenue(
  hourlyRevenue: RevenueAnalysisData['hourlyRevenue']
): string {
  return hourlyRevenue.length > 0
    ? `データ点: ${hourlyRevenue.length}件`
    : 'データなし';
}

function estimateLastYearRevenue(data: RevenueAnalysisData): number {
  if (!data.growthRate.endsWith('%')) {
    return 0;
  }

  const growthRate = Number.parseFloat(data.growthRate.replace('%', '')) / 100;
  if (Number.isNaN(growthRate) || growthRate === -1) {
    return 0;
  }

  return Math.round(data.monthlyRevenue / (1 + growthRate));
}

function sumNeedsReviewCount(
  summary: RevenueAnalysisData['revenueContextSummary']
): number {
  return summary.reduce((sum, item) => sum + item.needsReviewCount, 0);
}

function sumBlockedCount(
  summary: RevenueAnalysisData['revenueContextSummary']
): number {
  return summary.reduce((sum, item) => sum + item.blockedCount, 0);
}

export const useRevenue = (
  clinicId: string,
  options: UseRevenueOptions = {}
): UseRevenueReturn => {
  const [data, setData] = useState<RevenueData>(INITIAL_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const hasLoadedDataRef = useRef(false);
  const inFlightFetchRef = useRef<Promise<void> | null>(null);
  const lastClinicIdRef = useRef<string | null>(null);
  const enabled = options.enabled ?? true;

  const fetchData = useCallback(
    (options: FetchOptions = {}) => {
      if (!enabled) {
        setLoading(false);
        setError(null);
        setData(INITIAL_DATA);
        hasLoadedDataRef.current = false;
        inFlightFetchRef.current = null;
        lastClinicIdRef.current = null;
        return Promise.resolve();
      }

      if (!clinicId) {
        setLoading(false);
        setError('clinic_idは必須です');
        setData(INITIAL_DATA);
        hasLoadedDataRef.current = false;
        lastClinicIdRef.current = null;
        return Promise.resolve();
      }

      if (lastClinicIdRef.current !== clinicId) {
        lastClinicIdRef.current = clinicId;
        hasLoadedDataRef.current = false;
        inFlightFetchRef.current = null;
        setData(INITIAL_DATA);
      }

      if (inFlightFetchRef.current) {
        return inFlightFetchRef.current;
      }

      const shouldBlockPage = !options.background || !hasLoadedDataRef.current;
      const request = (async () => {
        try {
          if (shouldBlockPage) {
            setLoading(true);
          }
          setError(null);

          const res = await api.revenue.getAnalysis(clinicId);

          if (!isMountedRef.current) return;

          if (res && isSuccessResponse(res)) {
            const revenueData = res.data;
            const revenueContextSummary =
              revenueData.revenueContextSummary ?? [];

            setData({
              dailyRevenue: Number(revenueData.dailyRevenue || 0),
              weeklyRevenue: Number(revenueData.weeklyRevenue || 0),
              monthlyRevenue: Number(revenueData.monthlyRevenue || 0),
              insuranceRevenue: Number(revenueData.insuranceRevenue || 0),
              selfPayRevenue: Number(revenueData.selfPayRevenue || 0),
              trafficAccidentRevenue: Number(
                revenueData.trafficAccidentRevenue || 0
              ),
              workersCompRevenue: Number(revenueData.workersCompRevenue || 0),
              productRevenue: Number(revenueData.productRevenue || 0),
              ticketRevenue: Number(revenueData.ticketRevenue || 0),
              needsReviewCount: sumNeedsReviewCount(revenueContextSummary),
              blockedCount: sumBlockedCount(revenueContextSummary),
              revenueContextSummary,
              careEpisodeMetrics:
                revenueData.careEpisodeMetrics ??
                INITIAL_DATA.careEpisodeMetrics,
              menuRanking: mapMenuRanking(revenueData.menuRanking),
              hourlyRevenue: summarizeHourlyRevenue(revenueData.hourlyRevenue),
              dailyRevenueByDayOfWeek: '',
              lastYearRevenue: estimateLastYearRevenue(revenueData),
              growthRate: revenueData.growthRate || '0%',
              revenueForecast: Number(revenueData.revenueForecast || 0),
              costAnalysis: revenueData.costAnalysis || '',
              staffRevenueContribution: '',
            });
            hasLoadedDataRef.current = true;
          } else {
            // APIエラー時はサンプル値にフォールバックしない。
            const errorMessage =
              res?.error?.message || '収益データの取得に失敗しました';
            if (shouldBlockPage || !hasLoadedDataRef.current) {
              setError(errorMessage);
            }
            if (!hasLoadedDataRef.current) {
              setData(INITIAL_DATA);
            }
          }
        } catch {
          if (isMountedRef.current) {
            if (shouldBlockPage || !hasLoadedDataRef.current) {
              setError('収益データの取得に失敗しました');
            }
            if (!hasLoadedDataRef.current) {
              setData(INITIAL_DATA);
            }
          }
        } finally {
          if (isMountedRef.current && shouldBlockPage) {
            setLoading(false);
          }
          inFlightFetchRef.current = null;
        }
      })();

      inFlightFetchRef.current = request;
      return request;
    },
    [clinicId, enabled]
  );

  useEffect(() => {
    isMountedRef.current = true;
    void fetchData();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchData]);

  // 日報入力後に revenue ページへ戻ってきた / タブ復帰時に最新値を取得する
  useEffect(() => {
    if (!enabled || !clinicId) return;
    if (typeof window === 'undefined') return;

    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchData({ background: true });
      }
    };
    const handleFocus = () => {
      void fetchData({ background: true });
    };

    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleFocus);
    };
  }, [clinicId, enabled, fetchData]);

  return {
    ...data,
    loading,
    error,
  };
};
