'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  useMultiStore,
  type ClinicWithKPI,
  type SortDirection,
  type SortField,
} from '@/hooks/useMultiStore';
import {
  useAdminAiInsights,
  type AdminAiInsights,
  type AdminAiInsightsStatus,
} from '@/hooks/useAdminAiInsights';

interface SummaryCardProps {
  label: string;
  value: string;
  testId: string;
}

interface SortableHeaderProps {
  label: string;
  field: SortField;
  activeField: SortField | null;
  direction: SortDirection;
  onSort: (field: SortField) => void;
}

interface SummaryItem extends SummaryCardProps {
  key: string;
}

interface ClinicsTableProps {
  clinics: readonly ClinicWithKPI[];
  sortField: SortField | null;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}

const MULTI_STORE_COPY = {
  title: '店舗比較分析',
  description:
    '管理ホームで検知した注意店舗やKPI差分を、店舗別の売上・患者数・パフォーマンスで深掘りします。',
  loading: '店舗KPIを読み込み中...',
  emptyState: '比較できるクリニックデータがありません',
  summary: {
    revenue: '比較対象の合計収益',
    patients: '比較対象の合計患者数',
    performance: '比較対象の平均スコア',
  },
  tableTitle: '店舗別KPI比較',
  tableDescription:
    '各店舗の主要指標を一覧で比較します。ヘッダーをクリックすると並び替えできます。',
  ai: {
    title: '横断AI分析',
    description:
      '子テナント横断の傾向、異常値、改善余地をAIで分析します。重い分析のため必要な時だけ取得します。',
    button: 'AI分析を取得',
    loading: 'AI分析を取得中...',
    empty: 'AI分析結果はまだありません。必要なタイミングで取得してください。',
    noResult: '表示できるAI分析結果がありません。',
    error: 'AI分析の取得に失敗しました',
    insights: '示唆',
    anomalies: '異常検知',
  },
} as const;

const CURRENCY_FORMATTER = new Intl.NumberFormat('ja-JP');
const TABLE_HEADER_CLASS =
  'px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider';
const TABLE_CELL_CLASS =
  'px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300';

const formatCurrency = (value: number): string =>
  CURRENCY_FORMATTER.format(value);

const formatPerformanceScore = (value: number | null | undefined): string =>
  value === null || value === undefined ? '-' : String(value);

const SummaryCard = memo(function SummaryCard({
  label,
  value,
  testId,
}: SummaryCardProps) {
  return (
    <Card className='bg-card shadow-md'>
      <CardHeader className='pb-2'>
        <CardDescription className='text-gray-600 dark:text-gray-300'>
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p
          data-testid={testId}
          className='text-2xl font-bold text-[#1e3a8a] dark:text-gray-100'
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
});

const MultiStoreHeader = memo(function MultiStoreHeader() {
  return (
    <header className='mb-8 text-center'>
      <p className='mb-2 text-sm font-semibold text-blue-700 dark:text-blue-300'>
        分析専用
      </p>
      <h1 className='text-2xl font-bold text-[#1e3a8a] dark:text-gray-100'>
        {MULTI_STORE_COPY.title}
      </h1>
      <p className='mx-auto mt-3 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300'>
        {MULTI_STORE_COPY.description}
      </p>
    </header>
  );
});

const SummaryCardsGrid = memo(function SummaryCardsGrid({
  items,
}: {
  items: readonly SummaryItem[];
}) {
  return (
    <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-8'>
      {items.map(item => (
        <SummaryCard
          key={item.key}
          label={item.label}
          value={item.value}
          testId={item.testId}
        />
      ))}
    </div>
  );
});

const SortableHeader = memo(function SortableHeader({
  label,
  field,
  activeField,
  direction,
  onSort,
}: SortableHeaderProps) {
  const sortMark =
    activeField === field ? (direction === 'desc' ? '▼' : '▲') : '';
  const ariaSort =
    activeField === field
      ? direction === 'desc'
        ? 'descending'
        : 'ascending'
      : undefined;

  return (
    <th className={TABLE_HEADER_CLASS} aria-sort={ariaSort}>
      <button
        type='button'
        onClick={() => onSort(field)}
        className='flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400'
      >
        {label}
        {sortMark && <span aria-hidden='true'>{sortMark}</span>}
      </button>
    </th>
  );
});

const ClinicStatusBadge = memo(function ClinicStatusBadge({
  isActive,
}: {
  isActive: boolean;
}) {
  return (
    <span
      className={`px-2 py-1 rounded-full text-xs ${
        isActive
          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      }`}
    >
      {isActive ? '有効' : '無効'}
    </span>
  );
});

const ClinicsTable = memo(function ClinicsTable({
  clinics,
  sortField,
  sortDirection,
  onSort,
}: ClinicsTableProps) {
  if (clinics.length === 0) {
    return (
      <p className='text-gray-500 dark:text-gray-400 text-center py-8'>
        {MULTI_STORE_COPY.emptyState}
      </p>
    );
  }

  return (
    <div className='overflow-x-auto'>
      <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
        <thead className='bg-gray-50 dark:bg-gray-700'>
          <tr>
            <th className={TABLE_HEADER_CLASS}>店舗名</th>
            <SortableHeader
              label='収益'
              field='revenue'
              activeField={sortField}
              direction={sortDirection}
              onSort={onSort}
            />
            <SortableHeader
              label='患者数'
              field='patients'
              activeField={sortField}
              direction={sortDirection}
              onSort={onSort}
            />
            <SortableHeader
              label='パフォーマンス'
              field='performance'
              activeField={sortField}
              direction={sortDirection}
              onSort={onSort}
            />
            <th className={TABLE_HEADER_CLASS}>ステータス</th>
          </tr>
        </thead>
        <tbody className='bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700'>
          {clinics.map(clinic => (
            <tr key={clinic.id}>
              <td className='px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100'>
                {clinic.name}
              </td>
              <td className={TABLE_CELL_CLASS}>
                {formatCurrency(clinic.kpi?.revenue ?? 0)}円
              </td>
              <td className={TABLE_CELL_CLASS}>{clinic.kpi?.patients ?? 0}</td>
              <td className={TABLE_CELL_CLASS}>
                {formatPerformanceScore(clinic.kpi?.staff_performance_score)}
              </td>
              <td className='px-6 py-4 whitespace-nowrap text-sm'>
                <ClinicStatusBadge isActive={clinic.is_active} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

const LoadingState = memo(function LoadingState() {
  return (
    <div className='bg-white dark:bg-gray-800 min-h-screen flex items-center justify-center text-gray-900 dark:text-gray-100'>
      <div
        data-testid='loading-spinner'
        role='status'
        aria-label={MULTI_STORE_COPY.loading}
        className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600'
      ></div>
    </div>
  );
});

const ErrorState = memo(function ErrorState({ error }: { error: string }) {
  return (
    <div className='bg-white dark:bg-gray-800 min-h-screen flex items-center justify-center text-red-600 dark:text-red-400'>
      <p>{error}</p>
    </div>
  );
});

const AdminAiInsightsSection = memo(function AdminAiInsightsSection({
  status,
  data,
  error,
  onFetch,
}: {
  status: AdminAiInsightsStatus;
  data: AdminAiInsights | null;
  error: string | null;
  onFetch: () => void;
}) {
  const insights = data?.insights ?? [];
  const anomalies = data?.anomalies ?? [];
  const hasResult =
    Boolean(data?.summary) || insights.length > 0 || anomalies.length > 0;

  return (
    <Card className='bg-card shadow-lg mb-8 border-blue-100 dark:border-blue-900'>
      <CardHeader>
        <div className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
          <div>
            <CardTitle className='text-lg font-semibold text-[#1e3a8a] dark:text-gray-100'>
              {MULTI_STORE_COPY.ai.title}
            </CardTitle>
            <CardDescription className='mt-2 text-gray-600 dark:text-gray-300'>
              {MULTI_STORE_COPY.ai.description}
            </CardDescription>
          </div>
          <button
            type='button'
            onClick={onFetch}
            disabled={status === 'loading'}
            className='rounded-md bg-[#1e3a8a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60'
          >
            {status === 'loading'
              ? MULTI_STORE_COPY.ai.loading
              : MULTI_STORE_COPY.ai.button}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {status === 'idle' && (
          <p className='text-sm text-gray-500 dark:text-gray-400'>
            {MULTI_STORE_COPY.ai.empty}
          </p>
        )}

        {status === 'loading' && (
          <p role='status' className='text-sm text-blue-700 dark:text-blue-300'>
            {MULTI_STORE_COPY.ai.loading}
          </p>
        )}

        {status === 'error' && (
          <p role='alert' className='text-sm text-red-600 dark:text-red-400'>
            {error ?? MULTI_STORE_COPY.ai.error}
          </p>
        )}

        {status === 'success' && !hasResult && (
          <p className='text-sm text-gray-500 dark:text-gray-400'>
            {MULTI_STORE_COPY.ai.noResult}
          </p>
        )}

        {status === 'success' && hasResult && (
          <div className='space-y-5 text-sm text-gray-700 dark:text-gray-200'>
            {data?.summary && (
              <section>
                <h3 className='mb-2 font-semibold text-gray-900 dark:text-gray-100'>
                  サマリー
                </h3>
                <p>{data.summary}</p>
              </section>
            )}

            {insights.length > 0 && (
              <section>
                <h3 className='mb-2 font-semibold text-gray-900 dark:text-gray-100'>
                  {MULTI_STORE_COPY.ai.insights}
                </h3>
                <ul className='list-disc space-y-1 pl-5'>
                  {insights.map(insight => (
                    <li key={`${insight.title}-${insight.action}`}>
                      <span className='font-medium'>{insight.title}</span>
                      <span className='block text-gray-600 dark:text-gray-300'>
                        {insight.why}
                      </span>
                      <span className='block text-gray-700 dark:text-gray-200'>
                        対応: {insight.action}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {anomalies.length > 0 && (
              <section>
                <h3 className='mb-2 font-semibold text-gray-900 dark:text-gray-100'>
                  {MULTI_STORE_COPY.ai.anomalies}
                </h3>
                <ul className='list-disc space-y-1 pl-5'>
                  {anomalies.map(anomaly => (
                    <li key={`${anomaly.title}-${anomaly.action}`}>
                      <span className='font-medium'>{anomaly.title}</span>
                      <span className='block text-gray-600 dark:text-gray-300'>
                        根拠: {anomaly.evidence}
                      </span>
                      <span className='block text-gray-700 dark:text-gray-200'>
                        対応: {anomaly.action}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

const MultiStorePage = () => {
  const {
    clinics,
    loading,
    hasLoaded,
    error,
    fetchClinicsWithKPI,
    sortByRevenue,
    sortByPatients,
    sortByPerformance,
    totalRevenue,
    totalPatients,
    averagePerformanceScore,
  } = useMultiStore();

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const {
    data: aiInsights,
    status: aiInsightsStatus,
    error: aiInsightsError,
    fetchInsights,
  } = useAdminAiInsights();
  const summaryItems = useMemo<SummaryItem[]>(
    () => [
      {
        key: 'revenue',
        label: MULTI_STORE_COPY.summary.revenue,
        value: `${formatCurrency(totalRevenue)}円`,
        testId: 'total-revenue',
      },
      {
        key: 'patients',
        label: MULTI_STORE_COPY.summary.patients,
        value: `${totalPatients}人`,
        testId: 'total-patients',
      },
      {
        key: 'performance',
        label: MULTI_STORE_COPY.summary.performance,
        value:
          averagePerformanceScore !== null
            ? averagePerformanceScore.toFixed(2)
            : '-',
        testId: 'average-performance',
      },
    ],
    [averagePerformanceScore, totalPatients, totalRevenue]
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchClinicsWithKPI(controller.signal);

    return () => controller.abort();
  }, [fetchClinicsWithKPI]);

  const handleSort = useCallback(
    (field: SortField) => {
      const newDirection: SortDirection =
        sortField === field && sortDirection === 'desc' ? 'asc' : 'desc';
      setSortField(field);
      setSortDirection(newDirection);

      switch (field) {
        case 'revenue':
          sortByRevenue(newDirection);
          break;
        case 'patients':
          sortByPatients(newDirection);
          break;
        case 'performance':
          sortByPerformance(newDirection);
          break;
      }
    },
    [sortByPatients, sortByPerformance, sortByRevenue, sortDirection, sortField]
  );

  if (!hasLoaded || loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  return (
    <div className='bg-white dark:bg-gray-800 min-h-screen text-gray-900 dark:text-gray-100 p-4'>
      <div className='max-w-6xl mx-auto py-8'>
        <MultiStoreHeader />
        <SummaryCardsGrid items={summaryItems} />
        <AdminAiInsightsSection
          status={aiInsightsStatus}
          data={aiInsights}
          error={aiInsightsError}
          onFetch={fetchInsights}
        />

        {/* 店舗別KPI比較テーブル */}
        <Card className='bg-card shadow-lg'>
          <CardHeader>
            <CardTitle className='text-lg font-semibold text-[#1e3a8a] dark:text-gray-100'>
              {MULTI_STORE_COPY.tableTitle}
            </CardTitle>
            <CardDescription className='text-gray-600 dark:text-gray-300'>
              {MULTI_STORE_COPY.tableDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ClinicsTable
              clinics={clinics}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MultiStorePage;
