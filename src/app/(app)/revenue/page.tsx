'use client';

import React from 'react';
import { useRevenue } from '@/hooks/useRevenue';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';

const RevenuePage: React.FC = () => {
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfile();
  const clinicId = profile?.clinicId || '';

  const {
    dailyRevenue,
    weeklyRevenue,
    monthlyRevenue,
    insuranceRevenue,
    selfPayRevenue,
    trafficAccidentRevenue,
    workersCompRevenue,
    productRevenue,
    ticketRevenue,
    needsReviewCount,
    blockedCount,
    revenueContextSummary,
    careEpisodeMetrics,
    menuRanking,
    hourlyRevenue,
    dailyRevenueByDayOfWeek,
    lastYearRevenue,
    growthRate,
    revenueForecast,
    costAnalysis,
    staffRevenueContribution,
    loading: revenueLoading,
    error: revenueError,
  } = useRevenue(clinicId);

  // プロファイル読み込み中
  if (profileLoading) {
    return (
      <div className='w-full bg-white dark:bg-gray-800 p-4'>
        <div className='max-w-screen-md mx-auto text-center py-8'>
          <p className='text-gray-500'>読み込み中...</p>
        </div>
      </div>
    );
  }

  // プロファイルエラー
  if (profileError) {
    return (
      <div className='w-full bg-white dark:bg-gray-800 p-4'>
        <div className='max-w-screen-md mx-auto text-center py-8'>
          <p className='text-red-500'>エラー: {profileError}</p>
        </div>
      </div>
    );
  }

  // clinicIdがない場合
  if (!clinicId) {
    return (
      <div className='w-full bg-white dark:bg-gray-800 p-4'>
        <div className='max-w-screen-md mx-auto text-center py-8'>
          <p className='text-yellow-600'>店舗情報が設定されていません</p>
        </div>
      </div>
    );
  }

  // 収益データ読み込み中
  if (revenueLoading) {
    return (
      <div className='w-full bg-white dark:bg-gray-800 p-4'>
        <div className='max-w-screen-md mx-auto text-center py-8'>
          <p className='text-gray-500'>収益データを読み込み中...</p>
        </div>
      </div>
    );
  }

  // 収益データエラー
  if (revenueError) {
    return (
      <div className='w-full bg-white dark:bg-gray-800 p-4'>
        <div className='max-w-screen-md mx-auto text-center py-8'>
          <p className='text-red-500'>エラー: {revenueError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className='w-full bg-white dark:bg-gray-800 p-4'>
      <div className='max-w-screen-md mx-auto'>
        <Card className='w-full bg-card mb-4'>
          <CardHeader className='bg-card'>
            <CardTitle className='text-center bg-card'>収益トレンド</CardTitle>
            <CardDescription className='bg-card'>
              日次・週次・月次の売上推移
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            <div className='space-y-4'>
              <div className='flex justify-between items-center'>
                <span>日次売上:</span>
                <span className='font-bold'>
                  {dailyRevenue.toLocaleString()}
                </span>
              </div>
              <div className='flex justify-between items-center'>
                <span>週次売上:</span>
                <span className='font-bold'>
                  {weeklyRevenue.toLocaleString()}
                </span>
              </div>
              <div className='flex justify-between items-center'>
                <span>月次売上:</span>
                <span className='font-bold'>
                  {monthlyRevenue.toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className='w-full bg-card mb-4'>
          <CardHeader className='bg-card'>
            <CardTitle className='text-center bg-card'>売上文脈</CardTitle>
            <CardDescription className='bg-card'>
              分類別の売上と確認状況
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            <div className='grid grid-cols-2 md:grid-cols-3 gap-3'>
              <div className='rounded border p-3'>
                <p className='text-sm text-gray-600 dark:text-gray-300'>
                  交通事故
                </p>
                <p className='font-semibold text-amber-700 dark:text-amber-300'>
                  {trafficAccidentRevenue.toLocaleString()}
                </p>
              </div>
              <div className='rounded border p-3'>
                <p className='text-sm text-gray-600 dark:text-gray-300'>労災</p>
                <p className='font-semibold text-sky-700 dark:text-sky-300'>
                  {workersCompRevenue.toLocaleString()}
                </p>
              </div>
              <div className='rounded border p-3'>
                <p className='text-sm text-gray-600 dark:text-gray-300'>物販</p>
                <p className='font-semibold text-emerald-700 dark:text-emerald-300'>
                  {productRevenue.toLocaleString()}
                </p>
              </div>
              <div className='rounded border p-3'>
                <p className='text-sm text-gray-600 dark:text-gray-300'>
                  回数券
                </p>
                <p className='font-semibold text-fuchsia-700 dark:text-fuchsia-300'>
                  {ticketRevenue.toLocaleString()}
                </p>
              </div>
              <div className='rounded border p-3'>
                <p className='text-sm text-gray-600 dark:text-gray-300'>
                  要確認
                </p>
                <p className='font-semibold text-red-700 dark:text-red-300'>
                  {needsReviewCount.toLocaleString()}
                </p>
              </div>
              <div className='rounded border p-3'>
                <p className='text-sm text-gray-600 dark:text-gray-300'>
                  ブロック
                </p>
                <p className='font-semibold text-gray-800 dark:text-gray-100'>
                  {blockedCount.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className='w-full bg-card mb-4'>
          <CardHeader className='bg-card'>
            <CardTitle className='text-center bg-card'>来院ステージ</CardTitle>
            <CardDescription className='bg-card'>
              care episode別の継続到達状況
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
              <div className='rounded border p-3'>
                <p className='text-sm text-gray-600 dark:text-gray-300'>
                  episode数
                </p>
                <p className='font-semibold text-gray-800 dark:text-gray-100'>
                  {careEpisodeMetrics.totalEpisodes.toLocaleString()}
                </p>
              </div>
              <div className='rounded border p-3'>
                <p className='text-sm text-gray-600 dark:text-gray-300'>
                  初診2回目到達率
                </p>
                <p className='font-semibold text-blue-700 dark:text-blue-300'>
                  {careEpisodeMetrics.secondVisitReachRate.toLocaleString()}%
                </p>
              </div>
              <div className='rounded border p-3'>
                <p className='text-sm text-gray-600 dark:text-gray-300'>
                  初診5回目到達率
                </p>
                <p className='font-semibold text-emerald-700 dark:text-emerald-300'>
                  {careEpisodeMetrics.fifthVisitReachRate.toLocaleString()}%
                </p>
              </div>
              <div className='rounded border p-3'>
                <p className='text-sm text-gray-600 dark:text-gray-300'>
                  平均来院回数
                </p>
                <p className='font-semibold text-violet-700 dark:text-violet-300'>
                  {careEpisodeMetrics.averageVisitsPerEpisode.toLocaleString()}
                </p>
              </div>
              <div className='rounded border p-3 md:col-span-2'>
                <p className='text-sm text-gray-600 dark:text-gray-300'>
                  episode平均売上
                </p>
                <p className='font-semibold text-amber-700 dark:text-amber-300'>
                  {careEpisodeMetrics.averageRevenuePerEpisode.toLocaleString()}
                </p>
              </div>
              <div className='rounded border p-3 md:col-span-2'>
                <p className='text-sm text-gray-600 dark:text-gray-300'>
                  episode継続率
                </p>
                <p className='font-semibold text-teal-700 dark:text-teal-300'>
                  {careEpisodeMetrics.episodeContinuationRate.toLocaleString()}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className='w-full bg-card mb-4'>
          <CardHeader className='bg-card'>
            <CardTitle className='text-center bg-card'>
              売上文脈別サマリ
            </CardTitle>
            <CardDescription className='bg-card'>
              分類別の件数と売上
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            {revenueContextSummary.length === 0 ? (
              <p className='text-gray-500 text-center'>データがありません</p>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead>
                    <tr className='border-b text-left'>
                      <th className='py-2 pr-3 font-medium'>分類</th>
                      <th className='py-2 pr-3 font-medium'>ロールアップ</th>
                      <th className='py-2 pr-3 font-medium text-right'>件数</th>
                      <th className='py-2 pr-3 font-medium text-right'>売上</th>
                      <th className='py-2 pr-3 font-medium text-right'>
                        要確認
                      </th>
                      <th className='py-2 font-medium text-right'>ブロック</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueContextSummary.map(item => (
                      <tr key={item.code} className='border-b last:border-b-0'>
                        <td className='py-2 pr-3'>{item.name}</td>
                        <td className='py-2 pr-3'>{item.rollupCategory}</td>
                        <td className='py-2 pr-3 text-right'>
                          {item.itemCount.toLocaleString()}
                        </td>
                        <td className='py-2 pr-3 text-right'>
                          {item.totalRevenue.toLocaleString()}
                        </td>
                        <td className='py-2 pr-3 text-right'>
                          {item.needsReviewCount.toLocaleString()}
                        </td>
                        <td className='py-2 text-right'>
                          {item.blockedCount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className='w-full bg-card mb-4'>
          <CardHeader className='bg-card'>
            <CardTitle className='text-center bg-card'>
              保険診療 vs 自費診療
            </CardTitle>
            <CardDescription className='bg-card'>詳細分析</CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            <div className='flex flex-col md:flex-row gap-4'>
              <div className='w-full md:w-1/2'>
                <p className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  保険診療:
                </p>
                <p className='text-lg font-semibold text-blue-600 dark:text-blue-400'>
                  {insuranceRevenue.toLocaleString()}
                </p>
              </div>
              <div className='w-full md:w-1/2'>
                <p className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  自費診療:
                </p>
                <p className='text-lg font-semibold text-green-600 dark:text-green-400'>
                  {selfPayRevenue.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className='w-full bg-card mb-4'>
          <CardHeader className='bg-card'>
            <CardTitle className='text-center bg-card'>
              施術メニュー別収益ランキング
            </CardTitle>
            <CardDescription className='bg-card'>
              上位メニューの収益貢献度
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            <div className='space-y-3'>
              {menuRanking.length === 0 ? (
                <p className='text-gray-500 text-center'>データがありません</p>
              ) : (
                menuRanking.map((item, index) => (
                  <div
                    key={index}
                    className='flex items-center justify-between p-3 bg-gray-50 rounded'
                  >
                    <span>{item.menu}</span>
                    <div className='text-right'>
                      <p className='font-bold'>
                        {item.revenue.toLocaleString()}
                      </p>
                      <p className='text-sm text-gray-500'>{item.count}件</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className='w-full bg-card mb-4'>
          <CardHeader className='bg-card'>
            <CardTitle className='text-center bg-card'>
              時間帯別・曜日別収益パターン
            </CardTitle>
            <CardDescription className='bg-card'>
              収益の変動パターン分析
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            <div className='flex flex-col md:flex-row gap-4'>
              <div className='w-full md:w-1/2'>
                <p className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  時間帯別収益:
                </p>
                <p className='text-lg font-semibold text-purple-600 dark:text-purple-400'>
                  {hourlyRevenue || 'データなし'}
                </p>
              </div>
              <div className='w-full md:w-1/2'>
                <p className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  曜日別収益:
                </p>
                <p className='text-lg font-semibold text-orange-600 dark:text-orange-400'>
                  {dailyRevenueByDayOfWeek || 'データなし'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className='w-full bg-card mb-4'>
          <CardHeader className='bg-card'>
            <CardTitle className='text-center bg-card'>
              前年同期比較と成長率
            </CardTitle>
            <CardDescription className='bg-card'>
              過去データとの比較
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            <div className='flex flex-col md:flex-row gap-4'>
              <div className='w-full md:w-1/2'>
                <p className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  前年同期売上:
                </p>
                <p className='text-lg font-semibold text-red-600 dark:text-red-400'>
                  {lastYearRevenue.toLocaleString()}
                </p>
              </div>
              <div className='w-full md:w-1/2'>
                <p className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  成長率:
                </p>
                <p className='text-lg font-semibold text-teal-600 dark:text-teal-400'>
                  {growthRate}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className='w-full bg-card mb-4'>
          <CardHeader className='bg-card'>
            <CardTitle className='text-center bg-card'>
              収益予測とシミュレーション
            </CardTitle>
            <CardDescription className='bg-card'>
              将来の収益予測
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            <p className='text-sm font-medium text-gray-700 dark:text-gray-300'>
              予測収益:
            </p>
            <p className='text-lg font-semibold text-indigo-600 dark:text-indigo-400'>
              {revenueForecast.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card className='w-full bg-card mb-4'>
          <CardHeader className='bg-card'>
            <CardTitle className='text-center bg-card'>コスト分析</CardTitle>
            <CardDescription className='bg-card'>人件費率など</CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            <p className='text-sm font-medium text-gray-700 dark:text-gray-300'>
              人件費率:
            </p>
            <p className='text-lg font-semibold text-pink-600 dark:text-pink-400'>
              {costAnalysis || 'データなし'}
            </p>
          </CardContent>
        </Card>

        <Card className='w-full bg-card'>
          <CardHeader className='bg-card'>
            <CardTitle className='text-center bg-card'>
              施術者別収益貢献度
            </CardTitle>
            <CardDescription className='bg-card'>
              スタッフごとの収益貢献度
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            <p className='text-sm font-medium text-gray-700 dark:text-gray-300'>
              貢献度:
            </p>
            <p className='text-lg font-semibold text-lime-600 dark:text-lime-400'>
              {staffRevenueContribution || 'データなし'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RevenuePage;
