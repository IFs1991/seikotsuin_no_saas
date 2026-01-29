/**
 * ベータ運用モニタリングダッシュボード
 *
 * M4: ベータ運用検証のための管理画面
 * - ベータ院の利用状況メトリクス可視化
 * - フィードバック一覧と管理
 * - 改善バックログ管理
 * - Go/No-Go判定サポート
 */

'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { logger } from '@/lib/logger';

interface BetaMetrics {
  id: string;
  clinic_id: string;
  period_start: string;
  period_end: string;
  login_count: number;
  unique_users: number;
  dashboard_view_count: number;
  daily_report_submissions: number;
  patient_analysis_view_count: number;
  average_session_duration: number;
  daily_active_rate: number;
  feature_adoption_rate: Record<string, number>;
  daily_report_completion_rate: number;
  data_accuracy: number;
  average_load_time: number;
  error_rate: number;
  clinics?: {
    id: string;
    name: string;
  };
}

interface BetaFeedback {
  id: string;
  clinic_id: string;
  user_id: string;
  user_name: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
}

interface ImprovementBacklog {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  estimated_effort: string;
  business_value: number;
  status: string;
  milestone?: string;
  created_at: string;
}

export default function BetaMonitoringPage() {
  const [activeTab, setActiveTab] = useState('metrics');
  const [metrics, setMetrics] = useState<BetaMetrics[]>([]);
  const [feedback, setFeedback] = useState<BetaFeedback[]>([]);
  const [backlog, setBacklog] = useState<ImprovementBacklog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      if (activeTab === 'metrics') {
        await loadMetrics();
      } else if (activeTab === 'feedback') {
        await loadFeedback();
      } else if (activeTab === 'backlog') {
        await loadBacklog();
      }
    } catch (err) {
      logger.error('Failed to load beta monitoring data', {
        error: err,
        tab: activeTab,
      });
      setError('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    const response = await fetch('/api/beta/metrics');
    if (!response.ok) throw new Error('Failed to fetch metrics');
    const data = await response.json();
    setMetrics(data.metrics || []);
  };

  const loadFeedback = async () => {
    const response = await fetch('/api/beta/feedback');
    if (!response.ok) throw new Error('Failed to fetch feedback');
    const data = await response.json();
    setFeedback(data.feedback || []);
  };

  const loadBacklog = async () => {
    const response = await fetch('/api/beta/backlog');
    if (!response.ok) throw new Error('Failed to fetch backlog');
    const data = await response.json();
    setBacklog(data.backlog || []);
  };

  const calculateOverallMetrics = () => {
    if (metrics.length === 0) return null;

    const totalClinics = new Set(metrics.map(m => m.clinic_id)).size;
    const totalLogins = metrics.reduce((sum, m) => sum + m.login_count, 0);
    const avgDailyActiveRate =
      metrics.reduce((sum, m) => sum + m.daily_active_rate, 0) / metrics.length;
    const avgDailyReportCompletion =
      metrics.reduce((sum, m) => sum + m.daily_report_completion_rate, 0) /
      metrics.length;

    return {
      totalClinics,
      totalLogins,
      avgDailyActiveRate: avgDailyActiveRate.toFixed(1),
      avgDailyReportCompletion: avgDailyReportCompletion.toFixed(1),
    };
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      feature_request: '✨',
      bug_report: '🐛',
      usability: '👤',
      performance: '⚡',
      other: '📝',
    };
    return icons[category] || '📝';
  };

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      critical: 'text-red-600 bg-red-50',
      high: 'text-orange-600 bg-orange-50',
      medium: 'text-yellow-600 bg-yellow-50',
      low: 'text-blue-600 bg-blue-50',
    };
    return colors[severity] || 'text-gray-600 bg-gray-50';
  };

  const getPriorityBadge = (priority: string) => {
    const badges: Record<string, string> = {
      critical: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-green-100 text-green-800',
    };
    return badges[priority] || 'bg-gray-100 text-gray-800';
  };

  const overallMetrics = calculateOverallMetrics();

  return (
    <div className='p-6 space-y-6'>
      <div className='flex justify-between items-center'>
        <h1 className='text-3xl font-bold'>ベータ運用モニタリング (M4)</h1>
        <div className='text-sm text-gray-500'>
          更新: {new Date().toLocaleString('ja-JP')}
        </div>
      </div>

      {/* サマリーカード */}
      {overallMetrics && (
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          <Card className='p-4'>
            <div className='text-sm text-gray-500'>参加ベータ院</div>
            <div className='text-2xl font-bold'>
              {overallMetrics.totalClinics}
            </div>
          </Card>
          <Card className='p-4'>
            <div className='text-sm text-gray-500'>総ログイン数</div>
            <div className='text-2xl font-bold'>
              {overallMetrics.totalLogins}
            </div>
          </Card>
          <Card className='p-4'>
            <div className='text-sm text-gray-500'>平均DAU率</div>
            <div className='text-2xl font-bold'>
              {overallMetrics.avgDailyActiveRate}%
            </div>
          </Card>
          <Card className='p-4'>
            <div className='text-sm text-gray-500'>日報完了率</div>
            <div className='text-2xl font-bold'>
              {overallMetrics.avgDailyReportCompletion}%
            </div>
          </Card>
        </div>
      )}

      {/* タブ */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value='metrics'>利用状況メトリクス</TabsTrigger>
          <TabsTrigger value='feedback'>フィードバック</TabsTrigger>
          <TabsTrigger value='backlog'>改善バックログ</TabsTrigger>
          <TabsTrigger value='gonogo'>Go/No-Go判定</TabsTrigger>
        </TabsList>

        {/* メトリクスタブ */}
        <TabsContent value='metrics'>
          <Card className='p-6'>
            <h2 className='text-xl font-bold mb-4'>クリニック別利用状況</h2>
            {loading ? (
              <div className='text-center py-8'>読み込み中...</div>
            ) : error ? (
              <div className='text-red-600 text-center py-8'>{error}</div>
            ) : metrics.length === 0 ? (
              <div className='text-gray-500 text-center py-8'>
                メトリクスデータがありません
              </div>
            ) : (
              <div className='space-y-4'>
                {metrics.map(metric => (
                  <div key={metric.id} className='border rounded-lg p-4'>
                    <h3 className='font-bold mb-2'>
                      {metric.clinics?.name || `クリニック ${metric.clinic_id}`}
                    </h3>
                    <div className='grid grid-cols-2 md:grid-cols-4 gap-4 text-sm'>
                      <div>
                        <div className='text-gray-500'>ログイン数</div>
                        <div className='font-semibold'>
                          {metric.login_count}
                        </div>
                      </div>
                      <div>
                        <div className='text-gray-500'>アクティブユーザー</div>
                        <div className='font-semibold'>
                          {metric.unique_users}
                        </div>
                      </div>
                      <div>
                        <div className='text-gray-500'>日報登録数</div>
                        <div className='font-semibold'>
                          {metric.daily_report_submissions}
                        </div>
                      </div>
                      <div>
                        <div className='text-gray-500'>平均セッション時間</div>
                        <div className='font-semibold'>
                          {metric.average_session_duration.toFixed(1)}分
                        </div>
                      </div>
                      <div>
                        <div className='text-gray-500'>日報完了率</div>
                        <div className='font-semibold'>
                          {metric.daily_report_completion_rate.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className='text-gray-500'>エラー率</div>
                        <div className='font-semibold'>
                          {metric.error_rate.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* フィードバックタブ */}
        <TabsContent value='feedback'>
          <Card className='p-6'>
            <h2 className='text-xl font-bold mb-4'>ベータフィードバック</h2>
            {loading ? (
              <div className='text-center py-8'>読み込み中...</div>
            ) : error ? (
              <div className='text-red-600 text-center py-8'>{error}</div>
            ) : feedback.length === 0 ? (
              <div className='text-gray-500 text-center py-8'>
                フィードバックがありません
              </div>
            ) : (
              <div className='space-y-3'>
                {feedback.map(item => (
                  <div
                    key={item.id}
                    className='border rounded-lg p-4 hover:bg-gray-50'
                  >
                    <div className='flex items-start justify-between'>
                      <div className='flex-1'>
                        <div className='flex items-center gap-2 mb-2'>
                          <span className='text-xl'>
                            {getCategoryIcon(item.category)}
                          </span>
                          <span className='font-semibold'>{item.title}</span>
                          <span
                            className={`px-2 py-1 rounded text-xs ${getSeverityColor(
                              item.severity
                            )}`}
                          >
                            {item.severity}
                          </span>
                          <span
                            className={`px-2 py-1 rounded text-xs ${getPriorityBadge(item.priority)}`}
                          >
                            {item.priority}
                          </span>
                        </div>
                        <p className='text-sm text-gray-600 mb-2'>
                          {item.description}
                        </p>
                        <div className='text-xs text-gray-500'>
                          {item.user_name} •{' '}
                          {new Date(item.created_at).toLocaleDateString(
                            'ja-JP'
                          )}
                        </div>
                      </div>
                      <div className='text-sm'>
                        <span
                          className={`px-2 py-1 rounded ${
                            item.status === 'resolved'
                              ? 'bg-green-100 text-green-800'
                              : item.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* バックログタブ */}
        <TabsContent value='backlog'>
          <Card className='p-6'>
            <h2 className='text-xl font-bold mb-4'>改善バックログ</h2>
            {loading ? (
              <div className='text-center py-8'>読み込み中...</div>
            ) : error ? (
              <div className='text-red-600 text-center py-8'>{error}</div>
            ) : backlog.length === 0 ? (
              <div className='text-gray-500 text-center py-8'>
                バックログアイテムがありません
              </div>
            ) : (
              <div className='space-y-3'>
                {backlog.map(item => (
                  <div key={item.id} className='border rounded-lg p-4'>
                    <div className='flex items-start justify-between'>
                      <div className='flex-1'>
                        <div className='flex items-center gap-2 mb-2'>
                          <span className='font-semibold'>{item.title}</span>
                          <span
                            className={`px-2 py-1 rounded text-xs ${getPriorityBadge(item.priority)}`}
                          >
                            {item.priority}
                          </span>
                          <span className='px-2 py-1 rounded text-xs bg-gray-100 text-gray-800'>
                            {item.estimated_effort}
                          </span>
                          <span className='text-xs text-gray-600'>
                            価値: {item.business_value}/10
                          </span>
                        </div>
                        <p className='text-sm text-gray-600 mb-2'>
                          {item.description}
                        </p>
                        <div className='text-xs text-gray-500'>
                          {item.category} • {item.milestone || '未設定'}
                        </div>
                      </div>
                      <div className='text-sm'>
                        <span
                          className={`px-2 py-1 rounded ${
                            item.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : item.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Go/No-Go判定タブ */}
        <TabsContent value='gonogo'>
          <Card className='p-6'>
            <h2 className='text-xl font-bold mb-4'>Go/No-Go判定サポート</h2>
            <div className='space-y-4'>
              <div className='border-l-4 border-blue-500 pl-4'>
                <h3 className='font-semibold mb-2'>成功基準チェック</h3>
                <ul className='space-y-2 text-sm'>
                  <li className='flex items-center gap-2'>
                    <span
                      className={
                        overallMetrics &&
                        parseFloat(overallMetrics.avgDailyActiveRate) >= 80
                          ? '✅'
                          : '⚠️'
                      }
                    >
                      {overallMetrics &&
                      parseFloat(overallMetrics.avgDailyActiveRate) >= 80
                        ? '✅'
                        : '⚠️'}
                    </span>
                    KPIダッシュボード閲覧率: 主要ユーザの80%が週2回以上アクセス
                  </li>
                  <li className='flex items-center gap-2'>
                    <span
                      className={
                        overallMetrics &&
                        parseFloat(overallMetrics.avgDailyReportCompletion) >=
                          90
                          ? '✅'
                          : '⚠️'
                      }
                    >
                      {overallMetrics &&
                      parseFloat(overallMetrics.avgDailyReportCompletion) >= 90
                        ? '✅'
                        : '⚠️'}
                    </span>
                    日報登録完了率: 稼働院の90%以上が営業日当日に登録
                  </li>
                  <li className='flex items-center gap-2'>
                    <span>⚠️</span>
                    重大インシデントゼロ（手動確認が必要）
                  </li>
                  <li className='flex items-center gap-2'>
                    <span>⚠️</span>
                    CSフィードバック:
                    ベータ参加院の満足度4.0/5.0以上（手動確認が必要）
                  </li>
                </ul>
              </div>

              <div className='bg-yellow-50 border border-yellow-200 rounded p-4'>
                <p className='text-sm text-yellow-800'>
                  <strong>注意:</strong>{' '}
                  Go/No-Go判定には、CS/Tech/Security三者レビューが必要です。
                  詳細な判定資料は別途ドキュメントを参照してください。
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
