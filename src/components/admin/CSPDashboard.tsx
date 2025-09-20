/**
 * CSP違反監視ダッシュボード
 * Phase 3B: XSS攻撃対策・CSP違反のリアルタイム監視
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Activity, Clock, Globe } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createLogger } from '@/utils/logger';

const log = createLogger('CSPDashboard');

interface CSPViolation {
  id: string;
  document_uri: string;
  violated_directive: string;
  blocked_uri: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  threat_score: number;
  client_ip: string;
  user_agent: string;
  created_at: string;
  disposition: 'enforce' | 'report';
}

interface CSPStats {
  total_violations: number;
  critical_violations: number;
  unique_clients: number;
  top_directives: Array<{
    directive: string;
    count: number;
  }>;
  recent_threats: CSPViolation[];
}

export default function CSPDashboard() {
  const [stats, setStats] = useState<CSPStats | null>(null);
  const [violations, setViolations] = useState<CSPViolation[]>([]);
  const [loading, setLoading] = useState(true);
  // 選択中違反（将来の詳細表示用）

  // CSP統計とデータの取得
  const fetchCSPData = async () => {
    try {
      setLoading(true);

      // 並列でデータを取得
      const [statsResponse, violationsResponse] = await Promise.all([
        fetch('/api/admin/security/csp-stats'),
        fetch('/api/admin/security/csp-violations?limit=50'),
      ]);

      if (statsResponse.ok && violationsResponse.ok) {
        const statsData = await statsResponse.json();
        const violationsData = await violationsResponse.json();

        setStats(statsData);
        setViolations(violationsData.violations || []);
      }
    } catch (error) {
      log.error('CSPデータ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCSPData();

    // 30秒ごとにリアルタイム更新
    const interval = setInterval(fetchCSPData, 30000);
    return () => clearInterval(interval);
  }, []);

  // 重要度別の色とアイコン
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'medium':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className='h-4 w-4 text-red-500' />;
      case 'high':
        return <AlertTriangle className='h-4 w-4 text-orange-500' />;
      case 'medium':
        return <Activity className='h-4 w-4 text-yellow-500' />;
      default:
        return <Shield className='h-4 w-4 text-blue-500' />;
    }
  };

  // 違反の詳細表示
  const ViolationDetail = ({ violation }: { violation: CSPViolation }) => (
    <div className='space-y-4 p-4 border rounded-lg'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center space-x-2'>
          {getSeverityIcon(violation.severity)}
          <span className='font-medium'>{violation.violated_directive}</span>
          <Badge variant={getSeverityColor(violation.severity) as any}>
            {violation.severity.toUpperCase()}
          </Badge>
        </div>
        <span className='text-sm text-gray-500'>
          {new Date(violation.created_at).toLocaleString('ja-JP')}
        </span>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-sm'>
        <div>
          <strong>ドキュメントURI:</strong>
          <div className='mt-1 p-2 bg-gray-50 rounded text-xs break-all'>
            {violation.document_uri}
          </div>
        </div>
        <div>
          <strong>ブロックされたURI:</strong>
          <div className='mt-1 p-2 bg-gray-50 rounded text-xs break-all'>
            {violation.blocked_uri || 'N/A'}
          </div>
        </div>
        <div>
          <strong>クライアントIP:</strong>
          <div className='mt-1 font-mono'>{violation.client_ip}</div>
        </div>
        <div>
          <strong>脅威スコア:</strong>
          <div className='mt-1'>
            <div className='flex items-center space-x-2'>
              <div className='flex-1 bg-gray-200 rounded-full h-2'>
                <div
                  className={`h-2 rounded-full ${
                    violation.threat_score >= 70
                      ? 'bg-red-500'
                      : violation.threat_score >= 40
                        ? 'bg-orange-500'
                        : 'bg-yellow-500'
                  }`}
                  style={{ width: `${violation.threat_score}%` }}
                />
              </div>
              <span className='text-sm font-medium'>
                {violation.threat_score}/100
              </span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <strong>User Agent:</strong>
        <div className='mt-1 p-2 bg-gray-50 rounded text-xs break-all'>
          {violation.user_agent}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500' />
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>CSP違反監視</h1>
          <p className='text-gray-600'>
            XSS攻撃対策・Content Security Policy違反の監視
          </p>
        </div>
        <Button onClick={fetchCSPData} variant='outline'>
          <Activity className='h-4 w-4 mr-2' />
          更新
        </Button>
      </div>

      {/* 統計カード */}
      <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>総違反数</CardTitle>
            <Shield className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {stats?.total_violations || 0}
            </div>
            <p className='text-xs text-muted-foreground'>過去24時間</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>重大違反</CardTitle>
            <AlertTriangle className='h-4 w-4 text-red-500' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>
              {stats?.critical_violations || 0}
            </div>
            <p className='text-xs text-muted-foreground'>要注意レベル</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              ユニーククライアント
            </CardTitle>
            <Globe className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {stats?.unique_clients || 0}
            </div>
            <p className='text-xs text-muted-foreground'>異なるIP数</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>最新更新</CardTitle>
            <Clock className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-sm font-medium'>
              {new Date().toLocaleTimeString('ja-JP')}
            </div>
            <p className='text-xs text-muted-foreground'>自動更新: 30秒</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue='recent' className='space-y-4'>
        <TabsList>
          <TabsTrigger value='recent'>最新違反</TabsTrigger>
          <TabsTrigger value='analytics'>分析</TabsTrigger>
          <TabsTrigger value='config'>CSP設定</TabsTrigger>
        </TabsList>

        <TabsContent value='recent' className='space-y-4'>
          <Card>
            <CardHeader>
              <CardTitle>最新のCSP違反</CardTitle>
              <CardDescription>
                リアルタイムでCSP違反を監視・記録しています
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='space-y-4'>
                {violations.length === 0 ? (
                  <p className='text-center text-gray-500 py-8'>
                    現在CSP違反はありません
                  </p>
                ) : (
                  violations.map(violation => (
                    <ViolationDetail key={violation.id} violation={violation} />
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='analytics' className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <Card>
              <CardHeader>
                <CardTitle>よく違反されるディレクティブ</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-3'>
                  {stats?.top_directives?.map((item, index) => (
                    <div
                      key={index}
                      className='flex items-center justify-between'
                    >
                      <span className='text-sm font-medium'>
                        {item.directive}
                      </span>
                      <div className='flex items-center space-x-2'>
                        <div className='w-20 bg-gray-200 rounded-full h-2'>
                          <div
                            className='bg-blue-500 h-2 rounded-full'
                            style={{
                              width: `${(item.count / (stats?.total_violations || 1)) * 100}%`,
                            }}
                          />
                        </div>
                        <span className='text-sm text-gray-600'>
                          {item.count}
                        </span>
                      </div>
                    </div>
                  )) || (
                    <p className='text-gray-500 text-center py-4'>
                      データがありません
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>脅威傾向</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-3'>
                  <div className='flex justify-between text-sm'>
                    <span>クリティカル</span>
                    <span className='text-red-600 font-medium'>
                      {violations.filter(v => v.severity === 'critical').length}
                    </span>
                  </div>
                  <div className='flex justify-between text-sm'>
                    <span>高</span>
                    <span className='text-orange-600 font-medium'>
                      {violations.filter(v => v.severity === 'high').length}
                    </span>
                  </div>
                  <div className='flex justify-between text-sm'>
                    <span>中</span>
                    <span className='text-yellow-600 font-medium'>
                      {violations.filter(v => v.severity === 'medium').length}
                    </span>
                  </div>
                  <div className='flex justify-between text-sm'>
                    <span>低</span>
                    <span className='text-blue-600 font-medium'>
                      {violations.filter(v => v.severity === 'low').length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value='config' className='space-y-4'>
          <Card>
            <CardHeader>
              <CardTitle>CSP設定状況</CardTitle>
              <CardDescription>
                現在のContent Security Policy設定とモード
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='space-y-4'>
                <div className='flex items-center justify-between p-3 border rounded-lg'>
                  <div>
                    <div className='font-medium'>CSP導入段階</div>
                    <div className='text-sm text-gray-600'>
                      現在の運用モード
                    </div>
                  </div>
                  <Badge variant='outline'>
                    {process.env.CSP_ROLLOUT_PHASE || 'report-only'}
                  </Badge>
                </div>

                <div className='flex items-center justify-between p-3 border rounded-lg'>
                  <div>
                    <div className='font-medium'>環境</div>
                    <div className='text-sm text-gray-600'>現在の動作環境</div>
                  </div>
                  <Badge variant='outline'>
                    {process.env.NODE_ENV || 'development'}
                  </Badge>
                </div>

                <div className='p-3 border rounded-lg'>
                  <div className='font-medium mb-2'>主要ディレクティブ</div>
                  <div className='grid grid-cols-2 gap-2 text-sm'>
                    <div>✅ script-src: &apos;self&apos;</div>
                    <div>
                      ✅ style-src: &apos;self&apos; fonts.googleapis.com
                    </div>
                    <div>✅ img-src: &apos;self&apos; data: *.supabase.co</div>
                    <div>✅ frame-ancestors: &apos;none&apos;</div>
                    <div>✅ object-src: &apos;none&apos;</div>
                    <div>✅ base-uri: &apos;self&apos;</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
