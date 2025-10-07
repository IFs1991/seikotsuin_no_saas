'use client';

import React, { memo, useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  Stethoscope,
  Users,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import {
  ResponsiveLayout,
  ResponsiveSection,
  ResponsiveGrid,
} from '@/components/layout/responsive-layout';
import useDashboard from '@/hooks/useDashboard';
import { useUserProfileContext } from '@/providers/user-profile-context';

// パフォーマンス最適化のためのメモ化コンポーネント
const DailyDataCard = memo(
  ({ revenue, patients }: { revenue: number; patients: number }) => (
    <Card variant='dashboard' className='w-full'>
      <CardHeader>
        <CardTitle className='text-gray-900 dark:text-gray-100'>
          本日のリアルタイムデータ
        </CardTitle>
        <CardDescription className='text-gray-600 dark:text-gray-400'>
          現在の売上と患者数の状況です。
        </CardDescription>
      </CardHeader>
      <CardContent className='p-4 md:p-6'>
        <ResponsiveGrid columns={{ mobile: 1, tablet: 2, desktop: 2 }}>
          <div className='flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-medical shadow-sm'>
            <p className='text-sm text-gray-600 dark:text-gray-400'>
              本日の売上
            </p>
            <p className='text-2xl md:text-4xl font-extrabold text-primary-600 mt-2'>
              {revenue?.toLocaleString('ja-JP', {
                style: 'currency',
                currency: 'JPY',
              }) || '¥0'}
            </p>
          </div>
          <div className='flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-medical shadow-sm'>
            <p className='text-sm text-gray-600 dark:text-gray-400'>
              本日の患者数
            </p>
            <p className='text-2xl md:text-4xl font-extrabold text-primary-600 mt-2'>
              {patients?.toLocaleString('ja-JP') || '0'}名
            </p>
          </div>
        </ResponsiveGrid>
      </CardContent>
    </Card>
  )
);

DailyDataCard.displayName = 'DailyDataCard';

const AICommentCard = memo(({ comment }: { comment: string }) => (
  <Card className='w-full bg-card shadow-md'>
    <CardHeader className='bg-card'>
      <CardTitle className='bg-card text-gray-900 dark:text-gray-100'>
        AI分析コメント
      </CardTitle>
      <CardDescription className='bg-card text-gray-600 dark:text-gray-400'>
        AIによる今日の業績分析
      </CardDescription>
    </CardHeader>
    <CardContent className='bg-card p-6'>
      <p className='text-gray-700 dark:text-gray-300'>{comment}</p>
    </CardContent>
  </Card>
));

AICommentCard.displayName = 'AICommentCard';

const QuickActionsCard = memo(
  ({ onQuickAction }: { onQuickAction: (action: string) => void }) => (
    <Card className='w-full bg-card shadow-md'>
      <CardHeader className='bg-card'>
        <CardTitle className='bg-card text-gray-900 dark:text-gray-100'>
          クイックアクション
        </CardTitle>
        <CardDescription className='bg-card text-gray-600 dark:text-gray-400'>
          よく使う機能へ素早くアクセスできます。
        </CardDescription>
      </CardHeader>
      <CardContent className='bg-card p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
        <Button
          className='w-full bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white dark:bg-[#10b981] dark:hover:bg-[#10b981]/90'
          onClick={() => onQuickAction('daily-report')}
        >
          <Stethoscope className='h-4 w-4 mr-2' />
          日報入力
        </Button>
        <Button
          className='w-full bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white dark:bg-[#10b981] dark:hover:bg-[#10b981]/90'
          onClick={() => onQuickAction('appointments')}
        >
          <Users className='h-4 w-4 mr-2' />
          予約確認
        </Button>
        <Button
          className='w-full bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white dark:bg-[#10b981] dark:hover:bg-[#10b981]/90'
          onClick={() => onQuickAction('ai-chat')}
        >
          <ArrowRight className='h-4 w-4 mr-2' />
          AIチャット
        </Button>
      </CardContent>
    </Card>
  )
);

QuickActionsCard.displayName = 'QuickActionsCard';

export default function DashboardPage() {
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfileContext();
  const clinicId = profile?.clinicId ?? null;
  const { dashboardData, loading, error, handleQuickAction } =
    useDashboard(clinicId);

  const isLoading = profileLoading || loading;
  const hasClinic = Boolean(clinicId);

  // メモ化されたデータ計算
  const memoizedData = useMemo(() => {
    if (!dashboardData) return null;

    return {
      dailyData: dashboardData.dailyData || { revenue: 0, patients: 0 },
      aiComment:
        dashboardData.aiComment?.summary || '本日のデータを分析中です...',
      alerts: dashboardData.alerts || [],
    };
  }, [dashboardData]);

  if (isLoading) {
    return (
      <div className='min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center'>
        <div className='flex items-center space-x-2'>
          <Loader2 className='h-6 w-6 animate-spin text-blue-600' />
          <span className='text-gray-600 dark:text-gray-400'>
            ダッシュボードデータを読み込み中...
          </span>
        </div>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className='min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center'>
        <Card className='max-w-md w-full mx-4'>
          <CardHeader>
            <CardTitle className='text-red-600'>プロフィール取得に失敗しました</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-gray-700 dark:text-gray-300 mb-4'>
              {profileError}
            </p>
            <Button onClick={() => window.location.reload()} className='w-full'>
              再読み込み
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasClinic) {
    return (
      <div className='min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center'>
        <Card className='max-w-md w-full mx-4'>
          <CardHeader>
            <CardTitle>クリニック情報が見つかりません</CardTitle>
            <CardDescription>
              アクセス権のあるクリニックが割り当てられていないため、ダッシュボードを表示できません。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-gray-700 dark:text-gray-300'>管理者に権限を確認してください。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center'>
        <Card className='max-w-md w-full mx-4'>
          <CardHeader>
            <CardTitle className='text-red-600'>エラーが発生しました</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-gray-700 dark:text-gray-300 mb-4'>{error}</p>
            <Button onClick={() => window.location.reload()} className='w-full'>
              再読み込み
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!memoizedData) {
    return null;
  }

  const { dailyData, aiComment, alerts } = memoizedData;

  return (
    <div className='min-h-screen bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-4 pt-8'>
      <div className='max-w-4xl mx-auto space-y-6'>
        <h1 className='text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6'>
          メインダッシュボード
        </h1>

        {/* メモ化されたコンポーネントを使用 */}
        <DailyDataCard
          revenue={dailyData.revenue}
          patients={dailyData.patients}
        />
        <AICommentCard comment={aiComment} />

        {/* 収益比率グラフ */}
        <Card className='w-full bg-card shadow-md'>
          <CardHeader className='bg-card'>
            <CardTitle className='bg-card text-gray-900 dark:text-gray-100'>
              収益推移と比率
            </CardTitle>
            <CardDescription className='bg-card text-gray-600 dark:text-gray-400'>
              保険診療と自費診療の収益比率とトレンド。
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card p-6'>
            <p className='text-gray-500'>チャート表示機能は準備中です</p>
          </CardContent>
        </Card>

        {/* 時間帯別の混雑状況ヒートマップ */}
        <Card className='w-full bg-card shadow-md'>
          <CardHeader className='bg-card'>
            <CardTitle className='bg-card text-gray-900 dark:text-gray-100'>
              時間帯別混雑状況ヒートマップ
            </CardTitle>
            <CardDescription className='bg-card text-gray-600 dark:text-gray-400'>
              曜日と時間帯ごとの混雑度を視覚化します。
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card p-6'>
            <p className='text-gray-500'>ヒートマップ表示機能は準備中です</p>
          </CardContent>
        </Card>

        {/* 異常値アラート表示 */}
        {alerts && alerts.length > 0 && (
          <Card className='w-full bg-card shadow-md border-l-4 border-red-500'>
            <CardHeader className='bg-card'>
              <CardTitle className='bg-card text-red-600 dark:text-red-400 flex items-center'>
                <CheckCircle className='h-5 w-5 mr-2 text-red-500' />
                異常値アラート
              </CardTitle>
              <CardDescription className='bg-card text-gray-600 dark:text-gray-400'>
                以下の項目で異常値が検出されました。
              </CardDescription>
            </CardHeader>
            <CardContent className='bg-card p-6'>
              <ul className='list-disc pl-5 space-y-2 text-gray-800 dark:text-gray-200'>
                {alerts.map((alert, index) => (
                  <li key={index}>{alert}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* クイックアクション - メモ化済みコンポーネント */}
        <QuickActionsCard onQuickAction={handleQuickAction} />

        {/* カスタマイズ可能なウィジェット配置 (Placeholder) */}
        <Card className='w-full bg-card shadow-md'>
          <CardHeader className='bg-card'>
            <CardTitle className='bg-card text-gray-900 dark:text-gray-100'>
              ウィジェット配置 (開発中)
            </CardTitle>
            <CardDescription className='bg-card text-gray-600 dark:text-gray-400'>
              ダッシュボードの表示をカスタマイズできます。
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card p-6 text-gray-500 dark:text-gray-400'>
            <p>
              このエリアは、ユーザーが自由にウィジェットを配置・カスタマイズできる機能が将来的に追加されます。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
