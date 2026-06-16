'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  api,
  isSuccessResponse,
  type DailyReportsListData,
} from '@/lib/api-client';
import {
  isManagerDailyReportsOverviewStatus,
  type ManagerDailyReportsOverview,
  type ManagerDailyReportsOverviewStatus,
} from '@/lib/manager-daily-reports';
import { useAccessibleClinics } from '@/hooks/useAccessibleClinics';
import { useDashboardBootstrapQuery } from '@/hooks/queries/useDashboardBootstrapQuery';
import { useDailyReportsQuery } from '@/hooks/queries/useDailyReportsQuery';
import { useUserProfileContext } from '@/providers/user-profile-context';

type ReportRow = {
  id: string;
  date: string;
  patients: number;
  revenue: number;
};

type Summary = DailyReportsListData['summary'];
type MonthlyTrend = DailyReportsListData['monthlyTrends'][number];
type ManagerPeriod = 'today' | 'last7days' | 'thisMonth';

const MANAGER_STATUS_OPTIONS: Array<{
  value: ManagerDailyReportsOverviewStatus;
  label: string;
}> = [
  { value: 'all', label: 'すべて' },
  { value: 'submitted', label: '提出済み' },
  { value: 'missing', label: '未提出' },
  { value: 'confirmed', label: '確認済み' },
  { value: 'needs_review', label: '要確認' },
];

const MANAGER_PERIOD_OPTIONS: Array<{
  value: ManagerPeriod;
  label: string;
}> = [
  { value: 'last7days', label: '直近7日' },
  { value: 'today', label: '今日' },
  { value: 'thisMonth', label: '今月' },
];

const MANAGER_STATUS_LABELS: Record<
  Exclude<ManagerDailyReportsOverviewStatus, 'all'>,
  string
> = {
  submitted: '提出済み',
  missing: '未提出',
  confirmed: '確認済み',
  needs_review: '要確認',
};

