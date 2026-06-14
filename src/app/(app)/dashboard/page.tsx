'use client';

import React, { memo, useMemo } from 'react';
import dynamic from 'next/dynamic';
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
import { ResponsiveGrid } from '@/components/layout/responsive-layout';
import useDashboard from '@/hooks/useDashboard';
import { useUserProfileContext } from '@/providers/user-profile-context';
import { isAreaManagerRole } from '@/lib/constants/roles';

const RevenueChart = dynamic(
  () => import('@/components/dashboard/revenue-chart'),
  {
    ssr: false,
    loading: () => (
      <Card className='w-full bg-card'>
        <CardContent className='p-6 text-sm text-muted-foreground'>
          収益チャートを読み込み中です...
        </CardContent>
      </Card>
    ),
  }
);

const PatientFlowHeatmap = dynamic(
  () => import('@/components/dashboard/patient-flow-heatmap'),
  {
    ssr: false,
    loading: () => (
      <Card className='w-full bg-card'>
        <CardContent className='p-6 text-sm text-muted-foreground'>
          混雑状況を読み込み中です...
        </CardContent>
      </Card>
    ),
  }
);

const ManagerDashboard = dynamic(
  () => import('@/components/dashboard/manager-dashboard'),
  {
    ssr: false,
    loading: () => (
      <div className='flex items-center justify-center'>
        <div className='flex items-center space-x-2'>
          <Loader2 className='h-6 w-6 animate-spin text-blue-600' />
          <span className='text-muted-foreground'>
            担当エリアダッシュボードを読み込み中...
          </span>
        </div>
      </div>
    ),
  }
);

// パフォーマンス最適化のためのメモ化コンポーネント
const DailyDataCard = memo(
  ({ revenue, patients }: { revenue: number; patients: number }) => (
    <Card className='w-full rounded-medical shadow-medical transition-all duration-200 hover:shadow-medical-lg'>
      <CardHeader>
        <CardTitle className='text-foreground'>
          本日のリアルタイムデータ
        </CardTitle>
        <CardDescription className='text-muted-foreground'>
          現在の売上と患者数の状況です。
        </CardDescription>
      </CardHeader>
      <CardContent className='p-4 md:p-6'>
        <ResponsiveGrid columns={{ mobile: 1, tablet: 2, desktop: 2 }}>
          <div className='flex flex-col items-center justify-center p-4 bg-muted rounded-medical shadow-sm'>
            <p className='text-sm text-muted-foreground'>本日の売上</p>
            <p className='text-2xl md:text-4xl font-extrabold text-primary-600 mt-2'>
              {revenue?.toLocaleString('ja-JP', {
                style: 'currency',
                currency: 'JPY',
              }) || '¥0'}
            </p>
          </div>
          <div className='flex flex-col items-center justify-center p-4 bg-muted rounded-medical shadow-sm'>
            <p className='text-sm text-muted-foreground'>本日の患者数</p>
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
      <CardTitle className='bg-card text-foreground'>AI分析コメント</CardTitle>
      <CardDescription className='bg-card text-muted-foreground'>
        AIによる今日の業績分析
      </CardDescription>
    </CardHeader>
    <CardContent className='bg-card p-6'>
      <p className='text-foreground'>{comment}</p>
    </CardContent>
  </Card>
));

AICommentCard.displayName = 'AICommentCard';

