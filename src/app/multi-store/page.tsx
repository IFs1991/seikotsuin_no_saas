'use client';

import React, { useEffect, useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { useMultiStore, ClinicWithKPI } from '@/hooks/useMultiStore';

type SortDirection = 'asc' | 'desc';
type SortField = 'revenue' | 'patients' | 'performance' | null;

const MultiStorePage: React.FC = () => {
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

  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    fetchClinicsWithKPI();
  }, [fetchClinicsWithKPI]);

  const handleSort = (field: 'revenue' | 'patients' | 'performance') => {
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
  };

  const formatCurrency = (value: number): string => {
    return value.toLocaleString('ja-JP');
  };

  if (loading) {
    return (
      <div className='bg-white dark:bg-gray-800 min-h-screen flex items-center justify-center text-gray-900 dark:text-gray-100'>
        <div data-testid='loading-spinner' className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600'></div>
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
          <Card className='bg-card shadow-md'>
            <CardHeader className='pb-2'>
              <CardDescription className='text-gray-600 dark:text-gray-300'>
                合計収益
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p
                data-testid='total-revenue'
                className='text-2xl font-bold text-[#1e3a8a] dark:text-gray-100'
              >
                {formatCurrency(totalRevenue)}円
              </p>
            </CardContent>
          </Card>

          <Card className='bg-card shadow-md'>
            <CardHeader className='pb-2'>
              <CardDescription className='text-gray-600 dark:text-gray-300'>
                合計患者数
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p
                data-testid='total-patients'
                className='text-2xl font-bold text-[#1e3a8a] dark:text-gray-100'
              >
                {totalPatients}人
              </p>
            </CardContent>
          </Card>

          <Card className='bg-card shadow-md'>
            <CardHeader className='pb-2'>
              <CardDescription className='text-gray-600 dark:text-gray-300'>
                平均パフォーマンス
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p
                data-testid='average-performance'
                className='text-2xl font-bold text-[#1e3a8a] dark:text-gray-100'
              >
                {averagePerformanceScore !== null
                  ? averagePerformanceScore.toFixed(2)
                  : '-'}
              </p>
            </CardContent>
          </Card>
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
            {clinics.length > 0 ? (
              <div className='overflow-x-auto'>
                <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
                  <thead className='bg-gray-50 dark:bg-gray-700'>
                    <tr>
                      <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                        店舗名
                      </th>
                      <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                        <button
                          type='button'
                          onClick={() => handleSort('revenue')}
                          className='flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400'
                        >
                          収益
                          {sortField === 'revenue' && (
                            <span>{sortDirection === 'desc' ? '▼' : '▲'}</span>
                          )}
                        </button>
                      </th>
                      <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                        <button
                          type='button'
                          onClick={() => handleSort('patients')}
                          className='flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400'
                        >
                          患者数
                          {sortField === 'patients' && (
                            <span>{sortDirection === 'desc' ? '▼' : '▲'}</span>
                          )}
                        </button>
                      </th>
                      <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                        <button
                          type='button'
                          onClick={() => handleSort('performance')}
                          className='flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400'
                        >
                          パフォーマンス
                          {sortField === 'performance' && (
                            <span>{sortDirection === 'desc' ? '▼' : '▲'}</span>
                          )}
                        </button>
                      </th>
                      <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                        ステータス
                      </th>
                    </tr>
                  </thead>
                  <tbody className='bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700'>
                    {clinics.map((clinic: ClinicWithKPI) => (
                      <tr key={clinic.id}>
                        <td className='px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100'>
                          {clinic.name}
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300'>
                          {formatCurrency(clinic.kpi?.revenue ?? 0)}円
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300'>
                          {clinic.kpi?.patients ?? 0}
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300'>
                          {clinic.kpi?.staff_performance_score ?? '-'}
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap text-sm'>
                          <span
                            className={`px-2 py-1 rounded-full text-xs ${
                              clinic.is_active
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            }`}
                          >
                            {clinic.is_active ? '有効' : '無効'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className='text-gray-500 dark:text-gray-400 text-center py-8'>
                クリニックデータがありません
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MultiStorePage;