function formatCurrency(value: number): string {
  return `${Math.round(value).toLocaleString()}円`;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addLocalDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getManagerPeriodRange(period: ManagerPeriod): {
  startDate: string;
  endDate: string;
} {
  const today = new Date();
  const endDate = formatLocalDate(today);

  if (period === 'today') {
    return { startDate: endDate, endDate };
  }

  if (period === 'thisMonth') {
    return {
      startDate: formatLocalDate(
        new Date(today.getFullYear(), today.getMonth(), 1)
      ),
      endDate,
    };
  }

  return {
    startDate: formatLocalDate(addLocalDays(today, -6)),
    endDate,
  };
}

function mapReportRows(reports: DailyReportsListData['reports']): ReportRow[] {
  return reports.map((report, index) => ({
    id: report.id || `report-${index}`,
    date: report.reportDate,
    patients: report.totalPatients ?? 0,
    revenue: Number(report.totalRevenue || 0),
  }));
}

function isManagerPeriod(value: string): value is ManagerPeriod {
  return MANAGER_PERIOD_OPTIONS.some(option => option.value === value);
}

function ProfileErrorView({ message }: { message: string }) {
  return (
    <div className='bg-background min-h-screen py-8'>
      <div className='container mx-auto px-4'>
        <Card className='w-full bg-card'>
          <CardHeader className='bg-card'>
            <CardTitle className='text-red-600'>
              プロフィール取得に失敗しました
            </CardTitle>
          </CardHeader>
          <CardContent className='bg-card space-y-4'>
            <p className='text-foreground'>{message}</p>
            <Button
              onClick={() => window.location.reload()}
              className='bg-blue-600 text-white'
            >
              再読み込み
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ManagerDailyReportsView() {
  const {
    clinics,
    loading: clinicsLoading,
    error: clinicsError,
  } = useAccessibleClinics();
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [period, setPeriod] = useState<ManagerPeriod>('last7days');
  const [status, setStatus] =
    useState<ManagerDailyReportsOverviewStatus>('all');
  const [overview, setOverview] = useState<ManagerDailyReportsOverview | null>(
    null
  );
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const periodRange = useMemo(() => getManagerPeriodRange(period), [period]);

  useEffect(() => {
    if (clinicsLoading) {
      return;
    }

    if (clinics.length === 0) {
      setSelectedClinicId(null);
      setOverview(null);
      return;
    }

    setSelectedClinicId(currentClinicId => {
      if (
        currentClinicId &&
        clinics.some(clinic => clinic.id === currentClinicId)
      ) {
        return currentClinicId;
      }
      return clinics[0].id;
    });
  }, [clinics, clinicsLoading]);

  useEffect(() => {
    if (!selectedClinicId) {
      return;
    }

    let cancelled = false;

    async function fetchOverview() {
      setOverviewLoading(true);
      setOverviewError(null);

      try {
        const response = await api.managerDailyReports.getOverview({
          clinicId: selectedClinicId,
          startDate: periodRange.startDate,
          endDate: periodRange.endDate,
          status,
        });

        if (cancelled) {
          return;
        }

        if (isSuccessResponse(response)) {
          setOverview(response.data);
          return;
        }

        setOverview(null);
        setOverviewError('日報サマリーの取得に失敗しました');
      } catch {
        if (!cancelled) {
          setOverview(null);
          setOverviewError('日報サマリーの取得に失敗しました');
        }
      } finally {
        if (!cancelled) {
          setOverviewLoading(false);
        }
      }
    }

    void fetchOverview();

    return () => {
      cancelled = true;
    };
  }, [periodRange.endDate, periodRange.startDate, selectedClinicId, status]);

  const selectedClinicName =
    clinics.find(clinic => clinic.id === selectedClinicId)?.name ?? '';

  return (
    <div className='bg-background min-h-screen py-8'>
      <div className='container mx-auto px-4 space-y-6'>
        <Card className='w-full bg-card'>
          <CardHeader className='bg-card'>
            <CardTitle className='bg-card'>日報管理</CardTitle>
            <CardDescription className='bg-card'>
              担当院の日報と売上推移を確認します。
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card space-y-4'>
            {clinicsLoading ? (
              <p className='text-gray-500'>担当院を読み込み中...</p>
            ) : clinicsError ? (
              <p className='text-red-500'>{clinicsError}</p>
            ) : clinics.length === 0 ? (
              <p className='text-gray-500'>
                担当院がまだ割り当てられていません。管理者に担当院の設定を依頼してください。
              </p>
            ) : (
              <>
                <div className='grid gap-4 md:grid-cols-3'>
                  {clinics.length > 1 ? (
                    <label className='space-y-2 text-sm font-medium text-foreground'>
                      <span>担当院</span>
                      <select
                        value={selectedClinicId ?? ''}
                        onChange={event =>
                          setSelectedClinicId(event.target.value)
                        }
                        className='w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-card dark:text-foreground'
                      >
                        {clinics.map(clinic => (
                          <option key={clinic.id} value={clinic.id}>
                            {clinic.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div className='space-y-2 text-sm text-foreground'>
                      <div className='font-medium'>担当院</div>
                      <div className='rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700'>
                        {selectedClinicName}
                      </div>
                    </div>
                  )}

                  <label className='space-y-2 text-sm font-medium text-foreground'>
                    <span>期間</span>
                    <select
                      value={period}
                      onChange={event => {
                        if (isManagerPeriod(event.target.value)) {
                          setPeriod(event.target.value);
                        }
                      }}
                      className='w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-card dark:text-foreground'
                    >
                      {MANAGER_PERIOD_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className='space-y-2 text-sm font-medium text-foreground'>
                    <span>ステータス</span>
                    <select
                      value={status}
                      onChange={event => {
                        if (
                          isManagerDailyReportsOverviewStatus(
                            event.target.value
                          )
                        ) {
                          setStatus(event.target.value);
                        }
                      }}
                      className='w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-card dark:text-foreground'
                    >
                      {MANAGER_STATUS_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <p className='text-sm text-gray-500'>
                  {periodRange.startDate} - {periodRange.endDate}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {overviewLoading && (
          <Card className='w-full bg-card'>
            <CardContent className='bg-card py-6 text-gray-500'>
              日報サマリーを読み込み中...
            </CardContent>
          </Card>
        )}

        {overviewError && !overviewLoading && (
          <Card className='w-full bg-card'>
            <CardContent className='bg-card py-6 text-red-500'>
              {overviewError}
            </CardContent>
          </Card>
        )}

        {overview && !overviewLoading && (
          <>
            <Card className='w-full bg-card'>
              <CardHeader className='bg-card'>
                <CardTitle className='bg-card'>KPIサマリー</CardTitle>
                <CardDescription className='bg-card'>
                  {overview.clinic.name} の期間内集計です。
                </CardDescription>
              </CardHeader>
              <CardContent className='bg-card'>
                <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4'>
                  <MetricBox
                    label='累計売上'
                    value={formatCurrency(overview.summary.totalRevenue)}
                  />
                  <MetricBox
                    label='平均売上'
                    value={formatCurrency(overview.summary.averageRevenue)}
                  />
                  <MetricBox
                    label='患者数'
                    value={`${overview.summary.patientCount}名`}
                  />
                  <MetricBox
                    label='客単価'
                    value={formatCurrency(
                      overview.summary.averageRevenuePerPatient
                    )}
                  />
                  <MetricBox
                    label='未提出日'
                    value={`${overview.summary.missingReportDays}日`}
                  />
                  <MetricBox
                    label='要確認日'
                    value={`${overview.summary.needsReviewDays}日`}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className='w-full bg-card'>
              <CardHeader className='bg-card'>
                <CardTitle className='bg-card'>売上推移</CardTitle>
                <CardDescription className='bg-card'>
                  日別の売上・患者数・客単価を表示します。
                </CardDescription>
              </CardHeader>
              <CardContent className='bg-card overflow-x-auto'>
                <table className='w-full min-w-[720px] text-sm'>
                  <thead>
                    <tr className='border-b text-left text-gray-500'>
                      <th className='py-2 pr-4 font-medium'>日付</th>
                      <th className='py-2 pr-4 font-medium'>総売上</th>
                      <th className='py-2 pr-4 font-medium'>保険</th>
                      <th className='py-2 pr-4 font-medium'>自費</th>
                      <th className='py-2 pr-4 font-medium'>患者数</th>
                      <th className='py-2 pr-4 font-medium'>客単価</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.timeline.map(row => (
                      <tr key={row.date} className='border-b last:border-0'>
                        <td className='py-2 pr-4'>{row.date}</td>
                        <td className='py-2 pr-4'>
                          {formatCurrency(row.totalRevenue)}
                        </td>
                        <td className='py-2 pr-4'>
                          {formatCurrency(row.insuranceRevenue)}
                        </td>
                        <td className='py-2 pr-4'>
                          {formatCurrency(row.privateRevenue)}
                        </td>
                        <td className='py-2 pr-4'>{row.patientCount}名</td>
                        <td className='py-2 pr-4'>
                          {formatCurrency(row.averageRevenuePerPatient)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card className='w-full bg-card'>
              <CardHeader className='bg-card'>
                <CardTitle className='bg-card'>日報一覧</CardTitle>
                <CardDescription className='bg-card'>
                  選択した条件の日報ステータスです。
                </CardDescription>
              </CardHeader>
              <CardContent className='bg-card'>
                {overview.reports.length === 0 ? (
                  <p className='text-gray-500'>表示できる日報がありません。</p>
                ) : (
                  <div className='space-y-3'>
                    {overview.reports.map(report => (
                      <div
                        key={report.id}
                        className='flex flex-col gap-2 rounded border border-gray-200 p-3 dark:border-gray-700 md:flex-row md:items-center md:justify-between'
                      >
                        <div>
                          <div className='font-medium'>{report.date}</div>
                          <div className='text-sm text-gray-500'>
                            {MANAGER_STATUS_LABELS[report.status]}
                          </div>
                        </div>
                        <div className='text-sm text-muted-foreground'>
                          <span className='mr-4'>
                            患者数: {report.patientCount}名
                          </span>
                          <span>
                            売上: {formatCurrency(report.totalRevenue)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className='text-center p-4 bg-muted rounded'>
      <p className='text-xl font-bold text-blue-600'>{value}</p>
      <p className='text-sm text-muted-foreground'>{label}</p>
    </div>
  );
}

function StandardDailyReportsView({
  clinicId,
  initialDailyReports,
  deferReportsFetch,
}: {
  clinicId: string | null;
  initialDailyReports?: DailyReportsListData;
  deferReportsFetch: boolean;
}) {
  const reportsQuery = useDailyReportsQuery({
    clinicId,
    initialData: initialDailyReports,
    enabled: !deferReportsFetch,
  });
  const reportsData = reportsQuery.data ?? initialDailyReports;
  const rows = useMemo(
    () => mapReportRows(reportsData?.reports ?? []),
    [reportsData?.reports]
  );
  const summary: Summary | null = reportsData?.summary ?? null;
  const monthlyTrends: MonthlyTrend[] = reportsData?.monthlyTrends ?? [];
  const loading = !reportsData && (deferReportsFetch || reportsQuery.isLoading);
  const error =
    !reportsData && reportsQuery.isError
      ? reportsQuery.error instanceof Error
        ? reportsQuery.error.message
        : '日報データの取得に失敗しました'
      : null;

  const hasClinic = Boolean(clinicId);

  return (
    <div className='bg-background min-h-screen py-8'>
      <div className='container mx-auto px-4'>
        <Card className='w-full bg-card mb-8'>
          <CardHeader className='bg-card'>
            <CardTitle className='bg-card'>デジタル日報管理</CardTitle>
            <CardDescription className='bg-card'>
              本日の日報を入力・管理します。
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            <div className='space-y-4'>
              <p className='text-gray-600'>日報の入力・管理を行います</p>
              <Link href='/daily-reports/input'>
                <Button className='bg-blue-600 text-white'>日報を入力</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {summary && (
          <Card className='w-full bg-card mb-8'>
            <CardHeader className='bg-card'>
              <CardTitle className='bg-card'>サマリー</CardTitle>
              <CardDescription className='bg-card'>
                日報の集計データを表示します。
              </CardDescription>
            </CardHeader>
            <CardContent className='bg-card'>
              <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                <MetricBox
                  label='登録日報数'
                  value={String(summary.totalReports)}
                />
                <MetricBox
                  label='平均患者数/日'
                  value={String(Math.round(summary.averagePatients))}
                />
                <MetricBox
                  label='平均売上/日'
                  value={Math.round(summary.averageRevenue).toLocaleString()}
                />
                <MetricBox
                  label='累計売上'
                  value={Math.round(summary.totalRevenue).toLocaleString()}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {monthlyTrends.length > 0 && (
          <Card className='w-full bg-card mb-8'>
            <CardHeader className='bg-card'>
              <CardTitle className='bg-card'>月別トレンド</CardTitle>
              <CardDescription className='bg-card'>
                月ごとの日報集計データを表示します。
              </CardDescription>
            </CardHeader>
            <CardContent className='bg-card'>
              <div className='space-y-3'>
                {monthlyTrends.map(trend => (
                  <div
                    key={trend.month}
                    className='flex justify-between items-center p-3 bg-muted rounded'
                  >
                    <div className='font-medium text-foreground'>
                      {trend.month}
                    </div>
                    <div className='flex space-x-6 text-sm'>
                      <div className='text-muted-foreground'>
                        <span className='font-medium'>{trend.reports}</span> 件
                      </div>
                      <div className='text-muted-foreground'>
                        患者:{' '}
                        <span className='font-medium'>
                          {trend.totalPatients}
                        </span>{' '}
                        名
                      </div>
                      <div className='text-muted-foreground'>
                        売上:{' '}
                        <span className='font-medium'>
                          {Math.round(trend.totalRevenue).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className='w-full bg-card'>
          <CardHeader className='bg-card'>
            <CardTitle className='bg-card'>施術記録一覧</CardTitle>
            <CardDescription className='bg-card'>
              最近の日報サマリーを表示します。
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card'>
            {loading ? (
              <div className='text-gray-500'>読み込み中...</div>
            ) : !hasClinic ? (
              <div className='text-gray-500'>
                アクセス可能なクリニックが割り当てられていません。
              </div>
            ) : error ? (
              <div className='text-red-500'>{error}</div>
            ) : (
              <div className='space-y-3'>
                {rows.length === 0 ? (
                  <div className='text-gray-500'>
                    表示できる日報がありません。
                  </div>
                ) : (
                  rows.map(report => (
                    <div
                      key={report.id}
                      className='flex justify-between items-center p-3 bg-muted rounded'
                    >
                      <div className='flex-1'>
                        <div className='font-medium text-foreground'>
                          {report.date}
                        </div>
                        <div className='text-sm text-muted-foreground mt-1'>
                          <span className='mr-4'>
                            患者数: {report.patients}名
                          </span>
                          <span>売上: {report.revenue.toLocaleString()}</span>
                        </div>
                      </div>
                      <Link href={`/daily-reports/edit/${report.id}`}>
                        <Button variant='outline' size='sm' className='ml-3'>
                          編集
                        </Button>
                      </Link>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const Page: React.FC = () => {
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfileContext();
  const bootstrapQuery = useDashboardBootstrapQuery({
    clinicId: profile?.clinicId ?? null,
    enabled: !profile || profile.role !== 'manager',
  });
  const bootstrapData = bootstrapQuery.data;
  const effectiveProfile = profile ?? bootstrapData?.profile ?? null;
  const initialDailyReports =
    effectiveProfile?.clinicId &&
    effectiveProfile.clinicId === bootstrapData?.profile.clinicId
      ? bootstrapData.dailyReports
      : undefined;
  const deferReportsFetch =
    effectiveProfile?.role !== 'manager' &&
    bootstrapQuery.isLoading &&
    !initialDailyReports;

  if (profileError && !profileLoading && !bootstrapData) {
    return <ProfileErrorView message={profileError} />;
  }

  if (profileLoading && !bootstrapData) {
    return (
      <div className='bg-background min-h-screen py-8'>
        <div className='container mx-auto px-4'>
          <Card className='w-full bg-card'>
            <CardContent className='bg-card py-6 text-gray-500'>
              読み込み中...
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (effectiveProfile?.role === 'manager') {
    return <ManagerDailyReportsView />;
  }

  return (
    <StandardDailyReportsView
      clinicId={effectiveProfile?.clinicId ?? null}
      initialDailyReports={initialDailyReports}
      deferReportsFetch={deferReportsFetch}
    />
  );
};

export default Page;
