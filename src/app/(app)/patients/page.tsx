'use client';

import React from 'react';
import Link from 'next/link';
import { usePatientAnalysis } from '@/hooks/usePatientAnalysis';
import { useUserProfileContext } from '@/providers/user-profile-context';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export default function PatientsPage() {
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfileContext();
  const clinicId = profile?.clinicId ?? null;

  const { data, loading, error } = usePatientAnalysis(clinicId);

  const isLoading = profileLoading || loading;
  const tabBaseClass = 'px-4 py-2 rounded text-sm font-medium';
  const activeTabClass = `${tabBaseClass} bg-blue-600 text-white`;
  const inactiveTabClass = `${tabBaseClass} bg-gray-200 text-gray-700 hover:bg-gray-300`;

  if (profileError && !profileLoading) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen'>
        <div className='max-w-[800px] mx-auto'>
          <Card className='bg-card'>
            <CardHeader>
              <CardTitle className='text-red-600'>
                プロフィール取得に失敗しました
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
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

  if (!clinicId && !profileLoading) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen'>
        <div className='max-w-[800px] mx-auto'>
          <Card className='bg-card'>
            <CardHeader>
              <CardTitle>クリニック情報が見つかりません</CardTitle>
              <CardDescription>
                権限が付与されたクリニックが設定されていないため、患者分析を表示できません。
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen flex items-center justify-center'>
        <div className='text-gray-500'>患者分析データを読み込み中です...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen'>
        <div className='max-w-[800px] mx-auto'>
          <Card className='bg-card border border-red-200'>
            <CardHeader>
              <CardTitle className='text-red-600'>
                データ取得に失敗しました
              </CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
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

  if (!data) {
    return (
      <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a] min-h-screen flex items-center justify-center'>
        <div className='text-gray-500'>表示できる患者データがありません。</div>
      </div>
    );
  }

  const {
    conversionData,
    visitCounts,
    riskScores,
    ltvRanking,
    segmentData,
    followUpList,
  } = data;

  return (
    <div className='p-6 bg-[#f9fafb] dark:bg-[#1a1a1a]'>
      <div className='max-w-[800px] mx-auto space-y-6'>
        <div className='flex space-x-2'>
          <span className={activeTabClass} aria-current='page'>
            {'\u60a3\u8005\u5206\u6790'}
          </span>
          <Link href='/patients/list' className={inactiveTabClass}>
            {'\u60a3\u8005\u4e00\u89a7'}
          </Link>
        </div>
        <Card className='bg-card'>
          <CardHeader>
            <CardTitle>患者フロー分析</CardTitle>
            <CardDescription>
              新患から再診への転換率とトレンド分析
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              {conversionData.stages.map((stage, index) => (
                <div
                  key={index}
                  className='flex items-center justify-between p-3 bg-gray-50 rounded'
                >
                  <span>{stage.name}</span>
                  <div className='flex items-center space-x-2'>
                    <span className='font-bold'>{stage.value}人</span>
                    <span className='text-sm text-gray-500'>
                      ({stage.percentage}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className='grid grid-cols-2 gap-6'>
          <Card className='bg-card'>
            <CardHeader>
              <CardTitle>平均通院回数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-4xl font-bold text-[#1e3a8a]'>
                {visitCounts.average}回
              </div>
              <p className='text-[#6b7280]'>
                前月比: {visitCounts.monthlyChange}%
              </p>
            </CardContent>
          </Card>

          <Card className='bg-card'>
            <CardHeader>
              <CardTitle>患者LTV</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-2'>
                {ltvRanking.slice(0, 3).map((patient, index) => (
                  <div
                    key={index}
                    className='flex justify-between items-center'
                  >
                    <span>{patient.name}</span>
                    <span className='font-bold'>
                      {patient.ltv.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className='bg-card'>
          <CardHeader>
            <CardTitle>離脱リスク分析</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-3'>
              {riskScores.map(patient => (
                <div
                  key={patient.id}
                  className='flex items-center justify-between p-3 bg-gray-50 rounded'
                >
                  <div>
                    <p className='font-medium'>{patient.name}</p>
                    <p className='text-sm text-gray-500'>
                      最終来院: {patient.lastVisit}
                    </p>
                  </div>
                  <div className='text-right'>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        patient.riskLevel === 'high'
                          ? 'bg-red-100 text-red-800'
                          : patient.riskLevel === 'medium'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {patient.riskLevel === 'high'
                        ? '高リスク'
                        : patient.riskLevel === 'medium'
                          ? '中リスク'
                          : '低リスク'}
                    </span>
                    <p className='text-sm font-bold mt-1'>
                      スコア: {patient.score}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {segmentData.age.length > 0 && (
          <Card className='bg-card'>
            <CardHeader>
              <CardTitle>セグメント分析</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-4'>
                <div className='flex space-x-2'>
                  <button className='px-4 py-2 bg-blue-500 text-white rounded'>
                    年齢層
                  </button>
                  <button className='px-4 py-2 bg-gray-200 text-gray-700 rounded'>
                    症状
                  </button>
                  <button className='px-4 py-2 bg-gray-200 text-gray-700 rounded'>
                    地域
                  </button>
                </div>
                <div className='grid grid-cols-2 gap-4'>
                  {segmentData.age.map((item, index) => (
                    <div
                      key={index}
                      className='flex justify-between p-2 bg-[#f3f4f6] dark:bg-[#2d2d2d] rounded'
                    >
                      <span>{item.label}</span>
                      <span>{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className='bg-card'>
          <CardHeader>
            <CardTitle>フォローアップ対象</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              {followUpList.length === 0 ? (
                <div className='text-gray-500'>
                  フォローアップ対象者は現在ありません。
                </div>
              ) : (
                followUpList.map((patient, index) => (
                  <div
                    key={index}
                    className='flex items-center justify-between p-3 bg-[#f3f4f6] dark:bg-[#2d2d2d] rounded'
                  >
                    <div>
                      <p className='font-medium'>{patient.name}</p>
                      <p className='text-sm text-[#6b7280]'>{patient.reason}</p>
                    </div>
                    <Button variant='outline'>
                      連絡する
                      <ArrowRight className='ml-2 h-4 w-4' />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
