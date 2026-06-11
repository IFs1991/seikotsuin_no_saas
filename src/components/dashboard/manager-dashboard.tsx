'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  Loader2,
  RefreshCw,
  Stethoscope,
  Users,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useManagerDashboard } from '@/hooks/useManagerDashboard';
import { cn } from '@/lib/utils';
import type {
  ManagerDashboardDailyReportStatus,
  ManagerDashboardResponse,
  ManagerDashboardSeverity,
} from '@/types/manager-dashboard';

const EMPTY_ASSIGNMENT_TITLE = '担当院がまだ設定されていません。';
const EMPTY_ASSIGNMENT_DESCRIPTION =
  '管理者にマネージャー管理から担当店舗の設定を依頼してください。';

const shortcuts = [
  { label: '日報管理', href: '/daily-reports', icon: ClipboardList },
  {
    label: '予約タイムライン',
    href: '/reservations?view=timeline',
    icon: CalendarClock,
  },
  { label: '患者分析', href: '/patients', icon: Users },
  { label: '収益分析', href: '/revenue', icon: CircleDollarSign },
  { label: '店舗比較分析', href: '/multi-store', icon: BarChart3 },
  { label: 'スタッフ管理', href: '/admin/users', icon: Stethoscope },
] as const;

const linkButtonClassName =
  'inline-flex h-10 items-center justify-center whitespace-nowrap rounded-medical border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-all duration-200 ease-out hover:bg-accent hover:text-accent-foreground hover:shadow-medical-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2';

function formatCurrency(value: number): string {
  return `¥${value.toLocaleString('ja-JP', {
    maximumFractionDigits: 0,
  })}`;
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return '-';
  }

  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

// Intl.DateTimeFormat の生成は高コストなのでモジュールスコープで使い回す
const JST_DATETIME_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDateTime(value: string): string {
  return JST_DATETIME_FORMATTER.format(new Date(value));
}

function getSeverityBadgeVariant(
  severity: ManagerDashboardSeverity
): BadgeVariant {
  if (severity === 'critical') {
    return 'destructive';
  }

  return severity === 'warning' ? 'default' : 'secondary';
}

function getSeverityLabel(severity: ManagerDashboardSeverity): string {
  if (severity === 'critical') {
    return '緊急';
  }

  return severity === 'warning' ? '注意' : '情報';
}

function getDailyReportStatusLabel(
  status: ManagerDashboardDailyReportStatus
): string {
  if (status === 'submitted') {
    return '提出済み';
  }

  return status === 'needs_review' ? '要確認' : '未提出';
}

function getDailyReportStatusVariant(
  status: ManagerDashboardDailyReportStatus
): BadgeVariant {
  if (status === 'submitted') {
    return 'secondary';
  }

  return status === 'needs_review' ? 'default' : 'destructive';
}

