import type {
  AggregatedClinicData,
  AdminDashboardPayload,
} from '@/lib/admin/dashboard';

export interface SummaryMetric {
  label: string;
  value: string;
}

export type SignalTone = 'neutral' | 'warning' | 'success';

export interface ManagementSignal {
  label: string;
  value: string;
  detail: string;
  tone: SignalTone;
}

export interface ManagementAction {
  label: string;
  description: string;
  href: string;
  cta: string;
}

export interface DashboardClinic extends AggregatedClinicData {
  isProblematic: boolean;
}

export interface AdminHomeViewModel {
  summaryMetrics: SummaryMetric[];
  managementSignals: ManagementSignal[];
  dashboardClinics: DashboardClinic[];
  problematicClinics: DashboardClinic[];
}

export type AdminDashboardVariant = 'hq' | 'area-manager';

interface DashboardClinicInsights {
  dashboardClinics: DashboardClinic[];
  problematicClinics: DashboardClinic[];
  inactiveDataClinics: number;
}

interface ManagementSignalCounts {
  totalClinics: number;
  problematicClinicCount: number;
  inactiveDataClinics: number;
}

export const ADMIN_DASHBOARD_COPY = {
  title: '管理ホーム',
  description:
    '本部管理者が今日確認すべき店舗状態、要対応事項、主要な管理導線をまとめます。詳細な店舗比較は店舗比較分析で確認します。',
  loading: 'データを読み込み中...',
  refreshing: '最新データに更新中です。',
  errorTitle: 'ダッシュボードデータを取得できませんでした。',
  summaryLabels: ['全店舗売上', '全店舗患者数', '全店舗平均スコア'] as const,
  signalTitle: '今日の確認ポイント',
  actionTitle: '管理アクション',
  actionDescription:
    'テナント作成、権限、設定テンプレート、分析の深掘りへすぐ移動できます。',
  alertTitle: '要確認店舗',
  alertDescription:
    '平均パフォーマンスが基準を下回っています。原因の比較は店舗比較分析で確認してください。',
  clinicPerformanceTitle: '子テナント別パフォーマンス',
  clinicPerformanceDescription:
    '本部スコープ内の子テナントごとの売上、患者数、平均スコアです。',
  noClinicPerformanceTitle: '表示できる子テナントはありません',
  noClinicPerformanceDescription:
    '本部配下の子テナントが作成されると、ここに店舗別パフォーマンスが表示されます。',
  attentionBadge: '要確認',
  stableBadge: '通常',
  noAlertsTitle: '要確認店舗はありません',
  noAlertsDescription:
    '現時点では平均パフォーマンス基準を下回る店舗は検出されていません。',
  performanceLabel: '平均スコア',
  detailButton: '店舗比較分析で見る',
  retryButton: '再読み込み',
  comparisonButton: '店舗比較分析を開く',
} as const;

export const ADMIN_MANAGEMENT_ACTIONS = [
  {
    label: 'クリニック管理',
    description: '親子テナント、店舗作成、状態変更を確認します。',
    href: '/admin/tenants',
    cta: '店舗管理へ',
  },
  {
    label: 'スタッフ管理',
    description: 'admin / clinic_admin / manager などの割り当てを管理します。',
    href: '/admin/users',
    cta: '権限管理へ',
  },
  {
    label: '設定テンプレート',
    description: '新規店舗作成時に適用する初期設定を整えます。',
    href: '/admin/settings',
    cta: '設定へ',
  },
  {
    label: '店舗比較分析',
    description: '店舗別KPI、ランキング、差分を深掘りします。',
    href: '/multi-store',
    cta: '分析へ',
  },
] as const satisfies readonly ManagementAction[];

export const AREA_MANAGER_ADMIN_DASHBOARD_COPY = {
  ...ADMIN_DASHBOARD_COPY,
  title: '担当エリア管理ホーム',
  description:
    '担当エリア内のClinic状態、要対応事項、主要な管理導線をまとめます。詳細な比較は担当Clinic比較で確認します。',
  summaryLabels: [
    '担当エリア売上',
    '担当エリア患者数',
    '担当エリア平均スコア',
  ] as const,
  actionDescription:
    '担当Clinicのスタッフ権限管理とKPI比較へすぐ移動できます。',
  clinicPerformanceTitle: '担当Clinic別パフォーマンス',
  clinicPerformanceDescription:
    '担当エリア内のClinicごとの売上、患者数、平均スコアです。',
  noClinicPerformanceTitle: '表示できる担当Clinicはありません',
  noClinicPerformanceDescription:
    '担当Clinicスコープが設定されると、ここにClinic別パフォーマンスが表示されます。',
  detailButton: '担当Clinic比較で見る',
  comparisonButton: '担当Clinic比較を開く',
} as const;

