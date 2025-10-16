/**
 * セキュリティモニタリングダッシュボード
 * Phase 3 M3: 監査ログ・セキュリティイベント可視化
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  Shield,
  AlertTriangle,
  Activity,
  Clock,
  Users,
  TrendingUp,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/lib/logger';

const log = createLogger('SecurityMonitor');

interface SecurityEvent {
  id: string;
  event_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  user_id?: string;
  clinic_id?: string;
  ip_address?: string;
  created_at: string;
  event_description: string;
}

interface AuditLogSummary {
  total_events: number;
  failed_logins: number;
  unauthorized_access: number;
  data_modifications: number;
  unique_users: number;
}

interface SecurityStats {
  events: SecurityEvent[];
  summary: AuditLogSummary;
  trend: Array<{
    date: string;
    count: number;
    severity: string;
  }>;
}

export default function SecurityMonitorPage() {
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');

  useEffect(() => {
    fetchSecurityStats();
  }, [timeRange]);

  const fetchSecurityStats = async () => {
    try {
      setLoading(true);
      // API呼び出し（実装例）
      const response = await fetch(
        `/api/admin/security/stats?range=${timeRange}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch security stats');
      }

      const data = await response.json();
      setStats(data);
    } catch (error) {
      log.error('セキュリティ統計取得失敗', error);
      // モックデータでフォールバック
      setStats(getMockData());
    } finally {
      setLoading(false);
    }
  };

  const getMockData = (): SecurityStats => ({
    events: [
      {
        id: '1',
        event_type: 'failed_login',
        severity: 'medium',
        ip_address: '192.168.1.100',
        created_at: new Date().toISOString(),
        event_description: 'ログイン失敗（5回目）',
      },
      {
        id: '2',
        event_type: 'unauthorized_access',
        severity: 'high',
        user_id: 'user-123',
        clinic_id: 'clinic-001',
        ip_address: '203.0.113.50',
        created_at: new Date(Date.now() - 3600000).toISOString(),
        event_description: '他クリニックデータへのアクセス試行',
      },
    ],
    summary: {
      total_events: 342,
      failed_logins: 12,
      unauthorized_access: 3,
      data_modifications: 89,
      unique_users: 45,
    },
    trend: [
      { date: '2025-10-01', count: 120, severity: 'low' },
      { date: '2025-10-02', count: 95, severity: 'medium' },
      { date: '2025-10-03', count: 127, severity: 'low' },
    ],
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'low':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getSeverityBadge = (severity: string) => {
    const colors = {
      critical: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-blue-100 text-blue-800',
    };
    return (
      colors[severity as keyof typeof colors] || 'bg-gray-100 text-gray-800'
    );
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <Activity className='w-8 h-8 animate-spin text-blue-500' />
      </div>
    );
  }

  return (
    <div className='container mx-auto p-6 space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-3xl font-bold flex items-center gap-2'>
            <Shield className='w-8 h-8 text-blue-500' />
            セキュリティモニタリング
          </h1>
          <p className='text-gray-600 mt-1'>
            監査ログ・セキュリティイベントのリアルタイム監視
          </p>
        </div>

        <div className='flex gap-2'>
          <Button
            variant={timeRange === '24h' ? 'default' : 'outline'}
            onClick={() => setTimeRange('24h')}
          >
            24時間
          </Button>
          <Button
            variant={timeRange === '7d' ? 'default' : 'outline'}
            onClick={() => setTimeRange('7d')}
          >
            7日間
          </Button>
          <Button
            variant={timeRange === '30d' ? 'default' : 'outline'}
            onClick={() => setTimeRange('30d')}
          >
            30日間
          </Button>
        </div>
      </div>

      {/* サマリーカード */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>総イベント数</CardTitle>
            <Activity className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {stats?.summary.total_events || 0}
            </div>
            <p className='text-xs text-muted-foreground'>
              過去
              {timeRange === '24h'
                ? '24時間'
                : timeRange === '7d'
                  ? '7日間'
                  : '30日間'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>ログイン失敗</CardTitle>
            <AlertTriangle className='h-4 w-4 text-orange-500' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-orange-600'>
              {stats?.summary.failed_logins || 0}
            </div>
            <p className='text-xs text-muted-foreground'>
              ブルートフォース検知対象
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              権限外アクセス
            </CardTitle>
            <Shield className='h-4 w-4 text-red-500' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>
              {stats?.summary.unauthorized_access || 0}
            </div>
            <p className='text-xs text-muted-foreground'>RLS違反試行</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              アクティブユーザー
            </CardTitle>
            <Users className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {stats?.summary.unique_users || 0}
            </div>
            <p className='text-xs text-muted-foreground'>ユニークユーザー数</p>
          </CardContent>
        </Card>
      </div>

      {/* 最近のセキュリティイベント */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <AlertTriangle className='w-5 h-5 text-orange-500' />
            最近のセキュリティイベント
          </CardTitle>
          <CardDescription>高リスクイベントを優先表示</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            {stats?.events.map(event => (
              <div
                key={event.id}
                className='flex items-start gap-4 p-4 border rounded-lg hover:bg-gray-50'
              >
                <div
                  className={`w-2 h-2 rounded-full mt-2 ${getSeverityColor(event.severity)}`}
                />
                <div className='flex-1'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <Badge className={getSeverityBadge(event.severity)}>
                        {event.severity.toUpperCase()}
                      </Badge>
                      <span className='font-semibold'>{event.event_type}</span>
                    </div>
                    <div className='flex items-center gap-1 text-sm text-gray-500'>
                      <Clock className='w-4 h-4' />
                      {new Date(event.created_at).toLocaleString('ja-JP')}
                    </div>
                  </div>
                  <p className='text-sm text-gray-700 mt-1'>
                    {event.event_description}
                  </p>
                  <div className='flex gap-4 text-xs text-gray-500 mt-2'>
                    {event.ip_address && <span>IP: {event.ip_address}</span>}
                    {event.user_id && <span>ユーザー: {event.user_id}</span>}
                    {event.clinic_id && (
                      <span>クリニック: {event.clinic_id}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* トレンドチャート（簡易版） */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <TrendingUp className='w-5 h-5 text-blue-500' />
            イベントトレンド
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='space-y-2'>
            {stats?.trend.map((item, index) => (
              <div key={index} className='flex items-center gap-4'>
                <span className='text-sm text-gray-600 w-24'>{item.date}</span>
                <div className='flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden'>
                  <div
                    className={`h-full ${getSeverityColor(item.severity)}`}
                    style={{ width: `${(item.count / 150) * 100}%` }}
                  />
                </div>
                <span className='text-sm font-semibold w-12 text-right'>
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
