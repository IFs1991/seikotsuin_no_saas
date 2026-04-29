'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import {
  usePatientAnalysis,
  type PatientAnalysisViewModel,
} from '@/hooks/usePatientAnalysis';
import { useUserProfileContext } from '@/providers/user-profile-context';
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

export default function PatientsPage() {
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfileContext();
  const clinicId = profile?.clinicId ?? null;
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
