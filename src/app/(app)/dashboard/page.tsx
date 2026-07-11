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
import { HelpHint } from '@/components/ui/help-hint';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  CalendarDays,
  Sparkles,
  Stethoscope,
  Loader2,
} from 'lucide-react';
import { ResponsiveGrid } from '@/components/layout/responsive-layout';
import useDashboard from '@/hooks/useDashboard';
import { useUserProfileContext } from '@/providers/user-profile-context';
import { useOptionalSelectedClinic } from '@/providers/selected-clinic-context';
import { isAreaManagerRole } from '@/lib/constants/roles';
import { isAiInsightsEnabled } from '@/lib/feature-flags';
import { useActiveClinicId } from '@/hooks/useActiveClinicId';
import { toJSTDateString } from '@/lib/jst';

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

function formatTodayLabel(): string {
  const [year, month, day] = toJSTDateString().split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
}

// パフォーマンス最適化のためのメモ化コンポーネント
const DailyDataCard = memo(
  ({ revenue, patients }: { revenue: number; patients: number }) => (
    <Card className='w-full rounded-medical shadow-medical transition-all duration-200 hover:shadow-medical-lg'>
      <CardHeader>
        <CardTitle className='flex items-center gap-1 text-foreground'>
          本日のリアルタイムデータ
          <HelpHint title='本日のリアルタイムデータ'>
            今日これまでの売上と来院された患者数の速報値です。日報や予約の登録内容が反映されます。
          </HelpHint>
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
      <CardTitle className='flex items-center gap-1 bg-card text-foreground'>
        AI分析コメント
        <HelpHint title='AI分析コメント'>
          蓄積されたデータをもとに、AIが本日の業績の傾向を短くまとめます。参考情報としてご覧ください。
        </HelpHint>
      </CardTitle>
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

interface QuickActionsCardProps {
  onQuickAction: (action: string) => void;
  showAiChat: boolean;
}

const QuickActionsCard = memo(
  ({ onQuickAction, showAiChat }: QuickActionsCardProps) => (
    <Card className='w-full bg-card shadow-md'>
      <CardHeader className='bg-card'>
        <CardTitle className='flex items-center gap-1 bg-card text-foreground'>
          今日やること
          <HelpHint title='今日やること'>
            毎日よく使う操作をまとめています。日々の業務はここから始めると迷いません。
          </HelpHint>
        </CardTitle>
        <CardDescription className='bg-card text-muted-foreground'>
          よく使う機能へ素早くアクセスできます。
        </CardDescription>
      </CardHeader>
      <CardContent className='bg-card p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
        <Button
          className='h-auto w-full flex-col items-start gap-1 px-4 py-3 bg-primary-600 text-white hover:bg-primary-600/90 dark:bg-medical-green-500 dark:hover:bg-medical-green-500/90'
          onClick={() => onQuickAction('daily-report')}
        >
          <span className='flex items-center text-base font-semibold'>
            <Stethoscope className='h-4 w-4 mr-2' aria-hidden='true' />
            日報入力
          </span>
          <span className='text-xs font-normal opacity-90'>
            今日の施術内容と売上を記録します
          </span>
        </Button>
        <Button
          variant='outline'
          className='h-auto w-full flex-col items-start gap-1 px-4 py-3'
          onClick={() => onQuickAction('appointments')}
        >
          <span className='flex items-center text-base font-semibold'>
            <CalendarDays className='h-4 w-4 mr-2' aria-hidden='true' />
            予約確認
          </span>
          <span className='text-xs font-normal text-muted-foreground'>
            本日の予約状況を確認します
          </span>
        </Button>
        {showAiChat && (
          <Button
            variant='outline'
            className='h-auto w-full flex-col items-start gap-1 px-4 py-3'
            onClick={() => onQuickAction('ai-chat')}
          >
            <span className='flex items-center text-base font-semibold'>
              <Sparkles className='h-4 w-4 mr-2' aria-hidden='true' />
              AIチャット
            </span>
            <span className='text-xs font-normal text-muted-foreground'>
              経営データについてAIに質問できます
            </span>
          </Button>
        )}
      </CardContent>
    </Card>
  )
);

QuickActionsCard.displayName = 'QuickActionsCard';

function DashboardSkeleton() {
  return (
    <div className='p-4 pt-8 text-foreground'>
      <div className='mx-auto max-w-7xl space-y-6'>
        <div className='flex items-center space-x-2 text-muted-foreground'>
          <Loader2 className='h-6 w-6 animate-spin text-blue-600' />
          <span>ダッシュボードデータを読み込み中...</span>
        </div>
        <Skeleton className='h-40 w-full' />
        <Skeleton className='h-40 w-full' />
        <div className='grid gap-6 lg:grid-cols-2'>
          <Skeleton className='h-72 w-full' />
          <Skeleton className='h-72 w-full' />
        </div>
      </div>
    </div>
  );
}

function ClinicDashboard({ clinicId }: { clinicId: string | null }) {
  const { dashboardData, loading, error, handleQuickAction } =
    useDashboard(clinicId);
  const selectedClinic = useOptionalSelectedClinic();

  const hasClinic = Boolean(clinicId);
  const clinicName = useMemo(() => {
    if (!clinicId) return null;
    return (
      selectedClinic?.clinics?.find(clinic => clinic.id === clinicId)?.name ??
      null
    );
  }, [clinicId, selectedClinic?.clinics]);

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
    return <DashboardSkeleton />;
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
      <div className='mx-auto max-w-7xl space-y-6'>
        <header>
          <h1 className='text-3xl font-bold text-foreground'>ダッシュボード</h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            {formatTodayLabel()}
            {clinicName ? ` ・ ${clinicName}` : ''} の状況をまとめています。
          </p>
        </header>

        {/* 気づくべき情報を最上部に置く */}
        {alerts && alerts.length > 0 && (
          <Card className='w-full bg-card shadow-md border-l-4 border-red-500'>
            <CardHeader className='bg-card'>
              <CardTitle className='bg-card text-red-600 dark:text-red-400 flex items-center'>
                <AlertTriangle
                  className='h-5 w-5 mr-2 text-red-500'
                  aria-hidden='true'
                />
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

        {/* 毎日の導線はスクロールなしで届く位置に置く */}
        <QuickActionsCard
          onQuickAction={handleQuickAction}
          showAiChat={isAiInsightsEnabled()}
        />

        <DailyDataCard
          revenue={dailyData.revenue}
          patients={dailyData.patients}
        />

        {/* PC幅ではチャートを2カラムで並べてスクロール量を減らす */}
        <div className='grid gap-6 lg:grid-cols-2'>
          <RevenueChart data={revenueChartData} />
          <PatientFlowHeatmap data={heatmapData} />
        </div>

        <AICommentCard comment={aiComment} />
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
  const isManager = isAreaManagerRole(profile?.role);
  const { activeClinicId, activeClinicLoading } = useActiveClinicId(
    profile?.clinicId,
    { enabled: !isManager }
  );

  if (profileLoading || activeClinicLoading) {
    return <DashboardSkeleton />;
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

  if (isManager) {
    return <ManagerDashboard />;
  }

  return <ClinicDashboard clinicId={activeClinicId} />;
}
