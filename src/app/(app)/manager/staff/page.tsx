'use client';

import React from 'react';
import { ManagerStaffList } from '@/components/manager/manager-staff-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isAreaManagerRole } from '@/lib/constants/roles';
import { useUserProfileContext } from '@/providers/user-profile-context';

export default function ManagerStaffPage() {
  const { profile, loading, error } = useUserProfileContext();

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background'>
        <p className='text-gray-500'>読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-background'>
        <Card className='mx-4 w-full max-w-md'>
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
      <div className='flex min-h-screen items-center justify-center bg-background'>
        <Card className='mx-4 w-full max-w-md'>
          <CardHeader>
            <CardTitle>アクセス権限がありません</CardTitle>
          </CardHeader>
          <CardContent>
            この画面はマネージャー向けの担当院スタッフ一覧です。
          </CardContent>
        </Card>
      </div>
    );
  }

  return <ManagerStaffList />;
}
