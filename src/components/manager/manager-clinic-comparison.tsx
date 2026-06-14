'use client';

import { BarChart3, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useManagerClinicComparison } from '@/hooks/useManagerClinicComparison';
import type { ManagerClinicComparisonRow } from '@/types/manager-clinic-comparison';

const PERIOD_OPTIONS = [
  { value: 'month', label: '今月' },
  { value: 'previous_month', label: '先月' },
  { value: 'last_3_months', label: '直近3か月' },
  { value: 'year', label: '今年' },
  { value: 'custom', label: '任意期間' },
  { value: 'all', label: '全期間' },
] as const;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRate(value: number | null): string {
  if (value === null) {
    return '-';
  }
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function PeriodLabel({
  startDate,
  endDate,
}: {
  startDate: string | null;
  endDate: string | null;
}) {
  if (!startDate || !endDate) {
    return <span>全期間</span>;
  }

  return (
    <span>
      {startDate} - {endDate}
    </span>
  );
}

function RevenueBars({
  rows,
}: {
  rows: readonly ManagerClinicComparisonRow[];
}) {
  const maxRevenue = Math.max(...rows.map(row => row.totalRevenue), 0);

  if (rows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <BarChart3 className='h-4 w-4' />
          院別売上
        </CardTitle>
        <CardDescription>売上規模を簡易バーで比較します。</CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {rows.map(row => {
          const width =
            maxRevenue > 0
              ? Math.max(4, Math.round((row.totalRevenue / maxRevenue) * 100))
              : 0;
          return (
            <div key={row.clinicId} className='space-y-1'>
              <div className='flex items-center justify-between gap-3 text-sm'>
                <span className='font-medium'>{row.clinicName}</span>
                <span>{formatCurrency(row.totalRevenue)}</span>
              </div>
              <div className='h-3 rounded bg-slate-100'>
                <div
                  className='h-3 rounded bg-blue-600'
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function ManagerClinicComparison() {
  const state = useManagerClinicComparison();
  const rows = state.data?.rows ?? [];
  const clinics = state.data?.clinics ?? [];

  return (
    <main className='min-h-screen bg-background p-4 pt-8 text-foreground'>
      <div className='mx-auto max-w-7xl space-y-6'>
        <header className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
          <div>
            <h1 className='text-3xl font-bold'>担当院比較分析</h1>
            <p className='mt-2 text-sm text-muted-foreground'>
              active な担当院のみを対象に、売上と予約の指標を比較します。
            </p>
          </div>
          <Button
            type='button'
            variant='outline'
            onClick={() => void state.refetch()}
            disabled={state.loading}
          >
            <RefreshCw className='mr-2 h-4 w-4' />
            再読み込み
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>フィルター</CardTitle>
            <CardDescription>
              期間と前期間比較の有無を選択します。
            </CardDescription>
          </CardHeader>
          <CardContent className='grid gap-3 md:grid-cols-4'>
            <label className='space-y-1 text-sm'>
              <span className='font-medium'>期間</span>
              <select
                aria-label='期間'
                className='h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm'
                value={state.period}
                onChange={event =>
                  state.setPeriod(
                    event.target
                      .value as (typeof PERIOD_OPTIONS)[number]['value']
                  )
                }
                disabled={state.loading}
              >
                {PERIOD_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className='space-y-1 text-sm'>
              <span className='font-medium'>開始日</span>
              <Input
                aria-label='開始日'
                type='date'
                value={state.startDate}
                onChange={event => state.setStartDate(event.target.value)}
                disabled={state.loading || state.period !== 'custom'}
              />
            </label>
            <label className='space-y-1 text-sm'>
              <span className='font-medium'>終了日</span>
              <Input
                aria-label='終了日'
                type='date'
                value={state.endDate}
                onChange={event => state.setEndDate(event.target.value)}
                disabled={state.loading || state.period !== 'custom'}
              />
            </label>
            <label className='space-y-1 text-sm'>
              <span className='font-medium'>比較</span>
              <select
                aria-label='比較'
                className='h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm'
                value={state.compare}
                onChange={event =>
                  state.setCompare(
                    event.target.value === 'none' ? 'none' : 'previous_period'
                  )
                }
                disabled={state.loading}
              >
                <option value='previous_period'>前期間比</option>
                <option value='none'>比較なし</option>
              </select>
            </label>
          </CardContent>
        </Card>

        {state.error && (
          <Card>
            <CardContent className='p-4 text-sm text-red-700'>
              {state.error}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>院別比較テーブル</CardTitle>
            <CardDescription>
              {state.data ? (
                <>
                  {rows.length}件 / 対象期間:{' '}
                  <PeriodLabel
                    startDate={state.data.period.startDate}
                    endDate={state.data.period.endDate}
                  />
                </>
              ) : (
                '読み込み前'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {state.loading ? (
              <p className='text-sm text-gray-500'>読み込み中...</p>
            ) : clinics.length === 0 ? (
              <p className='text-sm text-gray-600'>
                担当院がまだ設定されていません。
              </p>
            ) : rows.length === 0 ? (
              <p className='text-sm text-gray-600'>
                表示できる比較データがありません。
              </p>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full min-w-[920px] text-sm'>
                  <thead>
                    <tr className='border-b text-left text-gray-500'>
                      <th className='py-2'>院名</th>
                      <th className='py-2'>売上</th>
                      <th className='py-2'>予約数</th>
                      <th className='py-2'>完了予約</th>
                      <th className='py-2'>キャンセル率</th>
                      <th className='py-2'>売上前期間比</th>
                      <th className='py-2'>予約前期間比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.clinicId} className='border-b'>
                        <td className='py-3 font-medium'>{row.clinicName}</td>
                        <td className='py-3'>
                          {formatCurrency(row.totalRevenue)}
                        </td>
                        <td className='py-3'>{row.reservationCount}</td>
                        <td className='py-3'>
                          {row.completedReservationCount}
                        </td>
                        <td className='py-3'>
                          {formatRate(row.cancellationRate)}
                        </td>
                        <td className='py-3'>
                          {formatRate(row.revenueChangeRate)}
                        </td>
                        <td className='py-3'>
                          {formatRate(row.reservationChangeRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <RevenueBars rows={rows} />

        {state.data && state.data.disclaimers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>集計注記</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className='list-disc space-y-1 pl-5 text-sm text-gray-600'>
                {state.data.disclaimers.map(disclaimer => (
                  <li key={disclaimer}>{disclaimer}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
