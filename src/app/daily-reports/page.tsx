'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api, isSuccessResponse } from '@/lib/api-client';
import { useUserProfileContext } from '@/providers/user-profile-context';

type ReportRow = {
  id: string | number;
  date: string;
  patients: number;
  revenue: number;
};

type Summary = {
  totalReports: number;
  averagePatients: number;
  averageRevenue: number;
  totalRevenue: number;
};

type MonthlyTrend = {
  month: string;
  reports: number;
  totalPatients: number;
  totalRevenue: number;
};

const Page: React.FC = () => {
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfileContext();
  const clinicId = profile?.clinicId ?? null;

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyTrend[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchReports = async () => {
      if (!clinicId) {
        setRows([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await api.dailyReports.get(clinicId);
        const data = (res as any)?.data as any;
        if (isSuccessResponse(res) && data?.reports) {
          const mapped: ReportRow[] = data.reports.map(
            (r: any, idx: number) => ({
              id: r.id || idx,
              date: r.reportDate,
              patients: r.totalPatients || 0,
              revenue: Number(r.totalRevenue || 0),
            })
          );

          if (!cancelled) {
            setRows(mapped);
            setSummary(data.summary || null);
            setMonthlyTrends(data.monthlyTrends || []);
          }
        } else if (!cancelled) {
          setError('日報データの取得に失敗しました');
        }
      } catch (e) {
        if (!cancelled) {
          setError('日報データの取得に失敗しました');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchReports();

    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  const isLoading = profileLoading || loading;
  const hasClinic = Boolean(clinicId);
  const displayError = error;

  if (profileError && !profileLoading) {
    return (
      <div className='bg-white dark:bg-gray-800 min-h-screen py-8'>
        <div className='container mx-auto px-4'>
          <Card className='w-full bg-card'>
            <CardHeader className='bg-card'>
              <CardTitle className='text-red-600'>
                プロフィール取得に失敗しました
              </CardTitle>
            </CardHeader>
            <CardContent className='bg-card space-y-4'>
              <p className='text-gray-700 dark:text-gray-300'>{profileError}</p>
              <Button
                onClick={() => window.location.reload()}
                className='bg-blue-600 text-white'
              >
                再読み込み
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className='bg-white dark:bg-gray-800 min-h-screen py-8'>
      <div className='container mx-auto px-4'>
        <Card className='w-full bg-card mb-8'>
          <CardHeader className='bg-card'>
            <CardTitle className='bg-card'>デジタル日報管理</CardTitle>
            <CardDescription className='bg-card'>
              本日の日報を入力・管理します。
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            <div className='space-y-4'>
              <p className='text-gray-600'>日報の入力・管理を行います</p>
              <Link href='/daily-reports/input'>
                <Button className='bg-blue-600 text-white'>日報を入力</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {summary && (
          <Card className='w-full bg-card mb-8'>
            <CardHeader className='bg-card'>
              <CardTitle className='bg-card'>サマリー</CardTitle>
              <CardDescription className='bg-card'>
                日報の集計データを表示します。
              </CardDescription>
            </CardHeader>
            <CardContent className='bg-card'>
              <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                <div className='text-center p-4 bg-gray-50 dark:bg-gray-700 rounded'>
                  <p className='text-2xl font-bold text-blue-600'>
                    {summary.totalReports}
                  </p>
                  <p className='text-sm text-gray-600 dark:text-gray-400'>
                    登録日報数
                  </p>
                </div>
                <div className='text-center p-4 bg-gray-50 dark:bg-gray-700 rounded'>
                  <p className='text-2xl font-bold text-blue-600'>
                    {Math.round(summary.averagePatients)}
                  </p>
                  <p className='text-sm text-gray-600 dark:text-gray-400'>
                    平均患者数/日
                  </p>
                </div>
                <div className='text-center p-4 bg-gray-50 dark:bg-gray-700 rounded'>
                  <p className='text-2xl font-bold text-blue-600'>
                    {Math.round(summary.averageRevenue).toLocaleString()}
                  </p>
                  <p className='text-sm text-gray-600 dark:text-gray-400'>
                    平均売上/日
                  </p>
                </div>
                <div className='text-center p-4 bg-gray-50 dark:bg-gray-700 rounded'>
                  <p className='text-2xl font-bold text-blue-600'>
                    {Math.round(summary.totalRevenue).toLocaleString()}
                  </p>
                  <p className='text-sm text-gray-600 dark:text-gray-400'>
                    累計売上
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {monthlyTrends.length > 0 && (
          <Card className='w-full bg-card mb-8'>
            <CardHeader className='bg-card'>
              <CardTitle className='bg-card'>月別トレンド</CardTitle>
              <CardDescription className='bg-card'>
                月ごとの日報集計データを表示します。
              </CardDescription>
            </CardHeader>
            <CardContent className='bg-card'>
              <div className='space-y-3'>
                {monthlyTrends.map((trend, index) => (
                  <div
                    key={index}
                    className='flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded'
                  >
                    <div className='font-medium text-gray-900 dark:text-gray-100'>
                      {trend.month}
                    </div>
                    <div className='flex space-x-6 text-sm'>
                      <div className='text-gray-600 dark:text-gray-400'>
                        <span className='font-medium'>{trend.reports}</span> 件
                      </div>
                      <div className='text-gray-600 dark:text-gray-400'>
                        患者:{' '}
                        <span className='font-medium'>
                          {trend.totalPatients}
                        </span>{' '}
                        名
                      </div>
                      <div className='text-gray-600 dark:text-gray-400'>
                        売上:{' '}
                        <span className='font-medium'>
                          {Math.round(trend.totalRevenue).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className='w-full bg-card'>
          <CardHeader className='bg-card'>
            <CardTitle className='bg-card'>施術記録一覧</CardTitle>
            <CardDescription className='bg-card'>
              最近の日報サマリーを表示します。
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            {isLoading ? (
              <div className='text-gray-500'>読み込み中...</div>
            ) : !hasClinic ? (
              <div className='text-gray-500'>
                アクセス可能なクリニックが割り当てられていません。
              </div>
            ) : displayError ? (
              <div className='text-red-500'>{displayError}</div>
            ) : (
              <div className='space-y-3'>
                {rows.length === 0 ? (
                  <div className='text-gray-500'>
                    表示できる日報がありません。
                  </div>
                ) : (
                  rows.map(report => (
                    <div
                      key={report.id}
                      className='flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded'
                    >
                      <div className='flex-1'>
                        <div className='font-medium text-gray-900 dark:text-gray-100'>
                          {report.date}
                        </div>
                        <div className='text-sm text-gray-600 dark:text-gray-400 mt-1'>
                          <span className='mr-4'>
                            患者数: {report.patients}名
                          </span>
                          <span>売上: {report.revenue.toLocaleString()}</span>
                        </div>
                      </div>
                      <Link href={`/daily-reports/edit/${report.id}`}>
                        <Button variant='outline' size='sm' className='ml-3'>
                          編集
                        </Button>
                      </Link>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Page;
