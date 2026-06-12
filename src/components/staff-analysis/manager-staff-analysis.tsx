'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useManagerStaffAnalysis } from '@/hooks/useManagerStaffAnalysis';
import type {
  ManagerStaffAnalysisCompareMode,
  ManagerStaffAnalysisStaffRow,
  ManagerStaffAnalysisTarget,
} from '@/types/manager-staff-analysis';
import type { ManagerAnalysisPeriodType } from '@/lib/manager-analysis-period';

const PERIOD_OPTIONS: Array<{
  value: ManagerAnalysisPeriodType;
  label: string;
}> = [
  { value: 'month', label: '今月' },
  { value: 'previous_month', label: '前月' },
  { value: 'last_3_months', label: '直近3か月' },
  { value: 'year', label: '今年' },
  { value: 'all', label: '全期間' },
  { value: 'custom', label: '任意期間' },
];

function formatCurrency(value: number): string {
  return value.toLocaleString('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  });
}

function formatRate(value: number | null): string {
  if (value === null) {
    return '-';
  }

  return `${(value * 100).toFixed(1)}%`;
}

function statusLabel(status: ManagerStaffAnalysisStaffRow['status']): string {
  switch (status) {
    case 'needs_attention':
      return '要確認';
    case 'insufficient_data':
      return 'データ不足';
    case 'stable':
      return '安定';
  }
}

export function ManagerStaffAnalysis() {
  const [target, setTarget] = useState<ManagerStaffAnalysisTarget>('total');
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [period, setPeriod] = useState<ManagerAnalysisPeriodType>('month');
  const [compare, setCompare] =
    useState<ManagerStaffAnalysisCompareMode>('previous_period');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const { data, loading, error, refetch } = useManagerStaffAnalysis({
    target,
    clinicId,
    period,
    startDate,
    endDate,
    compare,
  });
  const clinics = data?.scope.clinics ?? [];
  const hasAssignments = clinics.length > 0;

  useEffect(() => {
    if (target === 'clinic' && !clinicId && clinics[0]) {
      setClinicId(clinics[0].id);
    }
  }, [clinicId, clinics, target]);

  const hasData = useMemo(() => {
    if (!data) {
      return false;
    }

    return (
      data.staff.length > 0 ||
      data.summary.reservationCount > 0 ||
      data.summary.totalRevenue > 0
    );
  }, [data]);

  return (
    <div className='min-h-screen bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-4 pt-8'>
      <div className='max-w-6xl mx-auto space-y-6'>
        <div className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
          <div>
            <h1 className='text-3xl font-bold'>担当院スタッフ分析</h1>
            <p className='mt-2 text-gray-600 dark:text-gray-300'>
              担当院のスタッフ稼働、予約対応、売上貢献、キャンセル傾向を確認できます。
            </p>
            <p className='mt-1 text-sm text-amber-700 dark:text-amber-300'>
              この画面は人事評価・給与査定用ではありません。
            </p>
            {data?.generatedAt && (
              <p className='mt-1 text-xs text-gray-500'>
                最終更新日時:{' '}
                {new Date(data.generatedAt).toLocaleString('ja-JP')}
              </p>
            )}
          </div>
          <Button type='button' onClick={refetch} variant='outline'>
            <RefreshCw className='mr-2 h-4 w-4' />
            再読み込み
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>フィルター</CardTitle>
            <CardDescription>担当範囲と期間を切り替えます。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid gap-4 md:grid-cols-5'>
              <label className='space-y-1 text-sm'>
                <span>表示対象</span>
                <select
                  className='w-full rounded border px-3 py-2'
                  value={target}
                  disabled={!hasAssignments && !loading}
                  onChange={event =>
                    setTarget(
                      event.currentTarget.value as ManagerStaffAnalysisTarget
                    )
                  }
                >
                  <option value='total'>担当エリア全体</option>
                  <option value='clinic'>院別</option>
                </select>
              </label>
              <label className='space-y-1 text-sm'>
                <span>院選択</span>
                <select
                  className='w-full rounded border px-3 py-2'
                  value={clinicId ?? ''}
                  disabled={target !== 'clinic' || !hasAssignments}
                  onChange={event => setClinicId(event.currentTarget.value)}
                >
                  {clinics.map(clinic => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className='space-y-1 text-sm'>
                <span>期間</span>
                <select
                  className='w-full rounded border px-3 py-2'
                  value={period}
                  disabled={!hasAssignments && !loading}
                  onChange={event =>
                    setPeriod(
                      event.currentTarget.value as ManagerAnalysisPeriodType
                    )
                  }
                >
                  {PERIOD_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className='space-y-1 text-sm'>
                <span>比較</span>
                <select
                  className='w-full rounded border px-3 py-2'
                  value={compare}
                  disabled={!hasAssignments && !loading}
                  onChange={event =>
                    setCompare(
                      event.currentTarget
                        .value as ManagerStaffAnalysisCompareMode
                    )
                  }
                >
                  <option value='previous_period'>前期間比</option>
                  <option value='none'>比較なし</option>
                </select>
              </label>
              {period === 'custom' && (
                <div className='grid grid-cols-2 gap-2 md:col-span-1'>
                  <label className='space-y-1 text-sm'>
                    <span>開始</span>
                    <input
                      className='w-full rounded border px-3 py-2'
                      type='date'
                      value={startDate ?? ''}
                      onChange={event =>
                        setStartDate(event.currentTarget.value)
                      }
                    />
                  </label>
                  <label className='space-y-1 text-sm'>
                    <span>終了</span>
                    <input
                      className='w-full rounded border px-3 py-2'
                      type='date'
                      value={endDate ?? ''}
                      onChange={event => setEndDate(event.currentTarget.value)}
                    />
                  </label>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {loading && (
          <p className='text-gray-500'>スタッフ分析データを読み込み中...</p>
        )}
        {error && <p className='text-red-600'>エラー: {error}</p>}

        {!loading && data && !hasAssignments && (
          <Card>
            <CardContent className='py-8 text-center'>
              <p className='font-medium'>担当院がまだ設定されていません。</p>
              <p className='mt-2 text-gray-600 dark:text-gray-300'>
                管理者にマネージャー管理から担当店舗の設定を依頼してください。
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && data && hasAssignments && !hasData && (
          <Card>
            <CardContent className='py-8 text-center'>
              <p className='font-medium'>
                選択した期間のスタッフ分析データがありません。
              </p>
              <p className='mt-2 text-gray-600 dark:text-gray-300'>
                期間または担当院を変更してください。
              </p>
            </CardContent>
          </Card>
        )}

        {data && hasAssignments && (
          <>
            <div className='grid gap-4 md:grid-cols-4'>
              <KpiCard
                label='スタッフ数'
                value={`${data.summary.staffCount}名`}
              />
              <KpiCard
                label='稼働スタッフ数'
                value={`${data.summary.workingStaffCount}名`}
              />
              <KpiCard
                label='総予約対応数'
                value={`${data.summary.reservationCount}件`}
              />
              <KpiCard
                label='完了/来院件数'
                value={`${data.summary.completedReservationCount}件`}
              />
              <KpiCard
                label='スタッフ帰属売上'
                value={formatCurrency(data.summary.totalRevenue)}
              />
              <KpiCard
                label='平均単価'
                value={formatCurrency(data.summary.averageUnitPrice)}
              />
              <KpiCard
                label='キャンセル率'
                value={formatRate(data.summary.cancellationRate)}
              />
              <KpiCard
                label='日報確認件数'
                value={`${data.summary.dailyReportIssueCount}件`}
              />
            </div>

            {data.summary.totalRevenue === 0 && (
              <Card>
                <CardContent className='py-4 text-sm text-amber-700 dark:text-amber-300'>
                  スタッフに紐づく売上明細がありません。予約・稼働データを中心に表示しています。
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>スタッフランキング</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='overflow-x-auto'>
                  <table
                    className='w-full text-sm'
                    aria-label='スタッフランキング'
                  >
                    <thead>
                      <tr className='border-b text-left'>
                        <th className='py-2 pr-3'>スタッフ名</th>
                        <th className='py-2 pr-3'>所属院</th>
                        <th className='py-2 pr-3 text-right'>予約</th>
                        <th className='py-2 pr-3 text-right'>完了/来院</th>
                        <th className='py-2 pr-3 text-right'>売上</th>
                        <th className='py-2 pr-3 text-right'>平均単価</th>
                        <th className='py-2 pr-3 text-right'>キャンセル率</th>
                        <th className='py-2 pr-3 text-right'>売上前期間比</th>
                        <th className='py-2 pr-3 text-right'>予約前期間比</th>
                        <th className='py-2'>状態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.staff.map(row => (
                        <tr
                          key={row.staffId}
                          className='border-b last:border-b-0'
                        >
                          <td className='py-2 pr-3'>{row.staffName}</td>
                          <td className='py-2 pr-3'>{row.clinicName}</td>
                          <td className='py-2 pr-3 text-right'>
                            {row.reservationCount}
                          </td>
                          <td className='py-2 pr-3 text-right'>
                            {row.completedReservationCount}
                          </td>
                          <td className='py-2 pr-3 text-right'>
                            {formatCurrency(row.totalRevenue)}
                          </td>
                          <td className='py-2 pr-3 text-right'>
                            {formatCurrency(row.averageUnitPrice)}
                          </td>
                          <td className='py-2 pr-3 text-right'>
                            {formatRate(row.cancellationRate)}
                          </td>
                          <td className='py-2 pr-3 text-right'>
                            {formatRate(row.revenueChangeRate)}
                          </td>
                          <td className='py-2 pr-3 text-right'>
                            {formatRate(row.reservationChangeRate)}
                          </td>
                          <td className='py-2'>{statusLabel(row.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {target === 'total' && (
              <Card>
                <CardHeader>
                  <CardTitle>院別比較</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='overflow-x-auto'>
                    <table className='w-full text-sm' aria-label='院別比較'>
                      <thead>
                        <tr className='border-b text-left'>
                          <th className='py-2 pr-3'>院名</th>
                          <th className='py-2 pr-3 text-right'>スタッフ数</th>
                          <th className='py-2 pr-3 text-right'>稼働</th>
                          <th className='py-2 pr-3 text-right'>予約</th>
                          <th className='py-2 pr-3 text-right'>売上</th>
                          <th className='py-2 pr-3 text-right'>平均売上</th>
                          <th className='py-2 pr-3 text-right'>キャンセル率</th>
                          <th className='py-2 text-right'>要確認</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.clinicComparison.map(row => (
                          <tr
                            key={row.clinicId}
                            className='border-b last:border-b-0'
                          >
                            <td className='py-2 pr-3'>{row.clinicName}</td>
                            <td className='py-2 pr-3 text-right'>
                              {row.staffCount}
                            </td>
                            <td className='py-2 pr-3 text-right'>
                              {row.workingStaffCount}
                            </td>
                            <td className='py-2 pr-3 text-right'>
                              {row.reservationCount}
                            </td>
                            <td className='py-2 pr-3 text-right'>
                              {formatCurrency(row.totalRevenue)}
                            </td>
                            <td className='py-2 pr-3 text-right'>
                              {formatCurrency(row.averageRevenuePerStaff)}
                            </td>
                            <td className='py-2 pr-3 text-right'>
                              {formatRate(row.cancellationRate)}
                            </td>
                            <td className='py-2 text-right'>
                              {row.attentionStaffCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>要確認項目</CardTitle>
              </CardHeader>
              <CardContent>
                {data.attentionItems.length === 0 ? (
                  <p className='text-gray-500'>要確認項目はありません。</p>
                ) : (
                  <ul className='space-y-3'>
                    {data.attentionItems.map(item => (
                      <li key={item.id} className='rounded border p-3'>
                        <p className='font-medium'>{item.title}</p>
                        <p className='text-sm text-gray-600 dark:text-gray-300'>
                          {item.clinicName}
                          {item.staffName ? ` / ${item.staffName}` : ''}
                          {' - '}
                          {item.description}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>注意事項</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className='list-disc space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300'>
                  {data.disclaimers.map(disclaimer => (
                    <li key={disclaimer}>{disclaimer}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className='p-4'>
        <p className='text-sm text-gray-600 dark:text-gray-300'>{label}</p>
        <p className='mt-2 text-2xl font-semibold'>{value}</p>
      </CardContent>
    </Card>
  );
}
