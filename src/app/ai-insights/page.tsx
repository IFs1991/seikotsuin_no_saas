'use client';

import React, { useMemo, useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type InsightStatus = 'on_track' | 'watch' | 'at_risk';

type InsightMetric = {
  label: string;
  current: string;
  target?: string;
  delta?: string;
  source: string;
};

type InsightAction = {
  title: string;
  owner: string;
  due: string;
  impact: string;
  status: 'in_progress' | 'planned' | 'completed';
  source: string;
};

type InsightCategory = {
  title: string;
  status: InsightStatus;
  summary: string;
  metrics: InsightMetric[];
  highlights: string[];
  improvements: string[];
  actions: InsightAction[];
};

const mockInsights: Record<'revenue' | 'efficiency' | 'satisfaction', InsightCategory> = {
  revenue: {
    title: '収益向上',
    status: 'watch',
    summary:
      '今月の総売上は前年比で8.2%増。自費比率が 38% まで改善しましたが、目標 42% には未到達です。保険診療の回転率改善と自費メニュー訴求を強化しましょう。',
    metrics: [
      {
        label: '総売上 (月次)',
        current: '¥12,480,000',
        target: '¥13,000,000',
        delta: '+8.2% 前年比',
        source: 'daily_revenue_summary',
      },
      {
        label: '自費比率',
        current: '38%',
        target: '42%',
        delta: '+2.1pt 前月比',
        source: 'daily_revenue_summary',
      },
      {
        label: '平均単価',
        current: '¥6,280',
        delta: '+¥420 前月比',
        source: 'revenues',
      },
    ],
    highlights: [
      '保険診療の稼働率が 84% まで回復',
      '紹介患者経由の自費成約率が 31% → 36% に向上',
    ],
    improvements: [
      'キャンセル率が 6.4% と高止まり（目標 4%）',
      '平日夜間の予約枠に 20% の空きが発生',
    ],
    actions: [
      {
        title: '単価アップ施策の A/B テスト開始',
        owner: '本部マーケティング',
        due: '2025-02-15',
        impact: '期待価値: +¥820,000/月',
        status: 'in_progress',
        source: 'growth_campaigns',
      },
      {
        title: '夜間帯の保険診療を自費コンバージョン導線に変更',
        owner: '店舗マネージャー',
        due: '2025-02-05',
        impact: '自費比率 +3pt',
        status: 'planned',
        source: 'clinic_action_plans',
      },
    ],
  },
  efficiency: {
    title: '効率化',
    status: 'on_track',
    summary:
      '平均待ち時間は 11.2 分で基準値内。施術者の稼働バランスが改善し、リピート患者の滞在時間も最適化されつつあります。',
    metrics: [
      {
        label: '平均待ち時間',
        current: '11.2 分',
        target: '10 分',
        delta: '-2.3 分 前月比',
        source: 'visit_queue_metrics',
      },
      {
        label: '施術室稼働率',
        current: '87%',
        target: '90%',
        delta: '+5pt 前月比',
        source: 'room_utilization',
      },
      {
        label: 'スタッフアサイン最適度',
        current: '0.78（指標化）',
        delta: '+0.06 前月比',
        source: 'staff_performance_summary',
      },
    ],
    highlights: [
      '離任スタッフの引継ぎが完了し、稼働率のばらつきが解消',
      '受付オペレーションの分業化により待機列が短縮',
    ],
    improvements: [
      '土曜午後の施術枠に偏りがあり、受付負荷が高い',
      '新人スタッフの施術時間が平均+6分長い為、教育強化が必要',
    ],
    actions: [
      {
        title: '新人スタッフのシミュレーション研修',
        owner: '教育担当',
        due: '2025-02-07',
        impact: '施術時間 ▲4分/件 を目標',
        status: 'in_progress',
        source: 'training_schedule',
      },
      {
        title: '土曜午後の受付サポート追加 (パートタイム)',
        owner: '人事',
        due: '2025-02-03',
        impact: 'ピーク待機時間 ▲3分',
        status: 'planned',
        source: 'staffing_requests',
      },
    ],
  },
  satisfaction: {
    title: '満足度',
    status: 'at_risk',
    summary:
      'NPS が 41 → 36 に低下。口コミ評価は高水準を維持しているものの、女性20〜30代の離脱が増加しています。フォロー体制の見直しが必要です。',
    metrics: [
      {
        label: 'NPS (当月)',
        current: '36',
        target: '45',
        delta: '-5pt 前月比',
        source: 'patient_feedback_summary',
      },
      {
        label: '口コミ評価 (平均)',
        current: '4.5 / 5',
        delta: '±0',
        source: 'review_platforms',
      },
      {
        label: '離脱リスク患者 (当月)',
        current: '23 名',
        delta: '+7 名 前月比',
        source: 'calculate_churn_risk_score',
      },
    ],
    highlights: [
      '30日以内に再来院した患者の満足度は継続的に高評価',
      'オフラインアンケートでスタッフ対応が高評価 (4.7/5)',
    ],
    improvements: [
      '女性20〜30代の離脱率が 18% → 24% に増加',
      '来院後アンケートの回収率が 42% と低下（目標 55%）',
    ],
    actions: [
      {
        title: '女性向けフォローアップLINE配信の再設計',
        owner: 'CRMチーム',
        due: '2025-02-08',
        impact: '離脱率 ▲4pt',
        status: 'in_progress',
        source: 'crm_workflows',
      },
      {
        title: 'アンケート回答インセンティブ（次回500円OFF）',
        owner: '店舗マネージャー',
        due: '2025-02-01',
        impact: '回収率 +12pt',
        status: 'planned',
        source: 'campaign_plans',
      },
      {
        title: 'ハイリスク患者への電話フォロー実施',
        owner: 'リテンションチーム',
        due: '2025-01-31',
        impact: '離脱リスク患者 △10名',
        status: 'completed',
        source: 'retention_tasks',
      },
    ],
  },
};

const statusMeta: Record<InsightStatus, { label: string; className: string }> = {
  on_track: { label: '順調', className: 'bg-green-100 text-green-700' },
  watch: { label: '要注視', className: 'bg-yellow-100 text-yellow-800' },
  at_risk: { label: '要改善', className: 'bg-red-100 text-red-700' },
};

const actionStatusLabel: Record<InsightAction['status'], string> = {
  in_progress: '進行中',
  planned: '予定',
  completed: '完了',
};

const AiInsightsPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'revenue' | 'efficiency' | 'satisfaction'>('all');

  const categories = useMemo(
    () => [
      { id: 'all' as const, label: '全て' },
      { id: 'revenue' as const, label: mockInsights.revenue.title },
      { id: 'efficiency' as const, label: mockInsights.efficiency.title },
      { id: 'satisfaction' as const, label: mockInsights.satisfaction.title },
    ],
    []
  );

  const renderSummaryCard = (categoryKey: keyof typeof mockInsights) => {
    const category = mockInsights[categoryKey];
    const status = statusMeta[category.status];

    return (
      <Card key={categoryKey} className='bg-card h-full shadow-sm'>
        <CardHeader className='space-y-3 bg-card'>
          <div className='flex items-center justify-between'>
            <CardTitle className='text-lg font-semibold text-[#1e3a8a] dark:text-gray-100'>
              {category.title}
            </CardTitle>
            <span className={`px-2 py-1 text-xs rounded ${status.className}`}>
              {status.label}
            </span>
          </div>
          <CardDescription className='text-gray-600 dark:text-gray-300'>
            {category.summary}
          </CardDescription>
        </CardHeader>
        <CardContent className='bg-card space-y-4'>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            {category.metrics.slice(0, 2).map(metric => (
              <div key={metric.label} className='border rounded-lg p-3 bg-white dark:bg-gray-800'>
                <p className='text-xs text-gray-400 uppercase tracking-wide'>{metric.label}</p>
                <p className='text-lg font-semibold text-gray-900 dark:text-gray-100 mt-1'>
                  {metric.current}
                </p>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  {metric.delta}
                  {metric.target ? ` / 目標 ${metric.target}` : ''}
                </p>
              </div>
            ))}
          </div>
          <div>
            <p className='text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'>ハイライト</p>
            <ul className='space-y-1 text-sm text-gray-700 dark:text-gray-300'>
              {category.highlights.map((item, index) => (
                <li key={index}>• {item}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderDetailView = (categoryKey: keyof typeof mockInsights) => {
    const category = mockInsights[categoryKey];
    const status = statusMeta[category.status];

    return (
      <div className='space-y-6 mt-6'>
        <Card className='bg-card'>
          <CardHeader className='bg-card'>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-2xl font-semibold text-[#1e3a8a] dark:text-gray-100'>
                {category.title}
              </CardTitle>
              <span className={`px-3 py-1 text-sm rounded ${status.className}`}>
                {status.label}
              </span>
            </div>
            <CardDescription className='text-gray-600 dark:text-gray-300 mt-2'>
              {category.summary}
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card space-y-4'>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              {category.metrics.map(metric => (
                <div key={metric.label} className='border rounded-lg p-4 bg-white dark:bg-gray-800'>
                  <p className='text-xs text-gray-400 uppercase tracking-wide'>{metric.label}</p>
                  <p className='text-xl font-bold text-gray-900 dark:text-gray-100 mt-2'>
                    {metric.current}
                  </p>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-2'>
                    {metric.delta}
                    {metric.target ? ` / 目標 ${metric.target}` : ''}
                  </p>
                  <p className='text-[11px] text-gray-400 mt-2'>データソース: {metric.source}</p>
                </div>
              ))}
            </div>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div className='border rounded-lg p-4 bg-white dark:bg-gray-800'>
                <h3 className='text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2'>良い兆候</h3>
                <ul className='space-y-1 text-sm text-gray-700 dark:text-gray-300'>
                  {category.highlights.map((item, idx) => (
                    <li key={idx}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div className='border rounded-lg p-4 bg-white dark:bg-gray-800'>
                <h3 className='text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2'>改善ポイント</h3>
                <ul className='space-y-1 text-sm text-gray-700 dark:text-gray-300'>
                  {category.improvements.map((item, idx) => (
                    <li key={idx}>• {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className='bg-card'>
          <CardHeader className='bg-card'>
            <CardTitle className='text-lg font-semibold text-[#1e3a8a] dark:text-gray-100'>
              優先アクション
            </CardTitle>
            <CardDescription className='text-gray-600 dark:text-gray-300'>
              実行チームと期限、期待効果を整理したモックデータです（将来的にはワークフロー管理テーブルと連携）。
            </CardDescription>
          </CardHeader>
          <CardContent className='bg-card space-y-3'>
            {category.actions.map(action => (
              <div
                key={`${action.title}-${action.owner}`}
                className='border rounded-lg p-4 bg-white dark:bg-gray-800'
              >
                <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-2'>
                  <div>
                    <p className='text-sm font-semibold text-gray-900 dark:text-gray-100'>
                      {action.title}
                    </p>
                    <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                      担当: {action.owner} / 期限: {action.due}
                    </p>
                    <p className='text-xs text-gray-400 mt-1'>データソース: {action.source}</p>
                  </div>
                  <Badge
                    variant={
                      action.status === 'completed'
                        ? 'default'
                        : action.status === 'in_progress'
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    {actionStatusLabel[action.status]}
                  </Badge>
                </div>
                <p className='text-sm text-gray-700 dark:text-gray-300 mt-3'>
                  期待効果: {action.impact}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className='container mx-auto p-6 bg-white dark:bg-gray-800'>
      <Card className='w-full bg-card'>
        <CardHeader className='bg-card'>
          <CardTitle className='text-2xl font-bold text-[#1e3a8a]'>
            ティラミス AI インサイト
          </CardTitle>
          <CardDescription className='text-gray-600 dark:text-gray-300'>
            Gemini Flash が算出した経営改善サマリのモックデータです。後日、`daily_revenue_summary` や `patient_feedback_summary` などのテーブルと連携予定です。
          </CardDescription>
        </CardHeader>
        <CardContent className='bg-card'>
          <Tabs value={selectedCategory} className='w-full' onValueChange={value => setSelectedCategory(value as typeof selectedCategory)}>
            <TabsList className='grid grid-cols-4 gap-4'>
              {categories.map(category => (
                <TabsTrigger key={category.id} value={category.id}>
                  {category.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value='all'>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mt-6'>
                {(['revenue', 'efficiency', 'satisfaction'] as const).map(renderSummaryCard)}
              </div>
            </TabsContent>

            <TabsContent value='revenue'>
              {renderDetailView('revenue')}
            </TabsContent>

            <TabsContent value='efficiency'>
              {renderDetailView('efficiency')}
            </TabsContent>

            <TabsContent value='satisfaction'>
              {renderDetailView('satisfaction')}
            </TabsContent>
          </Tabs>

          <div className='mt-8 flex justify-end'>
            <Button
              className='bg-[#10b981] text-white hover:bg-[#059669]'
              onClick={() => console.log('PDFレポート出力')}
            >
              PDFレポート出力
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AiInsightsPage;