const QuickActionsCard = memo(
  ({ onQuickAction }: { onQuickAction: (action: string) => void }) => (
    <Card className='w-full bg-card shadow-md'>
      <CardHeader className='bg-card'>
        <CardTitle className='bg-card text-foreground'>
          クイックアクション
        </CardTitle>
        <CardDescription className='bg-card text-muted-foreground'>
          よく使う機能へ素早くアクセスできます。
        </CardDescription>
      </CardHeader>
      <CardContent className='bg-card p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
        <Button
          className='w-full bg-primary-600 text-white hover:bg-primary-600/90 dark:bg-medical-green-500 dark:hover:bg-medical-green-500/90'
          onClick={() => onQuickAction('daily-report')}
        >
          <Stethoscope className='h-4 w-4 mr-2' />
          日報入力
        </Button>
        <Button
          className='w-full bg-primary-600 text-white hover:bg-primary-600/90 dark:bg-medical-green-500 dark:hover:bg-medical-green-500/90'
          onClick={() => onQuickAction('appointments')}
        >
          <Users className='h-4 w-4 mr-2' />
          予約確認
        </Button>
        <Button
          className='w-full bg-primary-600 text-white hover:bg-primary-600/90 dark:bg-medical-green-500 dark:hover:bg-medical-green-500/90'
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

function ClinicDashboard({ clinicId }: { clinicId: string | null }) {
  const { dashboardData, loading, error, handleQuickAction } =
    useDashboard(clinicId);

  const hasClinic = Boolean(clinicId);

  // メモ化されたデータ計算
  const memoizedData = useMemo(() => {
    if (!dashboardData) return null;

    return {
      dailyData: dashboardData.dailyData || { revenue: 0, patients: 0 },
      aiComment:
        dashboardData.aiComment?.summary || '本日のデータを分析中です...',
      alerts: dashboardData.alerts || [],
      revenueChartData: dashboardData.revenueChartData || [],
      heatmapData: dashboardData.heatmapData || [],
    };
  }, [dashboardData]);

  if (loading) {
    return (
      <div className='flex items-center justify-center'>
        <div className='flex items-center space-x-2'>
          <Loader2 className='h-6 w-6 animate-spin text-blue-600' />
          <span className='text-muted-foreground'>
            ダッシュボードデータを読み込み中...
          </span>
        </div>
      </div>
    );
  }

  if (!hasClinic) {
    return (
      <div className='flex items-center justify-center'>
        <Card className='max-w-md w-full mx-4'>
          <CardHeader>
            <CardTitle>クリニック情報が見つかりません</CardTitle>
            <CardDescription>
              アクセス権のあるクリニックが割り当てられていないため、ダッシュボードを表示できません。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-foreground'>管理者に権限を確認してください。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex items-center justify-center'>
        <Card className='max-w-md w-full mx-4'>
          <CardHeader>
            <CardTitle className='text-red-600'>エラーが発生しました</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='mb-4 text-foreground'>{error}</p>
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

  const { dailyData, aiComment, alerts, revenueChartData, heatmapData } =
    memoizedData;

  return (
    <div className='p-4 pt-8 text-foreground'>
      <div className='max-w-4xl mx-auto space-y-6'>
        <h1 className='text-3xl font-bold text-foreground mb-6'>
          メインダッシュボード
        </h1>

        {/* メモ化されたコンポーネントを使用 */}
        <DailyDataCard
          revenue={dailyData.revenue}
          patients={dailyData.patients}
        />
        <AICommentCard comment={aiComment} />

        {/* 収益推移チャート */}
        <RevenueChart data={revenueChartData} />

        {/* 時間帯別の混雑状況ヒートマップ */}
        <PatientFlowHeatmap data={heatmapData} />

        {/* 異常値アラート表示 */}
        {alerts && alerts.length > 0 && (
          <Card className='w-full bg-card shadow-md border-l-4 border-red-500'>
            <CardHeader className='bg-card'>
              <CardTitle className='bg-card text-red-600 dark:text-red-400 flex items-center'>
                <CheckCircle className='h-5 w-5 mr-2 text-red-500' />
                異常値アラート
              </CardTitle>
              <CardDescription className='bg-card text-muted-foreground'>
                以下の項目で異常値が検出されました。
              </CardDescription>
            </CardHeader>
            <CardContent className='bg-card p-6'>
              <ul className='list-disc pl-5 space-y-2 text-foreground'>
                {alerts.map((alert, index) => (
                  <li key={index}>{alert}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* クイックアクション - メモ化済みコンポーネント */}
        <QuickActionsCard onQuickAction={handleQuickAction} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfileContext();

  if (profileLoading) {
    return (
      <div className='flex items-center justify-center'>
        <div className='flex items-center space-x-2'>
          <Loader2 className='h-6 w-6 animate-spin text-blue-600' />
          <span className='text-muted-foreground'>
            ダッシュボードデータを読み込み中...
          </span>
        </div>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className='flex items-center justify-center'>
        <Card className='max-w-md w-full mx-4'>
          <CardHeader>
            <CardTitle className='text-red-600'>
              プロフィール取得に失敗しました
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='mb-4 text-foreground'>{profileError}</p>
            <Button onClick={() => window.location.reload()} className='w-full'>
              再読み込み
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isAreaManagerRole(profile?.role)) {
    return <ManagerDashboard />;
  }

  return <ClinicDashboard clinicId={profile?.clinicId ?? null} />;
}
