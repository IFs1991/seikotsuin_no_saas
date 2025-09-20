'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowRight } from 'lucide-react';

// Dummy data for 46 clinics
interface ClinicPerformance {
  id: number;
  name: string;
  revenue: number;
  patients: number;
  satisfaction: number;
  kpi_score: number;
  isProblematic: boolean;
}

const generateDummyData = (numClinics: number): ClinicPerformance[] => {
  const data: ClinicPerformance[] = [];
  for (let i = 1; i <= numClinics; i++) {
    const revenue = Math.floor(Math.random() * 1000000 + 500000); // 50万-150万
    const patients = Math.floor(Math.random() * 200 + 50); // 50-250人
    const satisfaction = parseFloat((Math.random() * 1 + 4).toFixed(1)); // 4.0-5.0
    // KPI score calculation: higher revenue, more patients, higher satisfaction = higher score
    const kpi_score = parseFloat(
      (
        (revenue / 1500000) * 0.4 +
        (patients / 250) * 0.3 +
        (satisfaction / 5) * 0.3
      ).toFixed(2)
    );
    const isProblematic = kpi_score < 0.6 || revenue < 600000; // Example condition for problematic
    data.push({
      id: i,
      name: `店舗 ${String(i).padStart(2, '0')}`,
      revenue,
      patients,
      satisfaction,
      kpi_score,
      isProblematic,
    });
  }
  return data;
};

const AdminDashboardPage: React.FC = () => {
  const [clinicData, setClinicData] = useState<ClinicPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate data fetching
    const fetchData = async () => {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API call
      setClinicData(generateDummyData(46));
      setLoading(false);
    };
    fetchData();

    // Simulate real-time updates (e.g., every 30 seconds)
    const interval = setInterval(() => {
      setClinicData(generateDummyData(46));
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const totalRevenue = clinicData.reduce(
    (sum, clinic) => sum + clinic.revenue,
    0
  );
  const totalPatients = clinicData.reduce(
    (sum, clinic) => sum + clinic.patients,
    0
  );
  const avgSatisfaction =
    clinicData.length > 0
      ? clinicData.reduce((sum, clinic) => sum + clinic.satisfaction, 0) /
        clinicData.length
      : 0;
  const problematicClinics = clinicData.filter(clinic => clinic.isProblematic);

  const formatCurrency = (value: number) => `¥${value.toLocaleString()}`;

  return (
    <div className='bg-white dark:bg-gray-800 min-h-screen p-8'>
      <div className='max-w-4xl mx-auto'>
        <Card className='w-full bg-card'>
          <CardHeader className='bg-card'>
            <CardTitle className='bg-card text-[#111827] dark:text-[#f9fafb] text-center text-2xl font-bold'>
              Admin統合管理ダッシュボード
            </CardTitle>
            <CardDescription className='bg-card text-[#111827] dark:text-[#f9fafb] text-center mt-2'>
              全46店舗のリアルタイムパフォーマンス、KPIランキング、グループ全体の統計情報を表示します。
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card p-6 space-y-8'>
            {loading ? (
              <div className='text-center text-[#111827] dark:text-[#f9fafb]'>
                データを読み込み中...
              </div>
            ) : (
              <>
                {/* グループ全体のKPIサマリー */}
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                  <Card className='bg-card p-4 shadow-sm'>
                    <CardTitle className='text-lg font-semibold text-[#1e3a8a] dark:text-[#10b981]'>
                      総売上
                    </CardTitle>
                    <CardContent className='text-3xl font-bold text-[#111827] dark:text-[#f9fafb] mt-2'>
                      {formatCurrency(totalRevenue)}
                    </CardContent>
                  </Card>
                  <Card className='bg-card p-4 shadow-sm'>
                    <CardTitle className='text-lg font-semibold text-[#1e3a8a] dark:text-[#10b981]'>
                      総患者数
                    </CardTitle>
                    <CardContent className='text-3xl font-bold text-[#111827] dark:text-[#f9fafb] mt-2'>
                      {totalPatients.toLocaleString()}人
                    </CardContent>
                  </Card>
                  <Card className='bg-card p-4 shadow-sm'>
                    <CardTitle className='text-lg font-semibold text-[#1e3a8a] dark:text-[#10b981]'>
                      平均患者満足度
                    </CardTitle>
                    <CardContent className='text-3xl font-bold text-[#111827] dark:text-[#f9fafb] mt-2'>
                      {avgSatisfaction.toFixed(1)} / 5.0
                    </CardContent>
                  </Card>
                </div>

                {/* 問題店舗のアラート表示 */}
                {problematicClinics.length > 0 && (
                  <Card className='bg-card border-l-4 border-red-500 p-4 shadow-sm'>
                    <CardTitle className='text-lg font-semibold text-red-600 dark:text-red-400 flex items-center'>
                      <CheckCircle className='h-5 w-5 mr-2 text-red-500' />
                      問題店舗アラート
                    </CardTitle>
                    <CardContent className='text-[#111827] dark:text-[#f9fafb] mt-2'>
                      以下の店舗でパフォーマンス低下が検出されました:
                      <ul className='list-disc list-inside mt-2'>
                        {problematicClinics.map(clinic => (
                          <li key={clinic.id} className='text-sm'>
                            <span className='font-medium'>{clinic.name}</span>{' '}
                            (KPIスコア: {clinic.kpi_score.toFixed(2)})
                          </li>
                        ))}
                      </ul>
                      <Button className='mt-4 bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white dark:bg-[#10b981] dark:hover:bg-[#10b981]/90'>
                        詳細を確認 <ArrowRight className='ml-2 h-4 w-4' />
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* 店舗別パフォーマンスグリッド */}
                <div>
                  <h3 className='text-xl font-semibold text-[#1e3a8a] dark:text-[#10b981] mb-4'>
                    店舗別パフォーマンス
                  </h3>
                  <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-96 overflow-y-auto'>
                    {clinicData
                      .sort((a, b) => b.kpi_score - a.kpi_score) // Sort by KPI score
                      .map(clinic => (
                        <Card
                          key={clinic.id}
                          className={`bg-card p-4 shadow-sm ${clinic.isProblematic ? 'border-2 border-red-400' : ''}`}
                        >
                          <CardTitle className='text-md font-bold text-[#111827] dark:text-[#f9fafb]'>
                            {clinic.name}
                          </CardTitle>
                          <CardContent className='text-sm text-[#111827] dark:text-[#f9fafb] mt-2'>
                            <p>
                              売上:{' '}
                              <span className='font-medium'>
                                {formatCurrency(clinic.revenue)}
                              </span>
                            </p>
                            <p>
                              患者数:{' '}
                              <span className='font-medium'>
                                {clinic.patients}人
                              </span>
                            </p>
                            <p>
                              満足度:{' '}
                              <span className='font-medium'>
                                {clinic.satisfaction.toFixed(1)}
                              </span>
                            </p>
                            <p>
                              KPIスコア:{' '}
                              <span className='font-medium text-[#10b981]'>
                                {clinic.kpi_score.toFixed(2)}
                              </span>
                            </p>
                            <Button
                              variant='link'
                              className='p-0 h-auto text-[#1e3a8a] dark:text-[#10b981]'
                            >
                              詳細へ
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </div>

                {/* エクスポート機能 */}
                <div className='flex justify-end mt-8'>
                  <Button className='bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white dark:bg-[#10b981] dark:hover:bg-[#10b981]/90'>
                    経営レポートをエクスポート
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
