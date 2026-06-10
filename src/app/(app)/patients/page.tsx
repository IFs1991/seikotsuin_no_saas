'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import {
  usePatientAnalysis,
  type PatientAnalysisViewModel,
} from '@/hooks/usePatientAnalysis';
import { useManagerPatientAnalysis } from '@/hooks/useManagerPatientAnalysis';
import { useUserProfileContext } from '@/providers/user-profile-context';
import { normalizeRole } from '@/lib/constants/roles';
import type {
  ManagerPatientAnalysisResponse,
  ManagerPatientClinicDetail,
  ManagerPatientClinicSummary,
} from '@/lib/manager-patient-analysis';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const PAGE_CLASS = 'min-h-screen bg-[#f9fafb] p-4 dark:bg-[#1a1a1a] sm:p-6';
const CONTENT_CLASS = 'mx-auto max-w-[960px] space-y-6';
const TAB_BASE_CLASS = 'px-4 py-2 rounded text-sm font-medium';
const ACTIVE_TAB_CLASS = `${TAB_BASE_CLASS} bg-blue-600 text-white`;
const INACTIVE_TAB_CLASS = `${TAB_BASE_CLASS} bg-gray-200 text-gray-700 hover:bg-gray-300`;
const ROW_CLASS =
  'flex items-center justify-between rounded bg-gray-50 p-3 dark:bg-[#2d2d2d]';
const SUMMARY_CARD_CLASS = 'bg-card';

type RiskLevel = PatientAnalysisViewModel['riskScores'][number]['riskLevel'];

const RISK_BADGE_CLASS: Record<RiskLevel, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
};

const RISK_LABEL: Record<RiskLevel, string> = {
  high: '高リスク',
  medium: '中リスク',
  low: '低リスク',
};

function isManagerRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'manager';
}

function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString()}円`;
}

function formatPercent(value: number) {
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}%`;
}

function ReloadButton() {
  return (
    <Button
      onClick={() => window.location.reload()}
      className='bg-blue-600 text-white'
    >
      再読み込み
    </Button>
  );
}

function PageMessage({
  title,
  description,
  tone = 'default',
  action,
}: {
  title: string;
  description?: string;
  tone?: 'default' | 'error';
  action?: React.ReactNode;
}) {
  return (
    <div className={PAGE_CLASS}>
      <div className='mx-auto max-w-[800px]'>
        <Card
          className={
            tone === 'error' ? 'bg-card border border-red-200' : 'bg-card'
          }
        >
          <CardHeader>
            <CardTitle
              className={tone === 'error' ? 'text-red-600' : undefined}
            >
              {title}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          {action && <CardContent>{action}</CardContent>}
        </Card>
      </div>
    </div>
  );
}

const PatientTabs = React.memo(function PatientTabs() {
  return (
    <div className='flex space-x-2'>
      <span className={ACTIVE_TAB_CLASS} aria-current='page'>
        患者分析
      </span>
      <Link href='/patients/list' className={INACTIVE_TAB_CLASS}>
        患者一覧
      </Link>
    </div>
  );
});

