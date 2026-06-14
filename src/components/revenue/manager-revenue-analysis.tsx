'use client';

import React from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { useManagerRevenueAnalysis } from '@/hooks/useManagerRevenueAnalysis';
import {
  type ManagerRevenueAnalysisPeriodType,
  type ManagerRevenueAnalysisResponse,
  type ManagerRevenueAnalysisTarget,
  type ManagerRevenueCompareMode,
  type RevenueBreakdownPoint,
} from '@/lib/manager-revenue-analysis';
import type { TimeSeriesPoint } from '@/lib/manager-analysis-period';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const PAGE_CLASS = 'min-h-screen bg-background p-4 sm:p-6';
const CONTENT_CLASS = 'mx-auto max-w-[1120px] space-y-6';
const INPUT_CLASS =
  'h-10 rounded border border-border bg-background px-3 text-sm text-foreground';

const PERIOD_OPTIONS: Array<{
  value: ManagerRevenueAnalysisPeriodType;
  label: string;
}> = [
  { value: 'all', label: '全期間' },
  { value: 'month', label: '今月' },
  { value: 'previous_month', label: '先月' },
  { value: 'last_3_months', label: '直近3か月' },
  { value: 'year', label: '今年' },
  { value: 'custom', label: '任意期間' },
];

const TARGET_OPTIONS: Array<{
  value: ManagerRevenueAnalysisTarget;
  label: string;
}> = [
  { value: 'total', label: '担当院合計' },
  { value: 'clinic', label: '選択院' },
];

const COMPARE_OPTIONS: Array<{
  value: ManagerRevenueCompareMode;
  label: string;
}> = [
  { value: 'previous_period', label: '前期間比' },
  { value: 'none', label: '比較なし' },
];

function formatCurrency(value: number): string {
  return `${Math.round(value).toLocaleString()}円`;
}

