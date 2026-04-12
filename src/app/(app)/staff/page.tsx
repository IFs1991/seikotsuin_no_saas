'use client';

import React, { useState } from 'react';
import { useStaffAnalysis } from '@/hooks/useStaffAnalysis';
import { useUserProfileContext } from '@/providers/user-profile-context';
import ShiftOptimizer from '@/components/staff/shift-optimizer';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const StaffManagementPage: React.FC = () => {
  const {
    staffMetrics,
    revenueRanking,
    satisfactionCorrelation,
    shiftAnalysis,
    totalStaff,
    activeStaff,
    isLoading,
    error,
  } = useStaffAnalysis();

  const { profile } = useUserProfileContext();
  const clinicId = profile?.clinicId ?? '';

  const [activeTab, setActiveTab] = useState<
    'performance' | 'shifts' | 'optimizer'
  >('performance');

  if (isLoading) {
    return (
      <div className='flex items-center justify-center min-h-screen bg-[#f9fafb] dark:bg-[#1a1a1a]'>
        <div
          className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1e3a8a]'
          role='status'
          aria-label='Loading'
        ></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen'>
        <Card className='max-w-[1200px] mx-auto bg-card border border-red-200'>
          <CardHeader>
            <CardTitle className='text-red-600'>
              データ取得に失敗しました
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const maxHourlyCount = Math.max(
    ...shiftAnalysis.hourlyReservations.map(h => h.count),
    1
  );

  return (
    <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen'>
      <div className='max-w-[1200px] mx-auto space-y-6'>
        {/* ヘッダー */}
        <div className='flex items-center justify-between'>
          <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
            スタッフ分析とシフト最適化
          </h1>
          <div className='flex items-center gap-2'>
            <Badge variant='secondary'>総スタッフ: {totalStaff}名</Badge>
            <Badge variant='outline'>稼働中: {activeStaff}名</Badge>
          </div>
        </div>

        {/* メトリクスカード */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <Card className='bg-card'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-gray-500'>
                平均患者数/日
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-3xl font-bold text-gray-900 dark:text-gray-100'>
                {staffMetrics.dailyPatients.toFixed(1)}
              </p>
            </CardContent>
          </Card>
          <Card className='bg-card'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-gray-500'>
                総売上
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-3xl font-bold text-gray-900 dark:text-gray-100'>
                ¥{staffMetrics.totalRevenue.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card className='bg-card'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-gray-500'>
                平均満足度
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-3xl font-bold text-gray-900 dark:text-gray-100'>
                {staffMetrics.averageSatisfaction.toFixed(2)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* タブ */}
        <Card className='bg-card'>
          <CardContent className='pt-6'>
            <div className='mb-4'>
              <div className='flex space-x-2'>
                <button
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    activeTab === 'performance'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  onClick={() => setActiveTab('performance')}
                >
                  パフォーマンス
                </button>
                <button
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    activeTab === 'shifts'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  onClick={() => setActiveTab('shifts')}
                >
                  シフト分析
                </button>
                <button
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    activeTab === 'optimizer'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  onClick={() => setActiveTab('optimizer')}
                >
                  シフト最適化
                </button>
              </div>
            </div>

            {activeTab === 'performance' && (
              <div className='space-y-6'>
                {/* 売上ランキング */}
                <div>
                  <h3 className='text-lg font-semibold mb-4 text-[#111827] dark:text-[#f3f4f6]'>
                    売上ランキング
                  </h3>
                  {revenueRanking.length === 0 ? (
                    <p className='text-gray-500'>データがありません</p>
                  ) : (
                    <div className='overflow-x-auto'>
                      <table className='w-full text-sm'>
                        <thead>
                          <tr className='border-b'>
                            <th className='text-left py-2 px-3'>順位</th>
                            <th className='text-left py-2 px-3'>スタッフ名</th>
                            <th className='text-right py-2 px-3'>売上</th>
                            <th className='text-right py-2 px-3'>患者数</th>
                            <th className='text-right py-2 px-3'>満足度</th>
                          </tr>
                        </thead>
                        <tbody>
                          {revenueRanking.map((staff, index) => (
                            <tr key={staff.staff_id} className='border-b'>
                              <td className='py-2 px-3'>
                                <Badge
                                  variant={index < 3 ? 'default' : 'secondary'}
                                  className={
                                    index === 0
                                      ? 'bg-yellow-500'
                                      : index === 1
                                        ? 'bg-gray-400'
                                        : index === 2
                                          ? 'bg-amber-600'
                                          : ''
                                  }
                                >
                                  {index + 1}
                                </Badge>
                              </td>
                              <td className='py-2 px-3 font-medium'>
                                {staff.name}
                              </td>
                              <td className='py-2 px-3 text-right'>
                                ¥{staff.revenue.toLocaleString()}
                              </td>
                              <td className='py-2 px-3 text-right'>
                                {staff.patients}
                              </td>
                              <td className='py-2 px-3 text-right'>
                                {staff.satisfaction.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 満足度と売上の相関 */}
                <div>
                  <h3 className='text-lg font-semibold mb-4 text-[#111827] dark:text-[#f3f4f6]'>
                    満足度と売上の相関
                  </h3>
                  {satisfactionCorrelation.length === 0 ? (
                    <p className='text-gray-500'>データがありません</p>
                  ) : (
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                      {satisfactionCorrelation.map(staff => (
                        <div
                          key={staff.name}
                          className='border rounded-lg p-4 bg-white dark:bg-gray-800'
                        >
                          <p className='font-semibold text-gray-900 dark:text-gray-100'>
                            {staff.name}
                          </p>
                          <div className='mt-2 space-y-1 text-sm'>
                            <div className='flex justify-between'>
                              <span className='text-gray-500'>満足度:</span>
                              <span className='font-medium'>
                                {staff.satisfaction.toFixed(2)}
                              </span>
                            </div>
                            <div className='flex justify-between'>
                              <span className='text-gray-500'>売上:</span>
                              <span className='font-medium'>
                                ¥{staff.revenue.toLocaleString()}
                              </span>
                            </div>
                            <div className='flex justify-between'>
                              <span className='text-gray-500'>患者数:</span>
                              <span className='font-medium'>
                                {staff.patients}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'shifts' && (
              <div className='space-y-6'>
                {/* 稼働率 */}
                <div className='flex items-center gap-4'>
                  <span className='text-gray-500'>稼働率:</span>
                  <div className='flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-4'>
                    <div
                      className={`h-4 rounded-full ${
                        shiftAnalysis.utilizationRate < 50
                          ? 'bg-yellow-500'
                          : shiftAnalysis.utilizationRate > 85
                            ? 'bg-red-500'
                            : 'bg-green-500'
                      }`}
                      style={{
                        width: `${Math.min(shiftAnalysis.utilizationRate, 100)}%`,
                      }}
                    />
                  </div>
                  <span className='font-bold text-xl'>
                    {shiftAnalysis.utilizationRate}%
                  </span>
                </div>

                {/* 時間帯別予約数 */}
                <div>
                  <p className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                    時間帯別予約数（過去30日）
                  </p>
                  <div className='flex items-end gap-1 h-32'>
                    {shiftAnalysis.hourlyReservations
                      .filter(h => h.hour >= 8 && h.hour <= 21)
                      .map(h => (
                        <div
                          key={h.hour}
                          className='flex-1 flex flex-col items-center'
                        >
                          <div
                            className='w-full bg-blue-500 rounded-t'
                            style={{
                              height: `${(h.count / maxHourlyCount) * 100}%`,
                              minHeight: h.count > 0 ? '4px' : '0',
                            }}
                            title={`${h.hour}時: ${h.count}件`}
                          />
                          <span className='text-xs text-gray-500 mt-1'>
                            {h.hour}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* 推奨事項 */}
                <div>
                  <p className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                    推奨事項
                  </p>
                  <div className='space-y-2'>
                    {shiftAnalysis.recommendations.map((rec, index) => (
                      <div
                        key={index}
                        className='flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg'
                      >
                        <Badge variant='secondary' className='mt-0.5'>
                          {index + 1}
                        </Badge>
                        <p className='text-sm text-gray-700 dark:text-gray-300'>
                          {rec}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'optimizer' && (
              <div className='space-y-6'>
                <ShiftOptimizer clinicId={clinicId} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StaffManagementPage;
