'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { useMultiStore, ClinicWithKPI } from '@/hooks/useMultiStore';

type SortDirection = 'asc' | 'desc';
type SortField = 'revenue' | 'patients' | 'performance';

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

interface ClinicsTableProps {
  clinics: readonly ClinicWithKPI[];
  sortField: SortField | null;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat('ja-JP');
const TABLE_HEADER_CLASS =
  'px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider';
const TABLE_CELL_CLASS =
  'px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300';

const formatCurrency = (value: number): string =>
  CURRENCY_FORMATTER.format(value);

const formatPerformanceScore = (value: number | null | undefined): string =>
  value === null || value === undefined ? '-' : String(value);

function SummaryCard({ label, value, testId }: SummaryCardProps) {
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
}

const SortableHeader = React.memo(function SortableHeader({
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

const ClinicStatusBadge = React.memo(function ClinicStatusBadge({
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

const ClinicsTable = React.memo(function ClinicsTable({
  clinics,
  sortField,
  sortDirection,
  onSort,
}: ClinicsTableProps) {
  if (clinics.length === 0) {
    return (
      <p className='text-gray-500 dark:text-gray-400 text-center py-8'>
        クリニックデータがありません
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

const MultiStorePage = () => {
  const {
    clinics,
    loading,
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

      if (field === 'revenue') {
        sortByRevenue(newDirection);
      } else if (field === 'patients') {
        sortByPatients(newDirection);
      } else if (field === 'performance') {
        sortByPerformance(newDirection);
      }
    },
    [sortByPatients, sortByPerformance, sortByRevenue, sortDirection, sortField]
  );

  if (loading) {
    return (
      <div className='bg-white dark:bg-gray-800 min-h-screen flex items-center justify-center text-gray-900 dark:text-gray-100'>
        <div
          data-testid='loading-spinner'
          className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600'
        ></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='bg-white dark:bg-gray-800 min-h-screen flex items-center justify-center text-red-600 dark:text-red-400'>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className='bg-white dark:bg-gray-800 min-h-screen text-gray-900 dark:text-gray-100 p-4'>
      <div className='max-w-6xl mx-auto py-8'>
        <h1 className='text-2xl font-bold text-center text-[#1e3a8a] dark:text-gray-100 mb-8'>
          多店舗分析
        </h1>

        {/* サマリーカード */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-8'>
          <SummaryCard
            label='合計収益'
            value={`${formatCurrency(totalRevenue)}円`}
            testId='total-revenue'
          />
          <SummaryCard
            label='合計患者数'
            value={`${totalPatients}人`}
            testId='total-patients'
          />
          <SummaryCard
            label='平均パフォーマンス'
            value={
              averagePerformanceScore !== null
                ? averagePerformanceScore.toFixed(2)
                : '-'
            }
            testId='average-performance'
          />
        </div>

        {/* 店舗別KPI比較テーブル */}
        <Card className='bg-card shadow-lg'>
          <CardHeader>
            <CardTitle className='text-lg font-semibold text-[#1e3a8a] dark:text-gray-100'>
              店舗別KPI比較
            </CardTitle>
            <CardDescription className='text-gray-600 dark:text-gray-300'>
              各店舗の主要指標を比較します。ヘッダーをクリックでソートできます。
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
