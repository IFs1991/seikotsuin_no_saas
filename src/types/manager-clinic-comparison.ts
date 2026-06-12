import type {
  ManagerAnalysisBucket,
  ManagerAnalysisPeriodType,
} from '@/lib/manager-analysis-period';

export type ManagerClinicComparisonCompareMode = 'previous_period' | 'none';

export type ManagerClinicComparisonPeriod = {
  preset: ManagerAnalysisPeriodType;
  startDate: string | null;
  endDate: string | null;
  bucket: ManagerAnalysisBucket;
  compare: ManagerClinicComparisonCompareMode;
};

export type ManagerClinicComparisonClinic = {
  id: string;
  name: string;
};

export type ManagerClinicComparisonRow = {
  clinicId: string;
  clinicName: string;
  totalRevenue: number;
  reservationCount: number;
  completedReservationCount: number;
  cancellationRate: number;
  revenueChangeRate: number | null;
  reservationChangeRate: number | null;
};

export type ManagerClinicComparisonResponse = {
  generatedAt: string;
  period: ManagerClinicComparisonPeriod;
  clinics: ManagerClinicComparisonClinic[];
  rows: ManagerClinicComparisonRow[];
  disclaimers: string[];
};
