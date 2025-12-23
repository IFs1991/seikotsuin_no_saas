import { useState, useEffect } from 'react';

interface StaffMetrics {
  dailyPatients: number;
}

interface RevenueRanking {
  name: string;
  revenue: number;
  percentage: number;
}

interface SatisfactionCorrelation {
  overall: number;
}

interface SkillMatrix {
  id: number;
  name: string;
  level: number;
}

interface TrainingHistory {
  id: number;
  title: string;
  date: string;
}

interface PerformanceTrends {
  monthly: Array<{
    month: string;
    patients: number;
    revenue: number;
  }>;
}

interface UseStaffAnalysisReturn {
  staffMetrics: StaffMetrics;
  revenueRanking: RevenueRanking[];
  satisfactionCorrelation: SatisfactionCorrelation;
  skillMatrix: SkillMatrix[];
  trainingHistory: TrainingHistory[];
  performanceTrends: PerformanceTrends;
  isLoading: boolean;
}

const DEFAULT_CLINIC_ID =
  process.env.NEXT_PUBLIC_DEFAULT_CLINIC_ID || 'default-clinic-id';

export const useStaffAnalysis = (
  clinicId: string = DEFAULT_CLINIC_ID
): UseStaffAnalysisReturn => {
  const [data, setData] = useState<UseStaffAnalysisReturn>({
    staffMetrics: {
      dailyPatients: 12,
    },
    revenueRanking: [
      { name: '田中', revenue: 120000, percentage: 28 },
      { name: '佐藤', revenue: 110000, percentage: 25 },
      { name: '山田', revenue: 95000, percentage: 22 },
    ],
    satisfactionCorrelation: {
      overall: 4.2,
    },
    skillMatrix: [
      { id: 1, name: '整体技術', level: 5 },
      { id: 2, name: 'コミュニケーション', level: 4 },
      { id: 3, name: '鍼灸技術', level: 3 },
    ],
    trainingHistory: [
      { id: 1, title: '整体認定研修', date: '2024-07-15' },
      { id: 2, title: '接客マナー講習', date: '2024-06-20' },
      { id: 3, title: '鍼灸基礎コース', date: '2024-05-10' },
    ],
    performanceTrends: {
      monthly: [
        { month: '7月', patients: 280, revenue: 350000 },
        { month: '6月', patients: 260, revenue: 330000 },
      ],
    },
    isLoading: false,
  });

  useEffect(() => {
    // TODO: 実際のAPIからデータを取得
    // const fetchData = async () => {
    //   try {
    //     const response = await api.staff.getAnalysis(clinicId);
    //     setData(response.data);
    //   } catch (error) {
    //     console.error('Failed to fetch staff analysis:', error);
    //   }
    // };
    // fetchData();
  }, [clinicId]);

  return data;
};
