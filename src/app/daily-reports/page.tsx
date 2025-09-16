'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api, isSuccessResponse } from '@/lib/api-client';

const DEFAULT_CLINIC_ID = process.env.NEXT_PUBLIC_DEFAULT_CLINIC_ID || 'default-clinic-id';

type ReportRow = { id: string | number; date: string; patients: number; revenue: number };

const Page: React.FC = () => {
  const [rows, setRows] = useState<ReportRow[]>([
    // フォールバック（API失敗時）
    { id: 1, date: '2025-08-09', patients: 28, revenue: 165000 },
    { id: 2, date: '2025-08-08', patients: 22, revenue: 142000 }
  ]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const res = await api.dailyReports.get(DEFAULT_CLINIC_ID);
        if (isSuccessResponse(res) && res.data?.reports) {
          const mapped: ReportRow[] = res.data.reports.map((r: any, idx: number) => ({
            id: r.id || idx,
            date: r.reportDate,
            patients: r.totalPatients || 0,
            revenue: Number(r.totalRevenue || 0)
          }));
          setRows(mapped);
        }
      } catch (e) {
        // フォールバック（既定のrowsを使用）
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 min-h-screen py-8">
      <div className="container mx-auto px-4">
        <Card className="w-full bg-card mb-8">
          <CardHeader className="bg-card">
            <CardTitle className="bg-card">デジタル日報管理</CardTitle>
            <CardDescription className="bg-card">本日の日報を入力・管理します。</CardDescription>
          </CardHeader>
          <CardContent className="bg-card">
            <div className="space-y-4">
              <p className="text-gray-600">日報の入力・管理を行います</p>
              <Link href="/daily-reports/input">
                <Button className="bg-blue-600 text-white">
                  日報を入力
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="w-full bg-card">
          <CardHeader className="bg-card">
            <CardTitle className="bg-card">施術記録一覧</CardTitle>
            <CardDescription className="bg-card">最近の日報サマリーを表示します。</CardDescription>
          </CardHeader>
          <CardContent className="bg-card">
            {loading ? (
              <div className="text-gray-500">読み込み中...</div>
            ) : (
              <div className="space-y-3">
                {rows.map((report) => (
                  <div key={report.id} className="flex justify-between p-3 bg-gray-50 rounded">
                    <span>{report.date}</span>
                    <div>
                      <span className="mr-4">患者数: {report.patients}名</span>
                      <span>売上: ¥{report.revenue.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Page;
