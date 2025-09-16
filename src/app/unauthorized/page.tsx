"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const UnauthorizedPage: React.FC = () => {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 text-red-600">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            アクセス権限がありません
          </CardTitle>
          <CardDescription className="text-gray-600">
            このページにアクセスするための適切な権限がありません。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-gray-700 space-y-2">
            <p>以下のいずれかに該当する可能性があります：</p>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>管理者権限が必要なページです</li>
              <li>セッションが期限切れになっています</li>
              <li>アカウントが無効になっています</li>
            </ul>
          </div>
          
          <div className="flex flex-col space-y-3">
            <Button 
              onClick={() => router.push('/dashboard')}
              className="w-full"
            >
              ダッシュボードに戻る
            </Button>
            <Button 
              onClick={() => router.push('/admin/login')}
              variant="outline"
              className="w-full"
            >
              再ログイン
            </Button>
          </div>
          
          <div className="text-xs text-gray-500 text-center">
            問題が解決しない場合は、システム管理者にお問い合わせください。
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UnauthorizedPage;