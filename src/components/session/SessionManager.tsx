'use client';

/**
 * セッション管理メインコンポーネント
 * ユーザーが自分のアクティブセッションを管理できる画面
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  Smartphone, 
  Monitor, 
  Tablet, 
  MapPin, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  X,
  RefreshCw,
  LogOut
} from 'lucide-react';

import { useMultiDeviceManager } from '@/lib/multi-device-manager';
import { useSessionTimeout, formatTimeRemaining } from '@/lib/session-timeout';
import { SessionTimeoutDialog } from './SessionTimeoutDialog';
import { DeviceCard } from './DeviceCard';
import { SecurityAlerts } from './SecurityAlerts';

interface SessionManagerProps {
  userId: string;
  clinicId: string;
  userRole?: string;
}

export function SessionManager({ userId, clinicId, userRole }: SessionManagerProps) {
  const [activeTab, setActiveTab] = useState('devices');
  const [showTimeoutDialog, setShowTimeoutDialog] = useState(false);
  
  // セッションタイムアウト管理
  const sessionTimeout = useSessionTimeout({
    idleMinutes: userRole === 'admin' ? 60 : 30,
    warningMinutes: 5,
    showWarningDialog: false, // カスタムダイアログを使用
  });

  // マルチデバイス管理
  const {
    devices,
    loading: devicesLoading,
    error: devicesError,
    refreshDevices,
    executeAction,
  } = useMultiDeviceManager(userId, clinicId);

  // タイムアウト警告の表示
  useEffect(() => {
    if (sessionTimeout.state.isWarningShown && !showTimeoutDialog) {
      setShowTimeoutDialog(true);
    }
  }, [sessionTimeout.state.isWarningShown, showTimeoutDialog]);

  const handleLogoutAllDevices = async () => {
    const currentDevice = devices.find(d => d.isCurrentDevice);
    const result = await executeAction({
      action: 'revoke_all_other',
      sessionId: currentDevice?.sessionId,
    });

    if (result.success) {
      alert('他のすべてのデバイスからログアウトしました');
    } else {
      alert(`エラー: ${result.message}`);
    }
  };

  const handleExtendSession = (minutes: number = 30) => {
    sessionTimeout.extendSession(minutes);
    setShowTimeoutDialog(false);
  };

  const handleLogout = () => {
    sessionTimeout.logout();
  };

  // デバイスアイコンの取得
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case 'mobile': return <Smartphone className="h-5 w-5" />;
      case 'tablet': return <Tablet className="h-5 w-5" />;
      default: return <Monitor className="h-5 w-5" />;
    }
  };

  // セッション状態の表示
  const getSessionStatusBadge = () => {
    if (sessionTimeout.state.isTimedOut) {
      return <Badge variant="destructive">タイムアウト</Badge>;
    }
    if (sessionTimeout.state.isWarningShown) {
      return <Badge variant="outline" className="text-orange-600">警告中</Badge>;
    }
    return <Badge variant="outline" className="text-green-600">アクティブ</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* セッション状態概要 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <span>セッション状態</span>
            {getSessionStatusBadge()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
              <Clock className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-900">残り時間</p>
                <p className="text-lg font-semibold text-blue-700">
                  {formatTimeRemaining(sessionTimeout.state.timeUntilTimeout)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-900">アクティブデバイス</p>
                <p className="text-lg font-semibold text-green-700">
                  {devices.filter(d => d.lastActivity > new Date(Date.now() - 24 * 60 * 60 * 1000)).length} 台
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              <Shield className="h-5 w-5 text-gray-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">総セッション数</p>
                <p className="text-lg font-semibold text-gray-700">{devices.length} 個</p>
              </div>
            </div>
          </div>

          <div className="flex space-x-2 mt-4">
            <Button 
              onClick={() => handleExtendSession(30)}
              variant="outline"
              size="sm"
            >
              <Clock className="h-4 w-4 mr-2" />
              セッション延長 (30分)
            </Button>
            
            <Button 
              onClick={handleLogoutAllDevices}
              variant="outline"
              size="sm"
              className="text-orange-600 hover:text-orange-700"
            >
              <LogOut className="h-4 w-4 mr-2" />
              他のデバイスからログアウト
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* メインコンテンツ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>セッション管理</CardTitle>
            <Button 
              onClick={refreshDevices}
              variant="outline" 
              size="sm"
              disabled={devicesLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${devicesLoading ? 'animate-spin' : ''}`} />
              更新
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {devicesError && (
            <Alert className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{devicesError}</AlertDescription>
            </Alert>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="devices">アクティブデバイス</TabsTrigger>
              <TabsTrigger value="security">セキュリティ</TabsTrigger>
              <TabsTrigger value="history">履歴</TabsTrigger>
            </TabsList>

            <TabsContent value="devices" className="space-y-4">
              <div className="grid gap-4">
                {devicesLoading ? (
                  <div className="flex justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : devices.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    アクティブなセッションがありません
                  </div>
                ) : (
                  devices.map((device) => (
                    <DeviceCard
                      key={device.sessionId}
                      device={device}
                      onAction={executeAction}
                    />
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="security" className="space-y-4">
              <SecurityAlerts userId={userId} clinicId={clinicId} />
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <div className="text-center py-8 text-gray-500">
                セッション履歴機能は準備中です
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* タイムアウト警告ダイアログ */}
      <SessionTimeoutDialog
        isOpen={showTimeoutDialog}
        onClose={() => setShowTimeoutDialog(false)}
        remainingMinutes={Math.ceil(sessionTimeout.state.timeUntilTimeout)}
        onExtend={handleExtendSession}
        onLogout={handleLogout}
      />
    </div>
  );
}