export type ManagerDashboardAttentionType =
  | 'missing_daily_report'
  | 'needs_review'
  | 'low_revenue'
  | 'low_reservations'
  | 'high_cancellations';

export type ManagerDashboardSeverity = 'info' | 'warning' | 'critical';

export type ManagerDashboardDailyReportStatus =
  | 'submitted'
  | 'missing'
  | 'needs_review';

export type ManagerDashboardTimelineType =
  | 'daily_report_submitted'
  | 'daily_report_missing'
  | 'needs_review'
  | 'low_revenue'
  | 'low_reservations'
  | 'high_cancellations';

export type ManagerDashboardDate = {
  today: string;
  previousDay: string;
  previousWeekday: string;
  timezone: 'Asia/Tokyo';
};

export type ManagerDashboardClinic = {
  id: string;
  name: string;
};

export type ManagerDashboardClinicLinks = {
  dailyReports: string;
  reservations: string;
  patients: string;
  revenue: string;
};

export type ManagerDashboardAttentionItem = {
  id: string;
  clinicId: string;
  clinicName: string;
  type: ManagerDashboardAttentionType;
  severity: ManagerDashboardSeverity;
  title: string;
  description: string;
  href: string;
};

export type ManagerDashboardClinicCard = {
  clinicId: string;
  clinicName: string;
  todayRevenue: number;
  previousDayRevenue: number;
  todayVisitCount: number;
  todayReservationCount: number;
  previousWeekdayReservationCount: number;
  todayCancellationCount: number;
  dailyReportStatus: ManagerDashboardDailyReportStatus;
  revenueChangeRateFromPreviousDay: number | null;
  reservationChangeRateFromPreviousWeekday: number | null;
  cancellationRate: number | null;
  links: ManagerDashboardClinicLinks;
};

export type ManagerDashboardTimelineItem = {
  id: string;
  occurredAt: string;
  clinicId: string;
  clinicName: string;
  type: ManagerDashboardTimelineType;
  label: string;
  detail: string;
  href: string;
};

export type ManagerDashboardResponse = {
  generatedAt: string;
  date: ManagerDashboardDate;
  clinics: ManagerDashboardClinic[];
  summary: {
    assignedClinicCount: number;
    todayRevenue: number;
    todayVisitCount: number;
    todayReservationCount: number;
    submittedDailyReportCount: number;
    missingDailyReportCount: number;
    needsReviewCount: number;
    lowRevenueClinicCount: number;
    lowReservationClinicCount: number;
    highCancellationClinicCount: number;
  };
  attentionItems: ManagerDashboardAttentionItem[];
  clinicCards: ManagerDashboardClinicCard[];
  timeline: ManagerDashboardTimelineItem[];
};