function formatCount(value: number, unit: string): string {
  return `${Math.round(value).toLocaleString()}${unit}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return '-';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function validateCustomPeriod(params: {
  period: ManagerRevenueAnalysisPeriodType;
  startDate: string;
  endDate: string;
}): string | null {
  if (params.period !== 'custom') {
    return null;
  }
  if (!params.startDate || !params.endDate) {
    return '任意期間では開始日と終了日を指定してください。';
  }
  if (params.startDate > params.endDate) {
    return '開始日は終了日以前の日付を指定してください。';
  }
  return null;
}

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <Card className='bg-card'>
      <CardContent className='p-4'>
        <p className='text-sm text-muted-foreground'>{label}</p>
        <p className='mt-2 text-2xl font-semibold text-foreground'>{value}</p>
        {description ? (
          <p className='mt-1 text-xs text-muted-foreground'>{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DetailMetric({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className='rounded border border-border bg-card p-4'>
      <p className='text-sm text-muted-foreground'>{label}</p>
      <p className='mt-2 text-xl font-semibold text-foreground'>{value}</p>
      {description ? (
        <p className='mt-1 text-xs text-muted-foreground'>{description}</p>
      ) : null}
    </div>
  );
}

function TrendCard({
  title,
  data,
  formatValue,
}: {
  title: string;
  data: TimeSeriesPoint[];
  formatValue: (value: number) => string;
}) {
  const maxValue = Math.max(...data.map(point => point.value), 0);

  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className='text-sm text-gray-500'>データがありません</p>
        ) : (
          <div className='space-y-3' role='img' aria-label={title}>
            {data.map(point => {
              const width = maxValue > 0 ? (point.value / maxValue) * 100 : 0;
              return (
                <div key={`${point.bucketStart}-${point.bucketEnd}`}>
                  <div className='mb-1 flex items-center justify-between text-xs text-gray-500'>
                    <span>{point.label}</span>
                    <span>{formatValue(point.value)}</span>
                  </div>
                  <div className='h-2 rounded bg-muted'>
                    <div
                      className='h-2 rounded bg-blue-600'
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InsurancePrivateTrend({
  data,
}: {
  data: ManagerRevenueAnalysisResponse['charts']['insurancePrivateBreakdown'];
}) {
  const maxValue = Math.max(
    ...data.map(point => point.insuranceRevenue + point.privateRevenue),
    0
  );

  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>保険 / 自費 推移</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className='text-sm text-gray-500'>データがありません</p>
        ) : (
          <div className='space-y-3' role='img' aria-label='保険 / 自費 推移'>
            {data.map(point => {
              const total = point.insuranceRevenue + point.privateRevenue;
              const width = maxValue > 0 ? (total / maxValue) * 100 : 0;
              const insuranceWidth =
                total > 0 ? (point.insuranceRevenue / total) * 100 : 0;
              return (
                <div key={`${point.bucketStart}-${point.bucketEnd}`}>
                  <div className='mb-1 flex items-center justify-between text-xs text-gray-500'>
                    <span>{point.label}</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                  <div
                    className='flex h-2 overflow-hidden rounded bg-muted'
                    style={{ width: `${width}%` }}
                  >
                    <div
                      className='h-2 bg-blue-600'
                      style={{ width: `${insuranceWidth}%` }}
                    />
                    <div className='h-2 flex-1 bg-emerald-500' />
                  </div>
                </div>
              );
            })}
            <div className='flex gap-4 text-xs text-gray-500'>
              <span>保険</span>
              <span>自費</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownCard({ data }: { data: RevenueBreakdownPoint[] }) {
  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>収益カテゴリ内訳</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className='text-sm text-gray-500'>データがありません</p>
        ) : (
          <div className='space-y-3'>
            {data.map(point => (
              <div
                key={point.code}
                className='flex items-center justify-between rounded border p-3 text-sm'
              >
                <div>
                  <p className='font-medium'>{point.name}</p>
                  <p className='text-xs text-gray-500'>
                    構成比 {formatPercent(point.share)}
                  </p>
                </div>
                <div className='text-right'>
                  <p className='font-semibold'>{formatCurrency(point.value)}</p>
                  <p className='text-xs text-gray-500'>
                    要確認 {point.needsReviewCount.toLocaleString()} / ブロック{' '}
                    {point.blockedCount.toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClinicComparisonBars({
  title,
  data,
  formatValue,
}: {
  title: string;
  data: ManagerRevenueAnalysisResponse['charts']['clinicRevenueComparison'];
  formatValue: (value: number) => string;
}) {
  const maxValue = Math.max(...data.map(point => point.value), 0);

  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className='text-sm text-gray-500'>データがありません</p>
        ) : (
          <div className='space-y-3' role='img' aria-label={title}>
            {data.map(point => {
              const width = maxValue > 0 ? (point.value / maxValue) * 100 : 0;
              return (
                <div key={point.clinicId}>
                  <div className='mb-1 flex items-center justify-between text-xs text-gray-500'>
                    <span>{point.clinicName}</span>
                    <span>{formatValue(point.value)}</span>
                  </div>
                  <div className='h-2 rounded bg-muted'>
                    <div
                      className='h-2 rounded bg-emerald-600'
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClinicComparisonTable({
  rows,
}: {
  rows: ManagerRevenueAnalysisResponse['clinicComparison'];
}) {
  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>院別比較</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto'>
          <table className='min-w-full text-sm'>
            <thead>
              <tr className='border-b text-left text-gray-500'>
                <th className='whitespace-nowrap px-3 py-2 font-medium'>
                  院名
                </th>
                <th className='whitespace-nowrap px-3 py-2 font-medium'>
                  総売上
                </th>
                <th className='whitespace-nowrap px-3 py-2 font-medium'>
                  構成比
                </th>
                <th className='whitespace-nowrap px-3 py-2 font-medium'>
                  来院数
                </th>
                <th className='whitespace-nowrap px-3 py-2 font-medium'>
                  客単価
                </th>
                <th className='whitespace-nowrap px-3 py-2 font-medium'>
                  前期間比
                </th>
                <th className='whitespace-nowrap px-3 py-2 font-medium'>
                  日報未提出
                </th>
                <th className='whitespace-nowrap px-3 py-2 font-medium'>
                  要確認
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.clinicId} className='border-b last:border-b-0'>
                  <td className='whitespace-nowrap px-3 py-3 font-medium'>
                    {row.clinicName}
                  </td>
                  <td className='whitespace-nowrap px-3 py-3'>
                    {formatCurrency(row.operatingRevenue)}
                  </td>
                  <td className='whitespace-nowrap px-3 py-3'>
                    {formatPercent(row.revenueShare)}
                  </td>
                  <td className='whitespace-nowrap px-3 py-3'>
                    {formatCount(row.visitCount, '回')}
                  </td>
                  <td className='whitespace-nowrap px-3 py-3'>
                    {formatCurrency(row.averageRevenuePerVisit)}
                  </td>
                  <td className='whitespace-nowrap px-3 py-3'>
                    {formatPercent(row.operatingRevenueChangeRate)}
                  </td>
                  <td className='whitespace-nowrap px-3 py-3'>
                    {formatCount(row.missingReportDays, '日')}
                  </td>
                  <td className='whitespace-nowrap px-3 py-3'>
                    {formatCount(row.needsReviewCount, '件')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function ManagerRevenueAnalysis() {
  const [draftTarget, setDraftTarget] =
    React.useState<ManagerRevenueAnalysisTarget>('total');
  const [draftPeriod, setDraftPeriod] =
    React.useState<ManagerRevenueAnalysisPeriodType>('month');
  const [draftCompare, setDraftCompare] =
    React.useState<ManagerRevenueCompareMode>('previous_period');
  const [draftCustomStartDate, setDraftCustomStartDate] = React.useState('');
  const [draftCustomEndDate, setDraftCustomEndDate] = React.useState('');
  const [appliedTarget, setAppliedTarget] =
    React.useState<ManagerRevenueAnalysisTarget>('total');
  const [appliedPeriod, setAppliedPeriod] =
    React.useState<ManagerRevenueAnalysisPeriodType>('month');
  const [appliedCompare, setAppliedCompare] =
    React.useState<ManagerRevenueCompareMode>('previous_period');
  const [appliedCustomStartDate, setAppliedCustomStartDate] =
    React.useState('');
  const [appliedCustomEndDate, setAppliedCustomEndDate] = React.useState('');
  const [draftClinicId, setDraftClinicId] = React.useState<string | null>(null);
  const [validationError, setValidationError] = React.useState<string | null>(
    null
  );

  const { data, loading, error, selectedClinicId, setSelectedClinicId } =
    useManagerRevenueAnalysis({
      target: appliedTarget,
      period: appliedPeriod,
      startDate:
        appliedPeriod === 'custom' ? appliedCustomStartDate || null : null,
      endDate: appliedPeriod === 'custom' ? appliedCustomEndDate || null : null,
      compare: appliedCompare,
    });
  // 院選択はドラフト状態に保持し、適用時のみ setSelectedClinicId（=再フェッチ）する
  const effectiveDraftClinicId = draftClinicId ?? selectedClinicId;

  const applyFilters = React.useCallback(() => {
    const nextError = validateCustomPeriod({
      period: draftPeriod,
      startDate: draftCustomStartDate,
      endDate: draftCustomEndDate,
    });
    setValidationError(nextError);
    if (nextError) {
      return;
    }

    setSelectedClinicId(
      draftTarget === 'clinic' ? effectiveDraftClinicId : null
    );
    setAppliedTarget(draftTarget);
    setAppliedPeriod(draftPeriod);
    setAppliedCompare(draftCompare);
    setAppliedCustomStartDate(draftCustomStartDate);
    setAppliedCustomEndDate(draftCustomEndDate);
  }, [
    draftCompare,
    draftCustomEndDate,
    draftCustomStartDate,
    draftPeriod,
    draftTarget,
    effectiveDraftClinicId,
    setSelectedClinicId,
  ]);

  const resetFilters = React.useCallback(() => {
    setValidationError(null);
    setDraftTarget('total');
    setDraftPeriod('month');
    setDraftCompare('previous_period');
    setDraftCustomStartDate('');
    setDraftCustomEndDate('');
    setDraftClinicId(null);
    setAppliedTarget('total');
    setAppliedPeriod('month');
    setAppliedCompare('previous_period');
    setAppliedCustomStartDate('');
    setAppliedCustomEndDate('');
    setSelectedClinicId(null);
  }, [setSelectedClinicId]);

  if (loading) {
    return (
      <div className={`${PAGE_CLASS} flex items-center justify-center`}>
        <p className='text-gray-500'>収益分析データを読み込み中です...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={PAGE_CLASS}>
        <div className={CONTENT_CLASS}>
          <Card className='border-red-200 bg-red-50'>
            <CardContent className='p-6 text-red-700'>{error}</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={PAGE_CLASS}>
        <div className={CONTENT_CLASS}>
          <Card className='bg-card'>
            <CardContent className='p-6 text-gray-500'>
              表示できる収益分析データがありません。
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (data.assignedClinics.length === 0) {
    return (
      <div className={PAGE_CLASS}>
        <div className={CONTENT_CLASS}>
          <Card className='bg-card'>
            <CardHeader>
              <CardTitle>担当院がまだ設定されていません。</CardTitle>
              <CardDescription>
                管理者に担当店舗の設定を依頼してください。
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  const summary = data.summary;
  const hasNoPeriodData =
    summary.operatingRevenue === 0 &&
    summary.visitCount === 0 &&
    summary.reportDays === 0;

  return (
    <div className={PAGE_CLASS}>
      <div className={CONTENT_CLASS}>
        <div>
          <h1 className='text-2xl font-semibold text-foreground'>収益分析</h1>
          <p className='mt-1 text-sm text-gray-500'>
            担当院の売上推移と収益構造を確認できます。
          </p>
        </div>

        <Card className='bg-card'>
          <CardHeader>
            <CardTitle>フィルター</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6'>
              <label className='flex flex-col gap-1 text-sm'>
                対象
                <select
                  className={INPUT_CLASS}
                  value={draftTarget}
                  onChange={event =>
                    setDraftTarget(
                      event.target.value as ManagerRevenueAnalysisTarget
                    )
                  }
                >
                  {TARGET_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className='flex flex-col gap-1 text-sm'>
                院選択
                <select
                  className={INPUT_CLASS}
                  disabled={draftTarget !== 'clinic'}
                  value={effectiveDraftClinicId ?? ''}
                  onChange={event => setDraftClinicId(event.target.value)}
                >
                  {data.assignedClinics.map(clinic => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className='flex flex-col gap-1 text-sm'>
                期間
                <select
                  className={INPUT_CLASS}
                  value={draftPeriod}
                  onChange={event =>
                    setDraftPeriod(
                      event.target.value as ManagerRevenueAnalysisPeriodType
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

              <label className='flex flex-col gap-1 text-sm'>
                開始日
                <input
                  className={INPUT_CLASS}
                  type='date'
                  disabled={draftPeriod !== 'custom'}
                  value={draftCustomStartDate}
                  onChange={event =>
                    setDraftCustomStartDate(event.target.value)
                  }
                />
              </label>

              <label className='flex flex-col gap-1 text-sm'>
                終了日
                <input
                  className={INPUT_CLASS}
                  type='date'
                  disabled={draftPeriod !== 'custom'}
                  value={draftCustomEndDate}
                  onChange={event => setDraftCustomEndDate(event.target.value)}
                />
              </label>

              <label className='flex flex-col gap-1 text-sm'>
                比較
                <select
                  className={INPUT_CLASS}
                  value={draftCompare}
                  onChange={event =>
                    setDraftCompare(
                      event.target.value as ManagerRevenueCompareMode
                    )
                  }
                >
                  {COMPARE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {validationError ? (
              <p className='mt-3 text-sm text-red-600'>{validationError}</p>
            ) : null}

            <div className='mt-4 flex flex-wrap gap-2'>
              <Button type='button' onClick={applyFilters}>
                <Search className='mr-2 h-4 w-4' />
                適用
              </Button>
              <Button type='button' variant='outline' onClick={resetFilters}>
                <RefreshCw className='mr-2 h-4 w-4' />
                リセット
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className='space-y-2'>
          {data.disclaimers.map(disclaimer => (
            <p
              key={disclaimer}
              className='rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900'
            >
              {disclaimer}
            </p>
          ))}
        </div>

        {hasNoPeriodData ? (
          <Card className='bg-card'>
            <CardContent className='p-6 text-gray-500'>
              選択期間の収益データはまだありません。日報が提出されるとここに集計されます。
            </CardContent>
          </Card>
        ) : null}

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <SummaryCard
            label='担当院数'
            value={formatCount(summary.clinicCount, '院')}
          />
          <SummaryCard
            label='総売上'
            value={formatCurrency(summary.operatingRevenue)}
          />
          <SummaryCard
            label='前期間比'
            value={formatPercent(data.comparison.operatingRevenueChangeRate)}
            description={
              data.comparison.active &&
              data.comparison.previousStartDate &&
              data.comparison.previousEndDate
                ? `前期間 ${data.comparison.previousStartDate} - ${data.comparison.previousEndDate}`
                : '比較なし'
            }
          />
          <SummaryCard
            label='来院数'
            value={formatCount(summary.visitCount, '回')}
            description={formatPercent(data.comparison.visitCountChangeRate)}
          />
          <SummaryCard
            label='客単価'
            value={formatCurrency(summary.averageRevenuePerVisit)}
            description='来院1回あたり売上'
          />
          <SummaryCard
            label='保険売上'
            value={formatCurrency(summary.insuranceRevenue)}
          />
          <SummaryCard
            label='自費売上'
            value={formatCurrency(summary.privateRevenue)}
          />
          <SummaryCard
            label='見込み要確認'
            value={formatCount(summary.needsReviewCount, '件')}
          />
          <SummaryCard
            label='日報未提出日数'
            value={formatCount(summary.missingReportDays, '日')}
            description='定休日を含む暫定値'
          />
        </div>

        <div className='grid grid-cols-1 gap-6 xl:grid-cols-2'>
          <TrendCard
            title='売上推移'
            data={data.charts.revenue}
            formatValue={formatCurrency}
          />
          <TrendCard
            title='来院数推移'
            data={data.charts.visits}
            formatValue={value => formatCount(value, '回')}
          />
          <TrendCard
            title='客単価推移'
            data={data.charts.averageRevenuePerVisit}
            formatValue={formatCurrency}
          />
          <InsurancePrivateTrend data={data.charts.insurancePrivateBreakdown} />
          <BreakdownCard data={data.charts.contextBreakdown} />
          <ClinicComparisonBars
            title='院別売上比較'
            data={data.charts.clinicRevenueComparison}
            formatValue={formatCurrency}
          />
          <ClinicComparisonBars
            title='院別客単価比較'
            data={data.charts.clinicAverageRevenueComparison}
            formatValue={formatCurrency}
          />
        </div>

        <ClinicComparisonTable rows={data.clinicComparison} />

        {data.target.type === 'clinic' ? (
          <Card className='bg-card'>
            <CardHeader>
              <CardTitle>選択院詳細</CardTitle>
              <CardDescription>
                {data.assignedClinics.find(
                  clinic => clinic.id === data.target.clinicId
                )?.name ?? '選択院'}
                の収益推移と確認状況
              </CardDescription>
            </CardHeader>
            <CardContent className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
              <DetailMetric
                label='総売上'
                value={formatCurrency(summary.operatingRevenue)}
              />
              <DetailMetric
                label='要確認 / ブロック'
                value={`${summary.needsReviewCount.toLocaleString()} / ${summary.blockedCount.toLocaleString()}件`}
              />
              <DetailMetric
                label='患者分析'
                value='参照のみ'
                description='患者分析画面から予約ベースの指標を確認'
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
