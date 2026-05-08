import { useState, useEffect } from 'react';
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

const INITIAL_DATA: RevenueData = {
  dailyRevenue: 0,
  weeklyRevenue: 0,
  monthlyRevenue: 0,
  insuranceRevenue: 0,
  selfPayRevenue: 0,
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

export const useRevenue = (clinicId: string): UseRevenueReturn => {
  const [data, setData] = useState<RevenueData>(INITIAL_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // clinicIdのバリデーション
    if (!clinicId) {
      setLoading(false);
      setError('clinic_idは必須です');
      setData(INITIAL_DATA);
      return;
    }

    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await api.revenue.getAnalysis(clinicId);

        if (!isMounted) return;

        if (res && isSuccessResponse(res)) {
          const revenueData = res.data;

          setData({
            dailyRevenue: Number(revenueData.dailyRevenue || 0),
            weeklyRevenue: Number(revenueData.weeklyRevenue || 0),
            monthlyRevenue: Number(revenueData.monthlyRevenue || 0),
            insuranceRevenue: Number(revenueData.insuranceRevenue || 0),
            selfPayRevenue: Number(revenueData.selfPayRevenue || 0),
            menuRanking: mapMenuRanking(revenueData.menuRanking),
            hourlyRevenue: summarizeHourlyRevenue(revenueData.hourlyRevenue),
            dailyRevenueByDayOfWeek: '',
            lastYearRevenue: estimateLastYearRevenue(revenueData),
            growthRate: revenueData.growthRate || '0%',
            revenueForecast: Number(revenueData.revenueForecast || 0),
            costAnalysis: revenueData.costAnalysis || '',
            staffRevenueContribution: '',
          });
        } else {
          // APIエラー時はサンプル値にフォールバックせずエラー状態にする
          const errorMessage =
            res?.error?.message || '収益データの取得に失敗しました';
          setError(errorMessage);
          setData(INITIAL_DATA);
        }
      } catch {
        if (isMounted) {
          setError('収益データの取得に失敗しました');
          setData(INITIAL_DATA);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [clinicId]);

  return {
    ...data,
    loading,
    error,
  };
};
