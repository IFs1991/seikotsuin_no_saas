/**
 * 管理者向けセキュリティダッシュボード
 * Phase 3B: クリニック全体のセキュリティ監視・管理
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Shield,
  ShieldAlert,
  AlertTriangle,
  Users,
  Activity,
  TrendingUp,
  Clock,
  Lock,
  Unlock,
  Eye,
  Download,
  RefreshCw,
  MapPin,
  Smartphone,
  Wifi,
  Database,
} from 'lucide-react';

interface SecurityMetrics {
  totalUsers: number;
  mfaEnabledUsers: number;
  activeSessions: number;
  recentThreats: number;
  blockedAttempts: number;
  successfulLogins: number;
}

interface SecurityEvent {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  user: string;
  description: string;
  ipAddress: string;
  location: string;
  device: string;
  timestamp: Date;
  status: 'active' | 'resolved' | 'investigating';
}

interface SessionInfo {
  id: string;
  userId: string;
  userName: string;
  device: string;
  ipAddress: string;
  location: string;
  loginTime: Date;
  lastActivity: Date;
  riskLevel: 'low' | 'medium' | 'high';
}

export const SecurityDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<SecurityMetrics>({
    totalUsers: 0,
    mfaEnabledUsers: 0,
    activeSessions: 0,
    recentThreats: 0,
    blockedAttempts: 0,
    successfulLogins: 0,
  });

  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [activeSessions, setActiveSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // セキュリティメトリクス取得
  const fetchSecurityMetrics = async () => {
    try {
      const response = await fetch('/api/admin/security/metrics');
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error('セキュリティメトリクス取得エラー:', error);
    }
  };

  // セキュリティイベント取得
  const fetchSecurityEvents = async () => {
    try {
      const response = await fetch('/api/admin/security/events');
      if (response.ok) {
        const data = await response.json();
        setSecurityEvents(data);
      }
    } catch (error) {
      console.error('セキュリティイベント取得エラー:', error);
    }
  };

  // アクティブセッション取得
  const fetchActiveSessions = async () => {
    try {
      const response = await fetch('/api/admin/security/sessions');
      if (response.ok) {
        const data = await response.json();
        setActiveSessions(data);
      }
    } catch (error) {
      console.error('アクティブセッション取得エラー:', error);
    }
  };

  // データリフレッシュ
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchSecurityMetrics(),
      fetchSecurityEvents(),
      fetchActiveSessions(),
    ]);
    setRefreshing(false);
  };

  // セキュリティレポートダウンロード
  const handleDownloadReport = () => {
    const csvContent = [
      'イベントタイプ,重要度,ユーザー,説明,IPアドレス,場所,日時,状態',
      ...securityEvents.map(
        event =>
          `${event.type},${event.severity},${event.user},"${event.description}",${event.ipAddress},"${event.location}",${event.timestamp.toLocaleString()},${event.status}`
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `security_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // セッション強制終了
  const handleTerminateSession = async (sessionId: string) => {
    if (!confirm('このセッションを強制終了しますか？')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/security/sessions/terminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (response.ok) {
        await fetchActiveSessions();
      }
    } catch (error) {
      console.error('セッション終了エラー:', error);
    }
  };

  // 重要度別スタイル取得
  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // リスクレベル別スタイル取得
  const getRiskLevelStyle = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high':
        return 'bg-red-100 text-red-700';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700';
      case 'low':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  useEffect(() => {
    const initializeDashboard = async () => {
      setLoading(true);
      await Promise.all([
        fetchSecurityMetrics(),
        fetchSecurityEvents(),
        fetchActiveSessions(),
      ]);
      setLoading(false);
    };

    initializeDashboard();

    // 30秒ごとに自動更新
    const interval = setInterval(handleRefresh, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <RefreshCw className='w-8 h-8 animate-spin text-gray-400' />
        <span className='ml-2 text-gray-600'>
          セキュリティデータを読み込んでいます...
        </span>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* ヘッダー */}
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold text-gray-900'>
            セキュリティダッシュボード
          </h2>
          <p className='text-gray-600'>
            クリニック全体のセキュリティ監視・管理
          </p>
        </div>

        <div className='flex gap-3'>
          <Button
            variant='outline'
            onClick={handleDownloadReport}
            disabled={refreshing}
          >
            <Download className='w-4 h-4 mr-2' />
            レポート出力
          </Button>
          <Button
            variant='outline'
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`}
            />
            更新
          </Button>
        </div>
      </div>

      {/* メトリクスカード */}
      <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4'>
        <Card className='p-4'>
          <div className='flex items-center'>
            <div className='w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center'>
              <Users className='w-4 h-4 text-blue-600' />
            </div>
            <div className='ml-3'>
              <p className='text-sm text-gray-600'>総ユーザー数</p>
              <p className='text-xl font-semibold'>{metrics.totalUsers}</p>
            </div>
          </div>
        </Card>

        <Card className='p-4'>
          <div className='flex items-center'>
            <div className='w-8 h-8 bg-green-100 rounded-full flex items-center justify-center'>
              <Shield className='w-4 h-4 text-green-600' />
            </div>
            <div className='ml-3'>
              <p className='text-sm text-gray-600'>MFA有効</p>
              <p className='text-xl font-semibold'>{metrics.mfaEnabledUsers}</p>
              <p className='text-xs text-gray-500'>
                {metrics.totalUsers > 0
                  ? Math.round(
                      (metrics.mfaEnabledUsers / metrics.totalUsers) * 100
                    )
                  : 0}
                %
              </p>
            </div>
          </div>
        </Card>

        <Card className='p-4'>
          <div className='flex items-center'>
            <div className='w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center'>
              <Activity className='w-4 h-4 text-purple-600' />
            </div>
            <div className='ml-3'>
              <p className='text-sm text-gray-600'>アクティブセッション</p>
              <p className='text-xl font-semibold'>{metrics.activeSessions}</p>
            </div>
          </div>
        </Card>

        <Card className='p-4'>
          <div className='flex items-center'>
            <div className='w-8 h-8 bg-red-100 rounded-full flex items-center justify-center'>
              <ShieldAlert className='w-4 h-4 text-red-600' />
            </div>
            <div className='ml-3'>
              <p className='text-sm text-gray-600'>脅威検知</p>
              <p className='text-xl font-semibold'>{metrics.recentThreats}</p>
            </div>
          </div>
        </Card>

        <Card className='p-4'>
          <div className='flex items-center'>
            <div className='w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center'>
              <Lock className='w-4 h-4 text-orange-600' />
            </div>
            <div className='ml-3'>
              <p className='text-sm text-gray-600'>ブロック</p>
              <p className='text-xl font-semibold'>{metrics.blockedAttempts}</p>
            </div>
          </div>
        </Card>

        <Card className='p-4'>
          <div className='flex items-center'>
            <div className='w-8 h-8 bg-green-100 rounded-full flex items-center justify-center'>
              <Unlock className='w-4 h-4 text-green-600' />
            </div>
            <div className='ml-3'>
              <p className='text-sm text-gray-600'>成功ログイン</p>
              <p className='text-xl font-semibold'>
                {metrics.successfulLogins}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* メインコンテンツ */}
      <Tabs defaultValue='events' className='space-y-6'>
        <TabsList>
          <TabsTrigger value='events'>セキュリティイベント</TabsTrigger>
          <TabsTrigger value='sessions'>アクティブセッション</TabsTrigger>
          <TabsTrigger value='analytics'>分析</TabsTrigger>
        </TabsList>

        {/* セキュリティイベント */}
        <TabsContent value='events'>
          <Card className='p-6'>
            <h3 className='text-lg font-semibold mb-4'>
              最近のセキュリティイベント
            </h3>

            <div className='space-y-3'>
              {securityEvents.length === 0 ? (
                <p className='text-gray-500 text-center py-8'>
                  セキュリティイベントはありません
                </p>
              ) : (
                securityEvents.map(event => (
                  <div
                    key={event.id}
                    className={`p-4 rounded-lg border ${getSeverityStyle(event.severity)}`}
                  >
                    <div className='flex items-start justify-between'>
                      <div className='flex-1'>
                        <div className='flex items-center space-x-2 mb-2'>
                          <span className='font-medium'>{event.type}</span>
                          <span className='text-sm px-2 py-1 bg-white rounded-full'>
                            {event.severity}
                          </span>
                        </div>

                        <p className='text-sm mb-2'>{event.description}</p>

                        <div className='flex items-center space-x-4 text-xs'>
                          <span className='flex items-center'>
                            <Users className='w-3 h-3 mr-1' />
                            {event.user}
                          </span>
                          <span className='flex items-center'>
                            <MapPin className='w-3 h-3 mr-1' />
                            {event.location}
                          </span>
                          <span className='flex items-center'>
                            <Wifi className='w-3 h-3 mr-1' />
                            {event.ipAddress}
                          </span>
                          <span className='flex items-center'>
                            <Clock className='w-3 h-3 mr-1' />
                            {event.timestamp.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className='ml-4'>
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            event.status === 'active'
                              ? 'bg-red-100 text-red-700'
                              : event.status === 'resolved'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {event.status === 'active'
                            ? 'アクティブ'
                            : event.status === 'resolved'
                              ? '解決済み'
                              : '調査中'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </TabsContent>

        {/* アクティブセッション */}
        <TabsContent value='sessions'>
          <Card className='p-6'>
            <h3 className='text-lg font-semibold mb-4'>
              アクティブセッション管理
            </h3>

            <div className='space-y-3'>
              {activeSessions.length === 0 ? (
                <p className='text-gray-500 text-center py-8'>
                  アクティブなセッションはありません
                </p>
              ) : (
                activeSessions.map(session => (
                  <div
                    key={session.id}
                    className='p-4 border rounded-lg hover:bg-gray-50'
                  >
                    <div className='flex items-center justify-between'>
                      <div className='flex-1'>
                        <div className='flex items-center space-x-3 mb-2'>
                          <span className='font-medium'>
                            {session.userName}
                          </span>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${getRiskLevelStyle(session.riskLevel)}`}
                          >
                            {session.riskLevel === 'high'
                              ? '高リスク'
                              : session.riskLevel === 'medium'
                                ? '中リスク'
                                : '低リスク'}
                          </span>
                        </div>

                        <div className='flex items-center space-x-4 text-sm text-gray-600'>
                          <span className='flex items-center'>
                            <Smartphone className='w-3 h-3 mr-1' />
                            {session.device}
                          </span>
                          <span className='flex items-center'>
                            <MapPin className='w-3 h-3 mr-1' />
                            {session.location}
                          </span>
                          <span className='flex items-center'>
                            <Wifi className='w-3 h-3 mr-1' />
                            {session.ipAddress}
                          </span>
                          <span className='flex items-center'>
                            <Clock className='w-3 h-3 mr-1' />
                            {session.lastActivity.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => handleTerminateSession(session.id)}
                        className='text-red-600 hover:text-red-700'
                      >
                        <Lock className='w-4 h-4 mr-1' />
                        終了
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </TabsContent>

        {/* 分析 */}
        <TabsContent value='analytics'>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            <Card className='p-6'>
              <h3 className='text-lg font-semibold mb-4'>脅威トレンド</h3>
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <span>ブルートフォース攻撃</span>
                  <div className='flex items-center'>
                    <div className='w-24 bg-gray-200 rounded-full h-2 mr-2'>
                      <div
                        className='bg-red-600 h-2 rounded-full'
                        style={{ width: '75%' }}
                      ></div>
                    </div>
                    <span className='text-sm text-gray-600'>24</span>
                  </div>
                </div>

                <div className='flex items-center justify-between'>
                  <span>位置異常アクセス</span>
                  <div className='flex items-center'>
                    <div className='w-24 bg-gray-200 rounded-full h-2 mr-2'>
                      <div
                        className='bg-orange-600 h-2 rounded-full'
                        style={{ width: '45%' }}
                      ></div>
                    </div>
                    <span className='text-sm text-gray-600'>8</span>
                  </div>
                </div>

                <div className='flex items-center justify-between'>
                  <span>セッション異常</span>
                  <div className='flex items-center'>
                    <div className='w-24 bg-gray-200 rounded-full h-2 mr-2'>
                      <div
                        className='bg-yellow-600 h-2 rounded-full'
                        style={{ width: '30%' }}
                      ></div>
                    </div>
                    <span className='text-sm text-gray-600'>5</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className='p-6'>
              <h3 className='text-lg font-semibold mb-4'>セキュリティスコア</h3>
              <div className='text-center'>
                <div className='w-32 h-32 mx-auto mb-4 relative'>
                  <div className='w-full h-full bg-gray-200 rounded-full'></div>
                  <div
                    className='absolute inset-0 bg-green-600 rounded-full'
                    style={{
                      background: `conic-gradient(#16a34a 0% 85%, #e5e7eb 85% 100%)`,
                    }}
                  ></div>
                  <div className='absolute inset-4 bg-white rounded-full flex items-center justify-center'>
                    <div>
                      <div className='text-2xl font-bold text-green-600'>
                        85
                      </div>
                      <div className='text-xs text-gray-600'>/ 100</div>
                    </div>
                  </div>
                </div>

                <p className='text-lg font-medium text-green-600 mb-2'>良好</p>
                <p className='text-sm text-gray-600'>
                  セキュリティレベルは良好です。継続的な監視を推奨します。
                </p>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