export const AREA_MANAGER_MANAGEMENT_ACTIONS = [
  {
    label: 'スタッフ管理',
    description:
      '担当Clinic内の clinic_admin / therapist / staff の割り当てを管理します。',
    href: '/admin/users',
    cta: '権限管理へ',
  },
  {
    label: '担当Clinic比較',
    description: '担当Clinic別KPI、ランキング、差分を確認します。',
    href: '/multi-store',
    cta: '比較へ',
  },
] as const satisfies readonly ManagementAction[];

const ADMIN_DASHBOARD_COPY_BY_VARIANT = {
  hq: ADMIN_DASHBOARD_COPY,
  'area-manager': AREA_MANAGER_ADMIN_DASHBOARD_COPY,
} as const;

const ADMIN_MANAGEMENT_ACTIONS_BY_VARIANT = {
  hq: ADMIN_MANAGEMENT_ACTIONS,
  'area-manager': AREA_MANAGER_MANAGEMENT_ACTIONS,
} as const;

export function getAdminDashboardCopy(variant: AdminDashboardVariant) {
  return ADMIN_DASHBOARD_COPY_BY_VARIANT[variant];
}

export function getAdminManagementActions(
  variant: AdminDashboardVariant
): readonly ManagementAction[] {
  return ADMIN_MANAGEMENT_ACTIONS_BY_VARIANT[variant];
}

export const ADMIN_DASHBOARD_STYLES = {
  page: 'min-h-screen bg-slate-50 p-4 text-slate-950 md:p-8',
  container: 'mx-auto max-w-6xl',
  rootCard: 'w-full border-slate-200 bg-white',
  header: 'space-y-4 border-b border-slate-100',
  headerRow:
    'flex flex-col gap-4 md:flex-row md:items-start md:justify-between',
  title: 'text-2xl font-bold text-slate-950',
  description: 'mt-2 max-w-3xl text-sm leading-6 text-slate-600',
  body: 'space-y-8 p-6',
  loading: 'text-center text-slate-700',
  statusText: 'text-center text-sm text-slate-500',
  errorState:
    'rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-red-800',
  summaryGrid: 'grid grid-cols-1 gap-4 md:grid-cols-3',
  metricCard: 'border border-slate-200 bg-white p-4 shadow-sm',
  metricTitle: 'text-sm font-semibold text-slate-600',
  metricValue: 'mt-2 text-3xl font-bold text-slate-950',
  sectionHeader: 'space-y-1',
  sectionTitle: 'text-xl font-semibold text-slate-950',
  sectionDescription: 'text-sm text-slate-600',
  signalGrid: 'grid grid-cols-1 gap-4 md:grid-cols-3',
  signalCard: 'border border-slate-200 bg-white p-4 shadow-sm',
  signalLabel: 'text-sm font-semibold text-slate-600',
  signalValue: 'mt-2 text-2xl font-bold text-slate-950',
  signalDetail: 'mt-1 text-sm text-slate-500',
  signalNeutral: 'border-slate-200',
  signalWarning: 'border-amber-300 bg-amber-50',
  signalSuccess: 'border-emerald-300 bg-emerald-50',
  alertCard: 'border-l-4 border-amber-500 bg-amber-50 p-4 shadow-sm',
  alertTitle: 'flex items-center text-lg font-semibold text-amber-900',
  alertBody: 'mt-2 text-slate-800',
  clinicPerformanceGrid: 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3',
  clinicPerformanceCard:
    'min-h-[148px] border border-slate-200 bg-white p-4 shadow-sm',
  clinicPerformanceHeader: 'flex items-start justify-between gap-3',
  clinicPerformanceName: 'text-base font-semibold text-slate-950',
  clinicPerformanceBadge:
    'shrink-0 rounded-full px-2 py-1 text-xs font-semibold',
  clinicPerformanceBadgeWarning: 'bg-amber-100 text-amber-900',
  clinicPerformanceBadgeStable: 'bg-emerald-100 text-emerald-900',
  clinicPerformanceScore: 'mt-3 text-2xl font-bold text-slate-950',
  clinicPerformanceMeta: 'mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600',
  clinicCard: 'border border-slate-200 bg-white p-4 shadow-sm',
  problematicClinicCard: 'border-2 border-amber-300 bg-amber-50/70',
  clinicTitle: 'text-md font-bold text-slate-950',
  clinicBody: 'mt-2 text-sm text-slate-700',
  clinicKpiValue: 'font-medium text-emerald-700',
  actionGrid: 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4',
  actionCard:
    'flex h-full flex-col justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md',
  actionTitle: 'font-semibold text-slate-950',
  actionDescription: 'mt-2 block text-sm leading-6 text-slate-600',
  actionCta: 'mt-4 inline-flex text-sm font-semibold text-blue-800',
  linkButton:
    'inline-flex items-center justify-center rounded-medical bg-[#1e3a8a] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1e3a8a]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
  clinicDetailLink:
    'mt-3 inline-flex text-sm font-semibold text-blue-800 hover:underline',
  primaryActionButton:
    'bg-[#1e3a8a] text-white hover:bg-[#1e3a8a]/90 dark:bg-[#10b981] dark:hover:bg-[#10b981]/90',
} as const;

