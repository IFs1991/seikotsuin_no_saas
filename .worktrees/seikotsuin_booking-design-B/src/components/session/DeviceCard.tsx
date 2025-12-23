'use client';

/**
 * デバイスカードコンポーネント
 * 個別デバイス情報と管理アクションを表示
 */

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Smartphone,
  Monitor,
  Tablet,
  MapPin,
  Clock,
  CheckCircle,
  AlertTriangle,
  Shield,
  X,
  MoreVertical,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import type {
  DeviceSession,
  DeviceManagementAction,
} from '@/lib/multi-device-manager';

interface DeviceCardProps {
  device: DeviceSession;
  onAction: (
    action: DeviceManagementAction
  ) => Promise<{ success: boolean; message: string }>;
}

export function DeviceCard({ device, onAction }: DeviceCardProps) {
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // デバイスアイコンの取得
  const getDeviceIcon = () => {
    switch (device.deviceInfo.device?.toLowerCase()) {
      case 'mobile':
        return <Smartphone className='h-5 w-5 text-blue-600' />;
      case 'tablet':
        return <Tablet className='h-5 w-5 text-purple-600' />;
      default:
        return <Monitor className='h-5 w-5 text-green-600' />;
    }
  };

  // デバイス名の生成
  const getDeviceName = () => {
    const { device: deviceType, os, browser } = device.deviceInfo;
    return `${deviceType || 'デスクトップ'} (${os || 'Unknown'} - ${browser || 'Unknown'})`;
  };

  // 最終アクティビティの表示
  const getLastActivityText = () => {
    const now = new Date();
    const diff = now.getTime() - device.lastActivity.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return '今';
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days < 7) return `${days}日前`;
    return device.lastActivity.toLocaleDateString();
  };

  // アクション実行
  const handleAction = async (action: DeviceManagementAction) => {
    setIsLoading(true);
    try {
      const result = await onAction(action);
      if (!result.success) {
        alert(`エラー: ${result.message}`);
      }
    } catch (error) {
      console.error('Action execution error:', error);
      alert('アクション実行中にエラーが発生しました');
    } finally {
      setIsLoading(false);
      setShowRevokeDialog(false);
    }
  };

  // セッション無効化
  const handleRevokeSession = () => {
    handleAction({
      action: 'revoke_session',
      sessionId: device.sessionId,
      reason: 'user_requested',
    });
  };

  // デバイス信頼設定
  const handleTrustDevice = () => {
    handleAction({
      action: 'trust',
      deviceId: device.sessionId,
    });
  };

  // デバイスブロック
  const handleBlockDevice = () => {
    handleAction({
      action: 'block',
      deviceId: device.sessionId,
      reason: 'user_requested',
    });
  };

  return (
    <>
      <Card
        className={`transition-all duration-200 ${
          device.isCurrentDevice
            ? 'ring-2 ring-blue-500 ring-opacity-50 bg-blue-50/30'
            : 'hover:shadow-md'
        }`}
      >
        <CardContent className='p-4'>
          <div className='flex items-start justify-between'>
            <div className='flex items-start space-x-3'>
              {/* デバイスアイコン */}
              <div className='flex-shrink-0 p-2 bg-gray-100 rounded-lg'>
                {getDeviceIcon()}
              </div>

              {/* デバイス情報 */}
              <div className='flex-1 min-w-0'>
                <div className='flex items-center space-x-2 mb-2'>
                  <h4 className='font-medium text-gray-900 truncate'>
                    {getDeviceName()}
                  </h4>
                  {device.isCurrentDevice && (
                    <Badge variant='default' className='text-xs'>
                      現在のデバイス
                    </Badge>
                  )}
                  {device.isTrusted && (
                    <Badge variant='outline' className='text-xs text-green-600'>
                      <Shield className='h-3 w-3 mr-1' />
                      信頼済み
                    </Badge>
                  )}
                </div>

                {/* 接続情報 */}
                <div className='space-y-1 text-sm text-gray-600'>
                  {device.ipAddress && (
                    <div className='flex items-center space-x-1'>
                      <MapPin className='h-3 w-3' />
                      <span>IP: {device.ipAddress}</span>
                      {device.location && (
                        <span className='text-gray-500'>
                          ({device.location.country}, {device.location.region})
                        </span>
                      )}
                    </div>
                  )}

                  <div className='flex items-center space-x-1'>
                    <Clock className='h-3 w-3' />
                    <span>最終アクティビティ: {getLastActivityText()}</span>
                  </div>

                  <div className='text-xs text-gray-500'>
                    セッション開始: {device.createdAt.toLocaleDateString()}{' '}
                    {device.createdAt.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>

            {/* アクションメニュー */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-8 w-8 p-0'
                  disabled={isLoading}
                >
                  <MoreVertical className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                {!device.isCurrentDevice && (
                  <>
                    <DropdownMenuItem
                      onClick={() => setShowRevokeDialog(true)}
                      className='text-red-600 focus:text-red-600'
                    >
                      <X className='h-4 w-4 mr-2' />
                      セッションを終了
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}

                {!device.isTrusted && (
                  <DropdownMenuItem onClick={handleTrustDevice}>
                    <CheckCircle className='h-4 w-4 mr-2' />
                    デバイスを信頼
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  onClick={handleBlockDevice}
                  className='text-orange-600 focus:text-orange-600'
                >
                  <AlertTriangle className='h-4 w-4 mr-2' />
                  デバイスをブロック
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* セキュリティ警告 */}
          {!device.isTrusted && (
            <div className='mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg'>
              <div className='flex items-center space-x-2'>
                <AlertTriangle className='h-4 w-4 text-yellow-600' />
                <span className='text-sm text-yellow-800'>
                  このデバイスは信頼済みリストに登録されていません
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* セッション無効化確認ダイアログ */}
      <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>セッションの終了</AlertDialogTitle>
            <AlertDialogDescription>
              このデバイスのセッションを終了しますか？
              <br />
              <br />
              <strong>{getDeviceName()}</strong>
              <br />
              IP: {device.ipAddress}
              <br />
              <br />
              この操作は取り消すことができません。該当デバイスは再ログインが必要になります。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeSession}
              className='bg-red-600 hover:bg-red-700'
            >
              セッションを終了
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
