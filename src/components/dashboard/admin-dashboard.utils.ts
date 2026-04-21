import type {
  AggregatedClinicData,
  AdminDashboardPayload,
} from '@/lib/admin/dashboard';

export interface SummaryMetric {
  label: string;
  value: string;
}

export interface DashboardClinic extends AggregatedClinicData {
  isProblematic: boolean;
}

export const ADMIN_DASHBOARD_COPY = {
  title: 'Admin統合管理ダッシュボード',
  description:
    '権限範囲内の店舗パフォーマンス、ランキング、グループ統計を表示します。',
  loading: 'データを読み込み中...',
  refreshing: '最新データに更新中です。',
  errorTitle: 'ダッシュボードデータを取得できませんでした。',
  emptyState: '表示できる店舗データがありません。',
  summaryLabels: ['総売上', '総患者数', '平均パフォーマンス'] as const,
  alertTitle: '問題店舗アラート',
  alertDescription: '以下の店舗で平均パフォーマンスの低下が検出されました:',
  performanceLabel: '平均パフォーマンス',
  performanceSectionTitle: '店舗別パフォーマンス',
  detailButton: '詳細へ',
  retryButton: '再読み込み',
  exportButton: '経営レポートをエクスポート',
} as const;

export const ADMIN_DASHBOARD_STYLES = {
  page: 'min-h-screen bg-slate-50 p-8 text-slate-950',
  container: 'mx-auto max-w-4xl',
  rootCard: 'w-full border-slate-200 bg-white',
  body: 'space-y-8 p-6',
  title: 'text-center text-2xl font-bold text-slate-950',
  description: 'mt-2 text-center text-slate-600',
  loading: 'text-center text-slate-700',
  statusText: 'text-center text-sm text-slate-500',
  errorState:
    'rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-red-800',
  emptyState:
    'rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-slate-600',
  summaryGrid: 'grid grid-cols-1 gap-4 md:grid-cols-3',
  metricCard: 'border border-slate-200 bg-white p-4 shadow-sm',
  metricTitle: 'text-lg font-semibold text-slate-900',
  metricValue: 'mt-2 text-3xl font-bold text-slate-950',
  alertCard: 'border-l-4 border-red-500 bg-red-50 p-4 shadow-sm',
  alertTitle: 'flex items-center text-lg font-semibold text-red-800',
  alertBody: 'mt-2 text-slate-800',
  sectionTitle: 'mb-4 text-xl font-semibold text-slate-950',
  clinicGrid:
    'grid max-h-96 grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  clinicCard: 'border border-slate-200 bg-white p-4 shadow-sm',
  problematicClinicCard: 'border-2 border-red-300 bg-red-50/60',
  clinicTitle: 'text-md font-bold text-slate-950',
  clinicBody: 'mt-2 text-sm text-slate-700',
  clinicKpiValue: 'font-medium text-emerald-700',
  clinicDetailButton: 'h-auto p-0 text-slate-900',
  primaryActionButton:
    'bg-[#1e3a8a] text-white hover:bg-[#1e3a8a]/90 dark:bg-[#10b981] dark:hover:bg-[#10b981]/90',
  footer: 'mt-8 flex justify-end',
} as const;

const PERFORMANCE_ALERT_THRESHOLD = 3.0;

export function formatCurrency(value: number): string {
  return `¥${value.toLocaleString()}`;
}

export function buildSummaryMetrics(
  overallKpis: AdminDashboardPayload['overallKpis'] | null
): SummaryMetric[] {
  return [
    {
      label: ADMIN_DASHBOARD_COPY.summaryLabels[0],
      value: formatCurrency(overallKpis?.totalGroupRevenue ?? 0),
    },
    {
      label: ADMIN_DASHBOARD_COPY.summaryLabels[1],
      value: `${(overallKpis?.totalGroupPatientCount ?? 0).toLocaleString()}人`,
    },
    {
      label: ADMIN_DASHBOARD_COPY.summaryLabels[2],
      value: `${(overallKpis?.averageGroupPerformance ?? 0).toFixed(1)} / 5.0`,
    },
  ];
}

export function isProblematicClinic(clinic: AggregatedClinicData): boolean {
  if (clinic.totalPatientCount <= 0) {
    return false;
  }

  return clinic.averagePerformanceScore < PERFORMANCE_ALERT_THRESHOLD;
}

export function decorateDashboardClinics(
  clinics: AggregatedClinicData[]
): DashboardClinic[] {
  return clinics.map(clinic => ({
    ...clinic,
    isProblematic: isProblematicClinic(clinic),
  }));
}
