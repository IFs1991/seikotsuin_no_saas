'use client';

/**
 * セキュリティアラートコンポーネント
 * ユーザーのセキュリティイベント履歴と推奨アクションを表示
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Info,
  Clock,
  MapPin,
  Smartphone,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';

import { SecurityMonitor } from '@/lib/security-monitor';

interface SecurityAlertsProps {
  userId: string;
  clinicId: string;
}

interface SecurityEvent {
  id: string;
  event_type: string;
  event_category: string;
  severity_level: string;
  event_description: string;
  event_data: any;
  ip_address?: string;
  created_at: string;
}

interface SecuritySummary {
  totalEvents: number;
  criticalThreats: number;
  suspiciousLogins: number;
  blockedIps: number;
  eventsByType: Record<string, number>;
  eventsByDay: Array<{ date: string; count: number }>;
}

export function SecurityAlerts({ userId, clinicId }: SecurityAlertsProps) {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [securityMonitor] = useState(() => new SecurityMonitor());

  useEffect(() => {
    loadSecurityData();
  }, [userId, clinicId]);

  const loadSecurityData = async () => {
    setLoading(true);
    setError(null);

    try {
      // セキュリティアラートとサマリーを取得
      const [alertsData, summaryData] = await Promise.all([
        securityMonitor.getSecurityAlerts(clinicId, 20),
        securityMonitor.getSecurityStatistics(clinicId, 30)
      ]);

      // アラートをイベント形式に変換
      const formattedEvents: SecurityEvent[] = alertsData.map(alert => ({
        id: alert.id,
        event_type: alert.threatType,
        event_category: 'security_violation',
        severity_level: alert.severity,
        event_description: alert.description,
        event_data: {},
        created_at: alert.createdAt.toISOString(),
      }));

      setEvents(formattedEvents);
      setSummary(summaryData);

    } catch (err) {
      console.error('Security data loading error:', err);
      setError('セキュリティ情報の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 重要度レベルのバッジ
  const getSeverityBadge = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return <Badge variant="destructive">緊急</Badge>;
      case 'high':
      case 'error':
        return <Badge variant="destructive">重要</Badge>;
      case 'medium':
      case 'warning':
        return <Badge variant="outline" className="border-orange-500 text-orange-600">警告</Badge>;
      case 'low':
      case 'info':
      default:
        return <Badge variant="outline" className="border-blue-500 text-blue-600">情報</Badge>;
    }
  };

  // イベントタイプのアイコン
  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'threat_detected_brute_force':
        return <Shield className="h-4 w-4 text-red-600" />;
      case 'threat_detected_session_hijack':
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case 'threat_detected_location_anomaly':
        return <MapPin className="h-4 w-4 text-blue-600" />;
      case 'threat_detected_multiple_devices':
        return <Smartphone className="h-4 w-4 text-purple-600" />;
      default:
        return <Info className="h-4 w-4 text-gray-600" />;
    }
  };

  // イベントタイトルの生成
  const getEventTitle = (eventType: string) => {
    const titleMap: Record<string, string> = {
      'threat_detected_brute_force': 'ブルートフォース攻撃',
      'threat_detected_session_hijack': 'セッション乗っ取りの疑い',
      'threat_detected_location_anomaly': '異常な位置からのアクセス',
      'threat_detected_multiple_devices': '複数デバイス同時ログイン',
      'threat_detected_suspicious_login': '疑わしいログイン試行',
    };
    return titleMap[eventType] || 'セキュリティイベント';
  };

  // 日時のフォーマット
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('ja-JP'),
      time: date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const displayEvents = showAllEvents ? events : events.slice(0, 5);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* セキュリティサマリー */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Shield className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">総イベント数</p>
                <p className="text-xl font-bold text-blue-600">{summary.totalEvents}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">重要な脅威</p>
                <p className="text-xl font-bold text-red-600">{summary.criticalThreats}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Eye className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">疑わしいログイン</p>
                <p className="text-xl font-bold text-orange-600">{summary.suspiciousLogins}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">ブロック済みIP</p>
                <p className="text-xl font-bold text-green-600">{summary.blockedIps}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* セキュリティイベント一覧 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>セキュリティイベント</span>
            </CardTitle>
            <Button onClick={loadSecurityData} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              更新
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p className="text-lg font-medium">セキュリティイベントはありません</p>
              <p className="text-sm">あなたのアカウントは安全に保護されています</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayEvents.map((event) => {
                const { date, time } = formatDateTime(event.created_at);
                return (
                  <div
                    key={event.id}
                    className="flex items-start space-x-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-shrink-0 p-2 bg-gray-100 rounded-lg">
                      {getEventIcon(event.event_type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium text-gray-900">
                          {getEventTitle(event.event_type)}
                        </h4>
                        {getSeverityBadge(event.severity_level)}
                      </div>
                      
                      <p className="text-gray-600 text-sm mb-2">
                        {event.event_description}
                      </p>
                      
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>{date} {time}</span>
                        </span>
                        
                        {event.ip_address && (
                          <span className="flex items-center space-x-1">
                            <MapPin className="h-3 w-3" />
                            <span>IP: {event.ip_address}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* もっと見るボタン */}
              {events.length > 5 && (
                <div className="text-center pt-4">
                  <Button
                    onClick={() => setShowAllEvents(!showAllEvents)}
                    variant="outline"
                  >
                    {showAllEvents ? (
                      <>
                        <EyeOff className="h-4 w-4 mr-2" />
                        一部のみ表示
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-2" />
                        すべて表示 ({events.length - 5}件)
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}