const PERFORMANCE_ALERT_THRESHOLD = 3.0;

export function formatCurrency(value: number): string {
  return `¥${value.toLocaleString()}`;
}

export function buildSummaryMetrics(
  overallKpis: AdminDashboardPayload['overallKpis'] | null,
  variant: AdminDashboardVariant = 'hq'
): SummaryMetric[] {
  const copy = getAdminDashboardCopy(variant);

  return [
    {
      label: copy.summaryLabels[0],
      value: formatCurrency(overallKpis?.totalGroupRevenue ?? 0),
    },
    {
      label: copy.summaryLabels[1],
      value: `${(overallKpis?.totalGroupPatientCount ?? 0).toLocaleString()}人`,
    },
    {
      label: copy.summaryLabels[2],
      value: `${(overallKpis?.averageGroupPerformance ?? 0).toFixed(1)} / 5.0`,
    },
  ];
}

function hasNoRecordedActivity(clinic: AggregatedClinicData): boolean {
  return clinic.totalRevenue <= 0 && clinic.totalPatientCount <= 0;
}

function buildManagementSignalsFromCounts({
  totalClinics,
  problematicClinicCount,
  inactiveDataClinics,
}: ManagementSignalCounts): ManagementSignal[] {
  const healthyClinicCount =
    totalClinics - problematicClinicCount - inactiveDataClinics;

  return [
    {
      label: '注意店舗',
      value: `${problematicClinicCount}件`,
      detail: '平均スコアが基準を下回る店舗数',
      tone: problematicClinicCount > 0 ? 'warning' : 'success',
    },
    {
      label: 'データ未計上',
      value: `${inactiveDataClinics}件`,
      detail: '売上・患者数がまだ計上されていない店舗',
      tone: inactiveDataClinics > 0 ? 'warning' : 'neutral',
    },
    {
      label: '通常範囲',
      value: `${Math.max(healthyClinicCount, 0)}件`,
      detail: '現時点で基準内に収まっている店舗',
      tone: 'success',
    },
  ];
}

function collectDashboardClinicInsights(
  clinics: readonly AggregatedClinicData[]
): DashboardClinicInsights {
  const dashboardClinics: DashboardClinic[] = [];
  const problematicClinics: DashboardClinic[] = [];
  let inactiveDataClinics = 0;

  for (const clinic of clinics) {
    const isProblematic = isProblematicClinic(clinic);
    const dashboardClinic = {
      ...clinic,
      isProblematic,
    };

    dashboardClinics.push(dashboardClinic);

    if (isProblematic) {
      problematicClinics.push(dashboardClinic);
    }

    if (hasNoRecordedActivity(clinic)) {
      inactiveDataClinics += 1;
    }
  }

  return {
    dashboardClinics,
    problematicClinics,
    inactiveDataClinics,
  };
}

export function buildManagementSignals(
  clinics: readonly AggregatedClinicData[]
): ManagementSignal[] {
  const insights = collectDashboardClinicInsights(clinics);

  return buildManagementSignalsFromCounts({
    totalClinics: clinics.length,
    problematicClinicCount: insights.problematicClinics.length,
    inactiveDataClinics: insights.inactiveDataClinics,
  });
}

export function isProblematicClinic(clinic: AggregatedClinicData): boolean {
  if (clinic.totalPatientCount <= 0) {
    return false;
  }

  return clinic.averagePerformanceScore < PERFORMANCE_ALERT_THRESHOLD;
}

export function decorateDashboardClinics(
  clinics: readonly AggregatedClinicData[]
): DashboardClinic[] {
  return collectDashboardClinicInsights(clinics).dashboardClinics;
}

export function buildAdminHomeViewModel(
  clinics: readonly AggregatedClinicData[],
  overallKpis: AdminDashboardPayload['overallKpis'] | null,
  variant: AdminDashboardVariant = 'hq'
): AdminHomeViewModel {
  const insights = collectDashboardClinicInsights(clinics);

  return {
    summaryMetrics: buildSummaryMetrics(overallKpis, variant),
    managementSignals: buildManagementSignalsFromCounts({
      totalClinics: clinics.length,
      problematicClinicCount: insights.problematicClinics.length,
      inactiveDataClinics: insights.inactiveDataClinics,
    }),
    dashboardClinics: insights.dashboardClinics,
    problematicClinics: insights.problematicClinics,
  };
}
