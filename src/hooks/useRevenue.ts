import { useState, useEffect } from 'react';
import { api, isSuccessResponse } from '@/lib/api-client';

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

        if (isSuccessResponse(res)) {
          const d = res.data as any;
          const menuRanking: MenuRanking[] = (d.menuRanking || []).map(
            (m: any) => ({
              menu: m.menu_name || '',
              revenue: Number(m.total_revenue || 0),
              count: Number(m.transaction_count || 0),
            })
          );

          const hourly = Array.isArray(d.hourlyRevenue) ? d.hourlyRevenue : [];
          const hourlySummary =
            hourly.length > 0 ? `データ点: ${hourly.length}件` : 'データなし';

          // growthRate から前年を概算
          let lastYearRevenue = 0;
          if (typeof d.growthRate === 'string' && d.growthRate.endsWith('%')) {
            const gr = parseFloat(d.growthRate.replace('%', '')) / 100;
            if (!Number.isNaN(gr) && gr !== -1) {
              lastYearRevenue = Math.round(
                Number(d.monthlyRevenue || 0) / (1 + gr)
              );
            }
          }

          setData({
            dailyRevenue: Number(d.dailyRevenue || 0),
            weeklyRevenue: Number(d.weeklyRevenue || 0),
            monthlyRevenue: Number(d.monthlyRevenue || 0),
            insuranceRevenue: Number(d.insuranceRevenue || 0),
            selfPayRevenue: Number(d.selfPayRevenue || 0),
            menuRanking,
            hourlyRevenue: hourlySummary,
            dailyRevenueByDayOfWeek: '',
            lastYearRevenue,
            growthRate: String(d.growthRate || '0%'),
            revenueForecast: Number(d.revenueForecast || 0),
            costAnalysis: String(d.costAnalysis || ''),
            staffRevenueContribution: '',
          });
        } else {
          // APIエラー時はサンプル値にフォールバックせずエラー状態にする
          const errorMessage = res.error?.message || '収益データの取得に失敗しました';
          setError(errorMessage);
          setData(INITIAL_DATA);
        }
      } catch (e) {
        if (isMounted) {
          console.error('useRevenue error:', e);
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
