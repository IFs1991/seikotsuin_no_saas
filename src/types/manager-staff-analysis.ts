import type {
  ManagerAnalysisBucket,
  ManagerAnalysisPeriodType,
} from '@/lib/manager-analysis-period';

export type ManagerStaffAnalysisTarget = 'total' | 'clinic';
export type ManagerStaffAnalysisCompareMode = 'previous_period' | 'none';

export type ManagerStaffAnalysisPeriod = {
  preset: ManagerAnalysisPeriodType;
  startDate: string | null;
  endDate: string | null;
  bucket: ManagerAnalysisBucket;
  compare: ManagerStaffAnalysisCompareMode;
};

export type ManagerStaffAnalysisClinic = {
  id: string;
  name: string;
};

export type ManagerStaffAnalysisScope = {
  target: ManagerStaffAnalysisTarget;
  clinicId: string | null;
  clinics: ManagerStaffAnalysisClinic[];
};

export type ManagerStaffAnalysisSummary = {
  staffCount: number;
  workingStaffCount: number;
  reservationCount: number;
  completedReservationCount: number;
  totalRevenue: number;
  averageUnitPrice: number;
  cancellationRate: number;
  dailyReportIssueCount: number;
  revenueChangeRate: number | null;
  reservationChangeRate: number | null;
};

export type ManagerStaffAnalysisStaffStatus =
  | 'needs_attention'
  | 'stable'
  | 'insufficient_data';

export type ManagerStaffAnalysisStaffRow = {
  staffId: string;
  staffName: string;
  clinicId: string;
  clinicName: string;
  isActive: boolean;
  isBookable: boolean | null;
  reservationCount: number;
  completedReservationCount: number;
  totalRevenue: number;
  averageUnitPrice: number;
  cancellationRate: number;
  revenueChangeRate: number | null;
  reservationChangeRate: number | null;
  status: ManagerStaffAnalysisStaffStatus;
};

export type ManagerStaffAnalysisClinicComparisonRow = {
  clinicId: string;
  clinicName: string;
  staffCount: number;
  workingStaffCount: number;
  reservationCount: number;
  completedReservationCount: number;
  totalRevenue: number;
  averageRevenuePerStaff: number;
  cancellationRate: number;
  attentionStaffCount: number;
};

export type ManagerStaffAnalysisTrendPoint = {
  date: string;
  clinicId: string | null;
  clinicName: string | null;
  staffId: string | null;
  staffName: string | null;
  reservationCount: number;
  completedReservationCount: number;
  totalRevenue: number;
  cancellationRate: number;
};

export type ManagerStaffAnalysisAttentionType =
  | 'high_cancellation_rate'
  | 'reservation_drop'
  | 'revenue_drop'
  | 'low_activity'
  | 'workload_concentration'
  | 'clinic_daily_report_missing';

export type ManagerStaffAnalysisAttentionSeverity =
  | 'critical'
  | 'warning'
  | 'info';

export type ManagerStaffAnalysisAttentionItem = {
  id: string;
  type: ManagerStaffAnalysisAttentionType;
  severity: ManagerStaffAnalysisAttentionSeverity;
  clinicId: string;
  clinicName: string;
  staffId: string | null;
  staffName: string | null;
  title: string;
  description: string;
  metricValue: number | null;
};

export type ManagerStaffAnalysisResponse = {
  generatedAt: string;
  period: ManagerStaffAnalysisPeriod;
  scope: ManagerStaffAnalysisScope;
  summary: ManagerStaffAnalysisSummary;
  staff: ManagerStaffAnalysisStaffRow[];
  clinicComparison: ManagerStaffAnalysisClinicComparisonRow[];
  trends: ManagerStaffAnalysisTrendPoint[];
  attentionItems: ManagerStaffAnalysisAttentionItem[];
  disclaimers: string[];
};

export type StaffResourceRecord = {
  id: string;
  name: string;
  clinicId: string;
  clinicName: string;
  isActive: boolean;
  isDeleted: boolean;
  isBookable: boolean | null;
};

export type ReservationMetricRecord = {
  id: string;
  clinicId: string;
  staffId: string;
  status: string;
  startsAt: string;
};

export type StaffShiftMetricRecord = {
  id: string;
  clinicId: string;
  staffId: string;
  shiftDate: string;
};

export type DailyReportItemMetricRecord = {
  id: string;
  clinicId: string;
  staffResourceId: string | null;
  reportDate: string;
  fee: number;
};
