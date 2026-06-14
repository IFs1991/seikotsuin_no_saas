'use client';

import React from 'react';
import { ManagerStaffAnalysis } from '@/components/staff-analysis/manager-staff-analysis';
import { useUserProfileContext } from '@/providers/user-profile-context';
import { isAreaManagerRole } from '@/lib/constants/roles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ManagerStaffAnalysisPage() {
  const { profile, loading, error } = useUserProfileContext();

  if (loading) {
    return (
      <div className='min-h-screen bg-background flex items-center justify-center'>
        <p className='text-gray-500'>読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen bg-background flex items-center justify-center'>
        <Card className='max-w-md w-full mx-4'>
          <CardHeader>
            <CardTitle className='text-red-600'>
              プロフィール取得に失敗しました
            </CardTitle>
          </CardHeader>
          <CardContent>{error}</CardContent>
        </Card>
      </div>
    );
  }

  if (!isAreaManagerRole(profile?.role)) {
    return (
      <div className='min-h-screen bg-background flex items-center justify-center'>
        <Card className='max-w-md w-full mx-4'>
          <CardHeader>
            <CardTitle>アクセス権限がありません</CardTitle>
          </CardHeader>
          <CardContent>
            この画面はマネージャー向けの担当院スタッフ分析です。
          </CardContent>
        </Card>
      </div>
    );
  }

  return <ManagerStaffAnalysis />;
}