const ConversionSection = React.memo(function ConversionSection({
  stages,
}: {
  stages: PatientAnalysisViewModel['conversionData']['stages'];
}) {
  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>患者フロー分析</CardTitle>
        <CardDescription>新患から再診への転換率とトレンド分析</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-4'>
          {stages.map(stage => (
            <div key={stage.name} className={ROW_CLASS}>
              <span>{stage.name}</span>
              <div className='flex items-center space-x-2'>
                <span className='font-bold'>{stage.value}人</span>
                <span className='text-sm text-gray-500'>
                  ({stage.percentage}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

const SummaryCards = React.memo(function SummaryCards({
  ltvRanking,
  visitCounts,
}: {
  ltvRanking: PatientAnalysisViewModel['ltvRanking'];
  visitCounts: PatientAnalysisViewModel['visitCounts'];
}) {
  return (
    <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
      <Card className='bg-card'>
        <CardHeader>
          <CardTitle>平均通院回数</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='text-4xl font-bold text-[#1e3a8a]'>
            {visitCounts.average}回
          </div>
          <p className='text-[#6b7280]'>前月比: {visitCounts.monthlyChange}%</p>
        </CardContent>
      </Card>

      <Card className='bg-card'>
        <CardHeader>
          <CardTitle>患者LTV</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='space-y-2'>
            {ltvRanking.slice(0, 3).map(patient => (
              <div
                key={patient.name}
                className='flex items-center justify-between'
              >
                <span>{patient.name}</span>
                <span className='font-bold'>
                  {patient.ltv.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

const RiskSection = React.memo(function RiskSection({
  riskScores,
}: {
  riskScores: PatientAnalysisViewModel['riskScores'];
}) {
  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>離脱リスク分析</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          {riskScores.map(patient => (
            <div key={patient.id} className={ROW_CLASS}>
              <div>
                <p className='font-medium'>{patient.name}</p>
                <p className='text-sm text-gray-500'>
                  最終来院: {patient.lastVisit}
                </p>
              </div>
              <div className='text-right'>
                <span
                  className={`rounded px-2 py-1 text-xs ${RISK_BADGE_CLASS[patient.riskLevel]}`}
                >
                  {RISK_LABEL[patient.riskLevel]}
                </span>
                <p className='mt-1 text-sm font-bold'>
                  スコア: {patient.score}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

const SegmentSection = React.memo(function SegmentSection({
  segmentData,
}: {
  segmentData: PatientAnalysisViewModel['segmentData'];
}) {
  const hasVisitSegments = segmentData.visit.length > 0;
  const segmentItems = hasVisitSegments ? segmentData.visit : segmentData.age;
  if (segmentItems.length === 0) return null;

  const segmentTitle = hasVisitSegments ? '来院区分' : '年齢層';
  const segmentUnit = hasVisitSegments ? '人' : '%';

  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>セグメント分析</CardTitle>
        <CardDescription>{segmentTitle}ごとの患者数</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-4'>
          <div className='flex items-center justify-between rounded bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800'>
            <span>{segmentTitle}</span>
            <span>{segmentItems.length}区分</span>
          </div>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            {segmentItems.map(item => (
              <div key={item.label} className={ROW_CLASS}>
                <span>{item.label}</span>
                <span>
                  {item.value.toLocaleString()}
                  {segmentUnit}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

const FollowUpSection = React.memo(function FollowUpSection({
  followUpList,
}: {
  followUpList: PatientAnalysisViewModel['followUpList'];
}) {
  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>フォローアップ対象</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-4'>
          {followUpList.length === 0 ? (
            <div className='text-gray-500'>
              フォローアップ対象者は現在ありません。
            </div>
          ) : (
            followUpList.map(patient => (
              <div key={patient.id} className={ROW_CLASS}>
                <div>
                  <p className='font-medium'>{patient.name}</p>
                  <p className='text-sm text-[#6b7280]'>{patient.reason}</p>
                </div>
                <Button variant='outline'>
                  連絡する
                  <ArrowRight className='ml-2 h-4 w-4' />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
});

const PatientAnalysisContent = React.memo(function PatientAnalysisContent({
  data,
}: {
  data: PatientAnalysisViewModel;
}) {
  return (
    <div className={PAGE_CLASS}>
      <div className={CONTENT_CLASS}>
        <PatientTabs />
        <ConversionSection stages={data.conversionData.stages} />
        <SummaryCards
          ltvRanking={data.ltvRanking}
          visitCounts={data.visitCounts}
        />
        <RiskSection riskScores={data.riskScores} />
        <SegmentSection segmentData={data.segmentData} />
        <FollowUpSection followUpList={data.followUpList} />
      </div>
    </div>
  );
});

const ManagerSummaryCards = React.memo(function ManagerSummaryCards({
  summary,
}: {
  summary: ManagerPatientAnalysisResponse['summary'];
}) {
  const items = [
    {
      label: '担当院',
      value: `${summary.assignedClinicCount.toLocaleString()}院`,
    },
    { label: '患者数', value: `${summary.totalPatients.toLocaleString()}人` },
    { label: '新規患者', value: `${summary.newPatients.toLocaleString()}人` },
    {
      label: '再来患者',
      value: `${summary.returnPatients.toLocaleString()}人`,
    },
    { label: '再来率', value: formatPercent(summary.conversionRate) },
    { label: '平均来院回数', value: `${summary.averageVisitCount}回` },
    { label: '総売上', value: formatCurrency(summary.totalRevenue) },
    {
      label: '患者単価',
      value: formatCurrency(summary.averageRevenuePerPatient),
    },
    {
      label: '離脱リスク高',
      value: `${summary.highRiskPatientCount.toLocaleString()}人`,
    },
  ];

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
      {items.map(item => (
        <Card key={item.label} className={SUMMARY_CARD_CLASS}>
          <CardHeader className='pb-2'>
            <CardDescription>{item.label}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
              {item.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
});

const ManagerClinicSelector = React.memo(function ManagerClinicSelector({
  clinics,
  selectedClinicId,
  onChange,
}: {
  clinics: ManagerPatientClinicSummary[];
  selectedClinicId: string | null;
  onChange: (clinicId: string | null) => void;
}) {
  return (
    <div className='flex flex-col gap-2 sm:max-w-xs'>
      <label
        htmlFor='manager-patient-clinic'
        className='text-sm font-medium text-gray-700 dark:text-gray-200'
      >
        担当院
      </label>
      <select
        id='manager-patient-clinic'
        aria-label='担当院を選択'
        className='h-10 rounded border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
        value={selectedClinicId ?? ''}
        onChange={event => onChange(event.target.value || null)}
      >
        {clinics.map(clinic => (
          <option key={clinic.clinicId} value={clinic.clinicId}>
            {clinic.clinicName}
          </option>
        ))}
      </select>
    </div>
  );
});

const ManagerClinicComparison = React.memo(function ManagerClinicComparison({
  clinics,
}: {
  clinics: ManagerPatientClinicSummary[];
}) {
  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>担当院別分析</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto'>
          <table className='min-w-full text-sm'>
            <thead>
              <tr className='border-b text-left text-gray-500'>
                <th className='whitespace-nowrap px-3 py-2 font-medium'>
                  担当院
                </th>
                <th className='whitespace-nowrap px-3 py-2 font-medium'>
                  患者数
                </th>
                <th className='whitespace-nowrap px-3 py-2 font-medium'>
                  新規患者
                </th>
                <th className='whitespace-nowrap px-3 py-2 font-medium'>
                  再来患者
                </th>
                <th className='whitespace-nowrap px-3 py-2 font-medium'>
                  再来率
                </th>
                <th className='whitespace-nowrap px-3 py-2 font-medium'>
                  患者単価
                </th>
                <th className='whitespace-nowrap px-3 py-2 font-medium'>
                  離脱リスク高
                </th>
              </tr>
            </thead>
            <tbody>
              {clinics.map(clinic => (
                <tr key={clinic.clinicId} className='border-b last:border-b-0'>
                  <td className='whitespace-nowrap px-3 py-3 font-medium'>
                    {clinic.clinicName}
                  </td>
                  <td className='whitespace-nowrap px-3 py-3'>
                    {clinic.totalPatients.toLocaleString()}人
                  </td>
                  <td className='whitespace-nowrap px-3 py-3'>
                    {clinic.newPatients.toLocaleString()}人
                  </td>
                  <td className='whitespace-nowrap px-3 py-3'>
                    {clinic.returnPatients.toLocaleString()}人
                  </td>
                  <td className='whitespace-nowrap px-3 py-3'>
                    {formatPercent(clinic.conversionRate)}
                  </td>
                  <td className='whitespace-nowrap px-3 py-3'>
                    {formatCurrency(clinic.averageRevenuePerPatient)}
                  </td>
                  <td className='whitespace-nowrap px-3 py-3'>
                    {clinic.highRiskPatientCount.toLocaleString()}人
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
});

const ManagerSegmentSection = React.memo(function ManagerSegmentSection({
  selectedClinic,
}: {
  selectedClinic: ManagerPatientClinicDetail;
}) {
  const segments = selectedClinic.segmentData.visit ?? [];
  if (segments.length === 0) return null;

  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>来院区分</CardTitle>
        <CardDescription>{selectedClinic.clinicName}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          {segments.map(segment => (
            <div key={segment.label} className={ROW_CLASS}>
              <span>{segment.label}</span>
              <span>{segment.value.toLocaleString()}人</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

const ManagerFollowUpSection = React.memo(function ManagerFollowUpSection({
  selectedClinic,
}: {
  selectedClinic: ManagerPatientClinicDetail;
}) {
  return (
    <Card className='bg-card'>
      <CardHeader>
        <CardTitle>フォロー候補</CardTitle>
        <CardDescription>{selectedClinic.clinicName}</CardDescription>
      </CardHeader>
      <CardContent>
        {selectedClinic.followUpList.length === 0 ? (
          <div className='text-gray-500'>
            フォローアップ対象者は現在ありません。
          </div>
        ) : (
          <div className='space-y-3'>
            {selectedClinic.followUpList.map(patient => (
              <div key={patient.patient_id} className={ROW_CLASS}>
                <div>
                  <p className='font-medium'>{patient.name}</p>
                  <p className='text-sm text-gray-500'>{patient.reason}</p>
                </div>
                <span className='text-sm text-gray-600 dark:text-gray-300'>
                  {patient.action}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

function ManagerPatientAnalysisContent() {
  const { data, loading, error, selectedClinicId, setSelectedClinicId } =
    useManagerPatientAnalysis();

  if (loading) {
    return (
      <div
        className={`${PAGE_CLASS} flex items-center justify-center`}
        aria-live='polite'
      >
        <div className='text-gray-500'>患者分析データを読み込み中です...</div>
      </div>
    );
  }

  if (error) {
    return (
      <PageMessage
        title='患者分析の取得に失敗しました。'
        description='時間をおいて再度お試しください。'
        tone='error'
        action={<ReloadButton />}
      />
    );
  }

  if (!data) {
    return (
      <PageMessage
        title='表示できる患者分析データがありません'
        description='予約・来院データが登録されると分析が表示されます。'
      />
    );
  }

  if (data.summary.assignedClinicCount === 0) {
    return (
      <PageMessage
        title='担当院がまだ設定されていません。'
        description='管理者に担当店舗の設定を依頼してください。'
      />
    );
  }

  const periodLabel =
    data.period.periodApplied && data.period.startDate && data.period.endDate
      ? `${data.period.startDate} - ${data.period.endDate}`
      : '全期間';

  return (
    <div className={PAGE_CLASS}>
      <div className='mx-auto max-w-[1200px] space-y-6'>
        <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
          <div>
            <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
              担当院合計
            </h1>
            <p className='mt-1 text-sm text-gray-500'>
              分析期間: {periodLabel}
            </p>
          </div>
          <ManagerClinicSelector
            clinics={data.clinics}
            selectedClinicId={selectedClinicId}
            onChange={setSelectedClinicId}
          />
        </div>

        <ManagerSummaryCards summary={data.summary} />

        {data.summary.totalPatients === 0 ? (
          <Card className='bg-card'>
            <CardHeader>
              <CardTitle>対象期間の患者分析データがまだありません。</CardTitle>
              <CardDescription>
                予約・来院データが登録されると分析が表示されます。
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <ManagerClinicComparison clinics={data.clinics} />
            {data.selectedClinic && (
              <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
                <ManagerSegmentSection selectedClinic={data.selectedClinic} />
                <ManagerFollowUpSection selectedClinic={data.selectedClinic} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ClinicPatientAnalysisPage({
  clinicId,
  profileLoading,
  profileError,
}: {
  clinicId: string | null;
  profileLoading: boolean;
  profileError: string | null;
}) {
  const { data, loading, error } = usePatientAnalysis(clinicId);

  if (profileError && !profileLoading) {
    return (
      <PageMessage
        title='プロフィール取得に失敗しました'
        description={profileError}
        tone='error'
        action={<ReloadButton />}
      />
    );
  }

  if (!clinicId && !profileLoading) {
    return (
      <PageMessage
        title='クリニック情報が見つかりません'
        description='権限が付与されたクリニックが設定されていないため、患者分析を表示できません。'
      />
    );
  }

  if (profileLoading || loading) {
    return (
      <div
        className={`${PAGE_CLASS} flex items-center justify-center`}
        aria-live='polite'
      >
        <div className='text-gray-500'>患者分析データを読み込み中です...</div>
      </div>
    );
  }

  if (error) {
    return (
      <PageMessage
        title='データ取得に失敗しました'
        description={error}
        tone='error'
        action={<ReloadButton />}
      />
    );
  }

  if (!data) {
    return (
      <div className={`${PAGE_CLASS} flex items-center justify-center`}>
        <div className='text-gray-500'>表示できる患者データがありません。</div>
      </div>
    );
  }

  return <PatientAnalysisContent data={data} />;
}

export default function PatientsPage() {
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfileContext();
  const clinicId = profile?.clinicId ?? null;

  if (!profileLoading && isManagerRole(profile?.role)) {
    return <ManagerPatientAnalysisContent />;
  }

  return (
    <ClinicPatientAnalysisPage
      clinicId={clinicId}
      profileLoading={profileLoading}
      profileError={profileError}
    />
  );
}
