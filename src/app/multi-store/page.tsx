import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMultiStore } from '../../hooks/useMultiStore';
import { StoreComparisonChart } from '../../components/multi-store/store-comparison-chart';
import { BestPracticeCard } from '../../components/multi-store/best-practice-card';

const MultiStorePage: React.FC = () => {
  const {
    storeKpis,
    bestPractices,
    comparisonData,
    loading,
    error,
    filterStores: _filterStores, // 未使用だが、useMultiStoreのcontentに記載があるため含める
    selectKpi: _selectKpi, // 未使用だが、useMultiStoreのcontentに記載があるため含める
    generateReport,
  } = useMultiStore();

  if (loading) {
    return (
      <div className='bg-white dark:bg-gray-800 min-h-screen flex items-center justify-center text-gray-900 dark:text-gray-100'>
        <p>データを読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className='bg-white dark:bg-gray-800 min-h-screen flex items-center justify-center text-red-600 dark:text-red-400'>
        <p>エラーが発生しました: {error.message}</p>
      </div>
    );
  }

  return (
    <div className='bg-white dark:bg-gray-800 min-h-screen text-gray-900 dark:text-gray-100 p-4'>
      <div className='max-w-4xl mx-auto py-8'>
        <Card className='w-full bg-card shadow-lg rounded-lg'>
          <CardHeader className='bg-card pb-4'>
            <CardTitle className='text-2xl font-bold text-center text-[#1e3a8a] dark:text-gray-100'>
              マルチ店舗比較分析
            </CardTitle>
            <CardDescription className='text-center text-gray-600 dark:text-gray-300 mt-2'>
              全店舗のパフォーマンスを比較し、ベストプラクティスを共有します。
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card space-y-8 pt-4'>
            {/* 店舗別KPIランキング */}
            <Card className='bg-card shadow-md'>
              <CardHeader className='bg-card'>
                <CardTitle className='text-lg font-semibold text-[#1e3a8a] dark:text-gray-100'>
                  店舗別KPIランキング
                </CardTitle>
                <CardDescription className='text-gray-600 dark:text-gray-300'>
                  主要な経営指標に基づいた店舗のランキングです。
                </CardDescription>
              </CardHeader>
              <CardContent className='bg-card'>
                {storeKpis && storeKpis.length > 0 ? (
                  <div className='overflow-x-auto'>
                    <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
                      <thead className='bg-gray-50 dark:bg-gray-700'>
                        <tr>
                          <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                            店舗名
                          </th>
                          <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                            売上
                          </th>
                          <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                            患者数
                          </th>
                          <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                            満足度
                          </th>
                        </tr>
                      </thead>
                      <tbody className='bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700'>
                        {storeKpis.map((kpi, index) => (
                          <tr key={index}>
                            <td className='px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100'>
                              {kpi.clinicName}
                            </td>
                            <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300'>
                              ¥{kpi.revenue.toLocaleString()}
                            </td>
                            <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300'>
                              {kpi.patients}人
                            </td>
                            <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300'>
                              {kpi.satisfaction}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className='text-gray-500 dark:text-gray-400'>
                    KPIデータがありません。
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 店舗間比較チャート */}
            <Card className='bg-card shadow-md'>
              <CardHeader className='bg-card'>
                <CardTitle className='text-lg font-semibold text-[#1e3a8a] dark:text-gray-100'>
                  店舗間比較チャート
                </CardTitle>
                <CardDescription className='text-gray-600 dark:text-gray-300'>
                  選択したKPIに基づいた店舗間の比較グラフです。
                </CardDescription>
              </CardHeader>
              <CardContent className='bg-card'>
                {comparisonData ? (
                  <StoreComparisonChart data={comparisonData} />
                ) : (
                  <p className='text-gray-500 dark:text-gray-400'>
                    比較データがありません。
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ベストプラクティス */}
            <Card className='bg-card shadow-md'>
              <CardHeader className='bg-card'>
                <CardTitle className='text-lg font-semibold text-[#1e3a8a] dark:text-gray-100'>
                  ベストプラクティス
                </CardTitle>
                <CardDescription className='text-gray-600 dark:text-gray-300'>
                  成功している店舗の施策やノウハウを共有します。
                </CardDescription>
              </CardHeader>
              <CardContent className='bg-card grid grid-cols-1 md:grid-cols-2 gap-4'>
                {bestPractices && bestPractices.length > 0 ? (
                  bestPractices.map((practice, index) => (
                    <BestPracticeCard key={index} practice={practice} />
                  ))
                ) : (
                  <p className='text-gray-500 dark:text-gray-400'>
                    ベストプラクティスがありません。
                  </p>
                )}
              </CardContent>
            </Card>

            {/* その他の機能 */}
            <Card className='bg-card shadow-md'>
              <CardHeader className='bg-card'>
                <CardTitle className='text-lg font-semibold text-[#1e3a8a] dark:text-gray-100'>
                  その他の分析機能
                </CardTitle>
                <CardDescription className='text-gray-600 dark:text-gray-300'>
                  詳細な分析やレポート生成が可能です。
                </CardDescription>
              </CardHeader>
              <CardContent className='bg-card flex flex-wrap gap-4'>
                <Button className='bg-[#1e3a8a] hover:bg-[#10b981] text-white dark:bg-gray-700 dark:hover:bg-gray-600'>
                  ドリルダウン分析
                </Button>
                <Button className='bg-[#1e3a8a] hover:bg-[#10b981] text-white dark:bg-gray-700 dark:hover:bg-gray-600'>
                  施術者別クロス店舗分析
                </Button>
                <Button
                  onClick={generateReport}
                  className='bg-[#1e3a8a] hover:bg-[#10b981] text-white dark:bg-gray-700 dark:hover:bg-gray-600'
                >
                  レポート生成・共有
                </Button>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MultiStorePage;
