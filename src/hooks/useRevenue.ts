import { useState, useEffect } from 'react';
import { api, isSuccessResponse } from '@/lib/api-client';

interface MenuRanking {
  menu: string;
  revenue: number;
  count: number;
}

interface UseRevenueReturn {
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

const DEFAULT_CLINIC_ID = process.env.NEXT_PUBLIC_DEFAULT_CLINIC_ID || 'default-clinic-id';

export const useRevenue = (clinicId: string = DEFAULT_CLINIC_ID): UseRevenueReturn => {
  const [data, setData] = useState<UseRevenueReturn>({
    dailyRevenue: 150000,
    weeklyRevenue: 980000,
    monthlyRevenue: 4200000,
    insuranceRevenue: 2520000,
    selfPayRevenue: 1680000,
    menuRanking: [
      { menu: '整体', revenue: 1200000, count: 120 },
      { menu: 'マッサージ', revenue: 800000, count: 160 },
      { menu: '鍼灸', revenue: 600000, count: 60 }
    ],
    hourlyRevenue: 'ピーク: 14:00-16:00',
    dailyRevenueByDayOfWeek: 'ピーク: 金曜日',
    lastYearRevenue: 3800000,
    growthRate: '+10.5%',
    revenueForecast: 4500000,
    costAnalysis: '35%',
    staffRevenueContribution: '田中: 28%, 佐藤: 25%'
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.revenue.getAnalysis(clinicId);
        if (isSuccessResponse(res)) {
          const d = res.data as any;
          const menuRanking: MenuRanking[] = (d.menuRanking || []).map((m: any) => ({
            menu: m.menu_name || '—',
            revenue: Number(m.total_revenue || 0),
            count: Number(m.transaction_count || 0),
          }));

          const hourly = Array.isArray(d.hourlyRevenue) ? d.hourlyRevenue : [];
          const hourlySummary = hourly.length > 0 ? `データ点: ${hourly.length}件` : 'データなし';

          // growthRate から前年を概算（正確な前年売上はAPI未返却のため）
          let lastYearRevenue = 0;
          if (typeof d.growthRate === 'string' && d.growthRate.endsWith('%')) {
            const gr = parseFloat(d.growthRate.replace('%', '')) / 100;
            if (!Number.isNaN(gr) && gr !== -1) {
              lastYearRevenue = Math.round(Number(d.monthlyRevenue || 0) / (1 + gr));
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
            dailyRevenueByDayOfWeek: '—',
            lastYearRevenue,
            growthRate: String(d.growthRate || '0%'),
            revenueForecast: Number(d.revenueForecast || 0),
            costAnalysis: String(d.costAnalysis || '—'),
            staffRevenueContribution: '—'
          });
        }
      } catch (e) {
        // フォールバック: 既定のサンプルを保持
        console.warn('useRevenue fallback to sample:', e);
      }
    };
    fetchData();
  }, [clinicId]);

  return data;
};
