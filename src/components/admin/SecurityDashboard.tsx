/**
 * 管理者向けセキュリティダッシュボード
 * Phase 3B: クリニック全体のセキュリティ監視・管理
 * 更新: セキュリティ監視運用_MVP仕様書対応
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Shield,
  ShieldAlert,
  Users,
  Activity,
  Clock,
  Lock,
  Unlock,
  Download,
  RefreshCw,
  MapPin,
  Smartphone,
  Wifi,
  CheckCircle,
  Search,
} from 'lucide-react';

interface SecurityMetrics {
  totalUsers: number;
  mfaEnabledUsers: number;
  activeSessions: number;
  recentThreats: number;
  blockedAttempts: number;
  successfulLogins: number;
  mfaPercentage: number;
  eventsByType: Record<string, number>;
  eventsByDay: Array<{ date: string; count: number; severity: string }>;
}

interface SecurityEvent {
  id: string;
  event_type: string;
  severity_level: 'info' | 'warning' | 'error' | 'critical';
  user_id?: string;
  clinic_id: string;
  event_description: string;
  ip_address?: string;
  created_at: string;
  status: 'new' | 'investigating' | 'resolved' | 'false_positive';
  resolution_notes?: string;
  actions_taken?: string[];
  resolved_at?: string;
}

interface SessionInfo {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string;
  device: string;
  deviceType: string;
  ipAddress: string;
  location: string;
  loginTime: string;
  lastActivity: string;
  expiresAt: string;
  riskLevel: 'low' | 'medium' | 'high';
}

interface SecurityDashboardProps {
  clinicId: string;
}

export const SecurityDashboard: React.FC<SecurityDashboardProps> = ({
  clinicId,
}) => {
  const [metrics, setMetrics] = useState<SecurityMetrics>({
    totalUsers: 0,
    mfaEnabledUsers: 0,
    activeSessions: 0,
    recentThreats: 0,
    blockedAttempts: 0,
    successfulLogins: 0,
    mfaPercentage: 0,
    eventsByType: {},
    eventsByDay: [],
  });

  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [activeSessions, setActiveSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // イベント更新用モーダル
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(
    null
  );
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventStatus, setEventStatus] = useState<string>('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  // フィルター
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // セキュリティメトリクス取得
  const fetchSecurityMetrics = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/security/metrics?clinic_id=${clinicId}`
      );
      if (response.ok) {
        const data = await response.json();
        setMetrics(data.data || data);
      }
    } catch (error) {
      console.error('セキュリティメトリクス取得エラー:', error);
    }
  }, [clinicId]);

  // セキュリティイベント取得
  const fetchSecurityEvents = useCallback(async () => {
    try {
      let url = `/api/admin/security/events?clinic_id=${clinicId}`;
      if (statusFilter && statusFilter !== 'all') {
        url += `&status=${statusFilter}`;
      }
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setSecurityEvents(data.events || data.data?.events || []);
      }
    } catch (error) {
      console.error('セキュリティイベント取得エラー:', error);
    }
  }, [clinicId, statusFilter]);

  // アクティブセッション取得
  const fetchActiveSessions = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/security/sessions?clinic_id=${clinicId}`
      );
      if (response.ok) {
        const data = await response.json();
        setActiveSessions(data.sessions || data.data?.sessions || []);
      }
    } catch (error) {
      console.error('アクティブセッション取得エラー:', error);
    }
  }, [clinicId]);

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

  // イベントステータス更新
  const handleUpdateEventStatus = async () => {
    if (!selectedEvent) return;

    setUpdating(true);
    try {
      const response = await fetch('/api/admin/security/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedEvent.id,
          status: eventStatus,
          resolution_notes: resolutionNotes,
        }),
      });

      if (response.ok) {
        await fetchSecurityEvents();
        setShowEventModal(false);
        setSelectedEvent(null);
        setEventStatus('');
        setResolutionNotes('');
      }
    } catch (error) {
      console.error('イベント更新エラー:', error);
    } finally {
      setUpdating(false);
    }
  };

  // イベント編集モーダルを開く
  const openEventModal = (event: SecurityEvent) => {
    setSelectedEvent(event);
    setEventStatus(event.status);
    setResolutionNotes(event.resolution_notes || '');
    setShowEventModal(true);
  };

  // セキュリティレポートダウンロード
  const handleDownloadReport = () => {
    const csvContent = [
      'イベントタイプ,重要度,説明,IPアドレス,日時,ステータス,解決メモ',
      ...securityEvents.map(
        event =>
          `${event.event_type},${event.severity_level},"${event.event_description}",${event.ip_address || ''},${new Date(event.created_at).toLocaleString()},${event.status},"${event.resolution_notes || ''}"`
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
        await fetchSecurityMetrics();
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
      case 'error':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // ステータス別スタイル取得
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-red-100 text-red-700';
      case 'investigating':
        return 'bg-yellow-100 text-yellow-700';
      case 'resolved':
        return 'bg-green-100 text-green-700';
      case 'false_positive':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  // ステータスラベル
  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      new: '新規',
      investigating: '調査中',
      resolved: '解決済み',
      false_positive: '誤検知',
    };
    return labels[status] || status;
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
  }, [fetchSecurityMetrics, fetchSecurityEvents, fetchActiveSessions]);

  // フィルター変更時にイベント再取得
  useEffect(() => {
    fetchSecurityEvents();
  }, [statusFilter, fetchSecurityEvents]);

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
              <p className='text-xs text-gray-500'>{metrics.mfaPercentage}%</p>
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
            <div className='flex items-center justify-between mb-4'>
              <h3 className='text-lg font-semibold'>セキュリティイベント</h3>
              <div className='flex items-center gap-2'>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className='w-40'>
                    <SelectValue placeholder='ステータス' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>すべて</SelectItem>
                    <SelectItem value='new'>新規</SelectItem>
                    <SelectItem value='investigating'>調査中</SelectItem>
                    <SelectItem value='resolved'>解決済み</SelectItem>
                    <SelectItem value='false_positive'>誤検知</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className='space-y-3'>
              {securityEvents.length === 0 ? (
                <p className='text-gray-500 text-center py-8'>
                  セキュリティイベントはありません
                </p>
              ) : (
                securityEvents.map(event => (
                  <div
                    key={event.id}
                    data-testid='security-event-item'
                    className={`p-4 rounded-lg border ${getSeverityStyle(event.severity_level)}`}
                  >
                    <div className='flex items-start justify-between'>
                      <div className='flex-1'>
                        <div className='flex items-center space-x-2 mb-2'>
                          <span className='font-medium'>
                            {event.event_type}
                          </span>
                          <span className='text-sm px-2 py-1 bg-white rounded-full'>
                            {event.severity_level}
                          </span>
                          <span
                            className={`text-sm px-2 py-1 rounded-full ${getStatusStyle(event.status)}`}
                          >
                            {getStatusLabel(event.status)}
                          </span>
                        </div>

                        <p className='text-sm mb-2'>
                          {event.event_description}
                        </p>

                        <div className='flex items-center space-x-4 text-xs'>
                          {event.ip_address && (
                            <span className='flex items-center'>
                              <Wifi className='w-3 h-3 mr-1' />
                              {event.ip_address}
                            </span>
                          )}
                          <span className='flex items-center'>
                            <Clock className='w-3 h-3 mr-1' />
                            {new Date(event.created_at).toLocaleString()}
                          </span>
                        </div>

                        {event.resolution_notes && (
                          <p className='text-xs text-gray-600 mt-2 italic'>
                            解決メモ: {event.resolution_notes}
                          </p>
                        )}
                      </div>

                      <div className='ml-4 flex gap-2'>
                        {event.status !== 'resolved' &&
                          event.status !== 'false_positive' && (
                            <>
                              <Button
                                variant='outline'
                                size='sm'
                                onClick={() => openEventModal(event)}
                              >
                                <Search className='w-4 h-4 mr-1' />
                                調査
                              </Button>
                              <Button
                                variant='outline'
                                size='sm'
                                className='text-green-600'
                                onClick={() => {
                                  setSelectedEvent(event);
                                  setEventStatus('resolved');
                                  setResolutionNotes('');
                                  setShowEventModal(true);
                                }}
                              >
                                <CheckCircle className='w-4 h-4 mr-1' />
                                解決
                              </Button>
                            </>
                          )}
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
                            {new Date(session.lastActivity).toLocaleString()}
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
                {Object.entries(metrics.eventsByType)
                  .slice(0, 5)
                  .map(([type, count]) => (
                    <div
                      key={type}
                      className='flex items-center justify-between'
                    >
                      <span className='text-sm'>{type}</span>
                      <div className='flex items-center'>
                        <div className='w-24 bg-gray-200 rounded-full h-2 mr-2'>
                          <div
                            className='bg-blue-600 h-2 rounded-full'
                            style={{
                              width: `${Math.min((count / (Object.values(metrics.eventsByType)[0] || 1)) * 100, 100)}%`,
                            }}
                          ></div>
                        </div>
                        <span className='text-sm text-gray-600'>{count}</span>
                      </div>
                    </div>
                  ))}
                {Object.keys(metrics.eventsByType).length === 0 && (
                  <p className='text-gray-500 text-center py-4'>
                    データがありません
                  </p>
                )}
              </div>
            </Card>

            <Card className='p-6'>
              <h3 className='text-lg font-semibold mb-4'>日別イベント数</h3>
              <div className='space-y-2'>
                {metrics.eventsByDay.slice(-7).map(item => (
                  <div key={item.date} className='flex items-center gap-4'>
                    <span className='text-sm text-gray-600 w-24'>
                      {item.date}
                    </span>
                    <div className='flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden'>
                      <div
                        className={`h-full ${
                          item.severity === 'critical'
                            ? 'bg-red-500'
                            : item.severity === 'error'
                              ? 'bg-orange-500'
                              : item.severity === 'warning'
                                ? 'bg-yellow-500'
                                : 'bg-blue-500'
                        }`}
                        style={{
                          width: `${Math.min((item.count / 50) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <span className='text-sm font-semibold w-12 text-right'>
                      {item.count}
                    </span>
                  </div>
                ))}
                {metrics.eventsByDay.length === 0 && (
                  <p className='text-gray-500 text-center py-4'>
                    データがありません
                  </p>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* イベント更新モーダル */}
      <Dialog open={showEventModal} onOpenChange={setShowEventModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>イベントステータス更新</DialogTitle>
          </DialogHeader>

          <div className='space-y-4'>
            <div>
              <Label>ステータス</Label>
              <Select value={eventStatus} onValueChange={setEventStatus}>
                <SelectTrigger>
                  <SelectValue placeholder='ステータスを選択' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='new'>新規</SelectItem>
                  <SelectItem value='investigating'>調査中</SelectItem>
                  <SelectItem value='resolved'>解決済み</SelectItem>
                  <SelectItem value='false_positive'>誤検知</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>解決メモ</Label>
              <Textarea
                value={resolutionNotes}
                onChange={e => setResolutionNotes(e.target.value)}
                placeholder='対応内容を記録してください'
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setShowEventModal(false)}
              disabled={updating}
            >
              キャンセル
            </Button>
            <Button onClick={handleUpdateEventStatus} disabled={updating}>
              {updating ? '更新中...' : '更新'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
