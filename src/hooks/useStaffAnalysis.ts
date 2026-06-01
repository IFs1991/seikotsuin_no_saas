import { useState, useEffect, useCallback } from 'react';
import { useUserProfileContext } from '@/providers/user-profile-context';
import { useOptionalSelectedClinic } from '@/providers/selected-clinic-context';

interface StaffMetrics {
  dailyPatients: number;
  totalRevenue: number;
  averageSatisfaction: number;
}

interface RevenueRanking {
  staff_id: string;
  name: string;
  revenue: number;
  patients: number;
  satisfaction: number;
}

interface SatisfactionCorrelation {
  name: string;
  satisfaction: number;
  revenue: number;
  patients: number;
}

interface HourlyReservation {
  hour: number;
  count: number;
}

interface ShiftAnalysis {
  hourlyReservations: HourlyReservation[];
  utilizationRate: number;
  recommendations: string[];
}

interface PerformanceTrendItem {
  date: string;
  revenue: number;
  patients: number;
  satisfaction: number;
}

interface UseStaffAnalysisReturn {
  staffMetrics: StaffMetrics;
  revenueRanking: RevenueRanking[];
  satisfactionCorrelation: SatisfactionCorrelation[];
  performanceTrends: Record<string, PerformanceTrendItem[]>;
  shiftAnalysis: ShiftAnalysis;
  totalStaff: number;
  activeStaff: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const defaultShiftAnalysis: ShiftAnalysis = {
  hourlyReservations: Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: 0,
  })),
  utilizationRate: 0,
  recommendations: [],
};

export const useStaffAnalysis = (): UseStaffAnalysisReturn => {
  const { profile, loading: profileLoading } = useUserProfileContext();
  const selectedClinicContext = useOptionalSelectedClinic();
  const selectedClinicLoading = selectedClinicContext?.clinicsLoading === true;
  const clinicId = selectedClinicContext
    ? selectedClinicContext.selectedClinicId
    : (profile?.clinicId ?? null);

  const [data, setData] = useState<Omit<UseStaffAnalysisReturn, 'refetch'>>({
    staffMetrics: {
      dailyPatients: 0,
      totalRevenue: 0,
      averageSatisfaction: 0,
    },
    revenueRanking: [],
    satisfactionCorrelation: [],
    performanceTrends: {},
    shiftAnalysis: defaultShiftAnalysis,
    totalStaff: 0,
    activeStaff: 0,
    isLoading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    if (!clinicId) {
      setData(prev => ({ ...prev, isLoading: false }));
      return;
    }

    setData(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const params = new URLSearchParams({ clinic_id: clinicId });
      const response = await fetch(`/api/staff?${params.toString()}`);
      const json = await response.json();

      if (!response.ok || !json?.success) {
        throw new Error(
          json?.error?.message ||
            json?.error ||
            'スタッフ分析データの取得に失敗しました'
        );
      }

      const apiData = json.data;
      setData({
        staffMetrics: apiData.staffMetrics || {
          dailyPatients: 0,
          totalRevenue: 0,
          averageSatisfaction: 0,
        },
        revenueRanking: apiData.revenueRanking || [],
        satisfactionCorrelation: apiData.satisfactionCorrelation || [],
        performanceTrends: apiData.performanceTrends || {},
        shiftAnalysis: apiData.shiftAnalysis || defaultShiftAnalysis,
        totalStaff: apiData.totalStaff || 0,
        activeStaff: apiData.activeStaff || 0,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setData(prev => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'スタッフ分析データの取得に失敗しました',
      }));
    }
  }, [clinicId]);

  useEffect(() => {
    if (!profileLoading && !selectedClinicLoading) {
      fetchData();
    }
  }, [fetchData, profileLoading, selectedClinicLoading]);

  return {
    ...data,
    isLoading: profileLoading || selectedClinicLoading || data.isLoading,
    refetch: fetchData,
  };
};