function LoadingState() {
  return (
    <div className='min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center'>
      <div className='flex items-center gap-2 text-gray-600 dark:text-gray-300'>
        <Loader2 className='h-5 w-5 animate-spin text-blue-600' />
        <span>担当エリアダッシュボードを読み込み中...</span>
      </div>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className='min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle className='text-red-600'>エラーが発生しました</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onRetry} className='w-full'>
            <RefreshCw className='mr-2 h-4 w-4' />
            再読み込み
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyAssignments() {
  return (
    <Alert className='bg-white dark:bg-gray-900'>
      <AlertTriangle className='h-4 w-4' />
      <AlertTitle>{EMPTY_ASSIGNMENT_TITLE}</AlertTitle>
      <AlertDescription>{EMPTY_ASSIGNMENT_DESCRIPTION}</AlertDescription>
    </Alert>
  );
}

function SummaryKpis({ data }: { data: ManagerDashboardResponse }) {
  const kpis = [
    {
      label: '担当院数',
      value: `${data.summary.assignedClinicCount}院`,
      detail: 'active assignments',
    },
    {
      label: '本日売上',
      value: formatCurrency(data.summary.todayRevenue),
      detail: '日報ベース',
    },
    {
      label: '本日来院数',
      value: `${data.summary.todayVisitCount.toLocaleString('ja-JP')}名`,
      detail: '日報ベース',
    },
    {
      label: '本日予約数',
      value: `${data.summary.todayReservationCount.toLocaleString('ja-JP')}件`,
      detail: 'キャンセル除外',
    },
    {
      label: '日報提出状況',
      value: `${data.summary.submittedDailyReportCount}/${data.summary.assignedClinicCount}`,
      detail: `未提出 ${data.summary.missingDailyReportCount}院`,
    },
    {
      label: '要確認件数',
      value: `${data.attentionItems.length.toLocaleString('ja-JP')}件`,
      detail: `日報要確認 ${data.summary.needsReviewCount}院`,
    },
    {
      label: 'キャンセル注意',
      value: `${data.summary.highCancellationClinicCount}院`,
      detail: '25%以上',
    },
  ];

  return (
    <section
      aria-label='サマリーKPI'
      className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3'
    >
      {kpis.map(kpi => (
        <Card key={kpi.label} className='bg-card'>
          <CardContent className='p-4'>
            <p className='text-sm text-gray-500 dark:text-gray-400'>
              {kpi.label}
            </p>
            <p className='mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100 break-words'>
              {kpi.value}
            </p>
            <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
              {kpi.detail}
            </p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function AttentionSection({ data }: { data: ManagerDashboardResponse }) {
  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>今日の要確認</CardTitle>
        <CardDescription>
          緊急度が高い順に、確認すべき院と理由を表示します。
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {data.attentionItems.length === 0 ? (
          <p className='text-sm text-gray-600 dark:text-gray-300'>
            現時点で緊急の確認事項はありません。
          </p>
        ) : (
          data.attentionItems.map(item => (
            <div
              key={item.id}
              className='flex flex-col gap-3 rounded-md border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 md:flex-row md:items-center md:justify-between'
            >
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge variant={getSeverityBadgeVariant(item.severity)}>
                    {getSeverityLabel(item.severity)}
                  </Badge>
                  <p className='font-semibold text-gray-900 dark:text-gray-100'>
                    {item.clinicName}
                  </p>
                </div>
                <p className='mt-2 text-sm font-medium text-gray-800 dark:text-gray-100'>
                  {item.title}
                </p>
                <p className='mt-1 text-sm text-gray-600 dark:text-gray-300'>
                  {item.description}
                </p>
              </div>
              <Link
                href={item.href}
                className={cn(linkButtonClassName, 'shrink-0')}
              >
                詳細を見る
              </Link>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ClinicCardsSection({ data }: { data: ManagerDashboardResponse }) {
  return (
    <section className='space-y-3' aria-label='担当院別カード'>
      <div>
        <h2 className='text-xl font-bold text-gray-900 dark:text-gray-100'>
          担当院別カード
        </h2>
        <p className='mt-1 text-sm text-gray-600 dark:text-gray-300'>
          各院の本日KPIと詳細画面への導線です。
        </p>
      </div>
      <div className='grid grid-cols-1 xl:grid-cols-2 gap-4'>
        {data.clinicCards.map(card => (
          <Card key={card.clinicId} className='bg-card'>
            <CardHeader>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <CardTitle className='break-words'>{card.clinicName}</CardTitle>
                <Badge
                  variant={getDailyReportStatusVariant(card.dailyReportStatus)}
                >
                  {getDailyReportStatusLabel(card.dailyReportStatus)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid grid-cols-2 gap-3 text-sm md:grid-cols-3'>
                <div>
                  <p className='text-gray-500 dark:text-gray-400'>本日売上</p>
                  <p className='font-semibold text-gray-900 dark:text-gray-100'>
                    {formatCurrency(card.todayRevenue)}
                  </p>
                  <p className='text-xs text-gray-500 dark:text-gray-400'>
                    前日比{' '}
                    {formatPercent(card.revenueChangeRateFromPreviousDay)}
                  </p>
                </div>
                <div>
                  <p className='text-gray-500 dark:text-gray-400'>来院数</p>
                  <p className='font-semibold text-gray-900 dark:text-gray-100'>
                    {card.todayVisitCount.toLocaleString('ja-JP')}名
                  </p>
                </div>
                <div>
                  <p className='text-gray-500 dark:text-gray-400'>予約数</p>
                  <p className='font-semibold text-gray-900 dark:text-gray-100'>
                    {card.todayReservationCount.toLocaleString('ja-JP')}件
                  </p>
                  <p className='text-xs text-gray-500 dark:text-gray-400'>
                    前週同曜日比{' '}
                    {formatPercent(
                      card.reservationChangeRateFromPreviousWeekday
                    )}
                  </p>
                </div>
                <div>
                  <p className='text-gray-500 dark:text-gray-400'>
                    キャンセル率
                  </p>
                  <p className='font-semibold text-gray-900 dark:text-gray-100'>
                    {formatPercent(card.cancellationRate)}
                  </p>
                </div>
              </div>
              <Separator />
              <div className='grid grid-cols-2 gap-2'>
                <Link
                  href={card.links.dailyReports}
                  className={linkButtonClassName}
                >
                  日報を見る
                </Link>
                <Link
                  href={card.links.reservations}
                  className={linkButtonClassName}
                >
                  予約を見る
                </Link>
                <Link
                  href={card.links.patients}
                  className={linkButtonClassName}
                >
                  患者分析
                </Link>
                <Link href={card.links.revenue} className={linkButtonClassName}>
                  収益分析
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function TimelineSection({ data }: { data: ManagerDashboardResponse }) {
  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>タイムライン</CardTitle>
        <CardDescription>
          本日の提出状況と要確認イベントを時系列で表示します。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.timeline.length === 0 ? (
          <p className='text-sm text-gray-600 dark:text-gray-300'>
            本日のタイムラインに表示できるイベントはまだありません。
          </p>
        ) : (
          <ol className='space-y-3'>
            {data.timeline.map(item => (
              <li key={item.id} className='border-l-2 border-blue-200 pl-4'>
                <div className='flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400'>
                  <time dateTime={item.occurredAt}>
                    {formatDateTime(item.occurredAt)}
                  </time>
                  <span>{item.clinicName}</span>
                </div>
                <p className='mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100'>
                  {item.label}
                </p>
                <p className='mt-1 text-sm text-gray-600 dark:text-gray-300'>
                  {item.detail}
                </p>
                <Link
                  href={item.href}
                  className='mt-2 inline-flex text-sm font-medium text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100'
                >
                  関連画面を見る
                </Link>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function ShortcutsSection() {
  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>ショートカット</CardTitle>
        <CardDescription>詳細確認でよく使う画面へ移動します。</CardDescription>
      </CardHeader>
      <CardContent className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
        {shortcuts.map(shortcut => {
          const Icon = shortcut.icon;
          return (
            <Link
              key={shortcut.href}
              href={shortcut.href}
              className={cn(linkButtonClassName, 'justify-start')}
            >
              <Icon className='mr-2 h-4 w-4' />
              {shortcut.label}
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function ManagerDashboard() {
  const { data, loading, error, refetch } = useManagerDashboard();

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }

  if (!data) {
    return null;
  }

  return (
    <main className='min-h-screen bg-white p-4 pt-8 text-gray-900 dark:bg-gray-800 dark:text-gray-100'>
      <div className='mx-auto max-w-7xl space-y-6'>
        <header className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
          <div>
            <h1 className='text-3xl font-bold'>担当エリアダッシュボード</h1>
            <p className='mt-2 text-sm text-gray-600 dark:text-gray-300'>
              担当院の今日の状況と確認すべき項目をまとめています。
            </p>
            <p className='mt-2 text-xs text-gray-500 dark:text-gray-400'>
              最終更新: {formatDateTime(data.generatedAt)}
            </p>
          </div>
          <Button onClick={() => void refetch()} variant='outline'>
            <RefreshCw className='mr-2 h-4 w-4' />
            再読み込み
          </Button>
        </header>

        {data.clinics.length === 0 ? (
          <EmptyAssignments />
        ) : (
          <>
            <SummaryKpis data={data} />
            <AttentionSection data={data} />
            <ClinicCardsSection data={data} />
            <TimelineSection data={data} />
            <ShortcutsSection />
          </>
        )}
      </div>
    </main>
  );
}
