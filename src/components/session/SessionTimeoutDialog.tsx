'use client';

/**
 * セッションタイムアウト警告ダイアログ
 * ユーザーにセッション期限を通知し、延長またはログアウトの選択肢を提供
 */

import React, { useState, useEffect } from 'react';
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
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Clock, AlertTriangle, Shield } from 'lucide-react';

interface SessionTimeoutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  remainingMinutes: number;
  onExtend: (minutes?: number) => void;
  onLogout: () => void;
}

export function SessionTimeoutDialog({
  isOpen,
  onClose,
  remainingMinutes,
  onExtend,
  onLogout,
}: SessionTimeoutDialogProps) {
  const [countdown, setCountdown] = useState(remainingMinutes * 60); // seconds
  const [isAutoLogoutEnabled, setIsAutoLogoutEnabled] = useState(true);

  // カウントダウン処理
  useEffect(() => {
    if (!isOpen || !isAutoLogoutEnabled) return;

    setCountdown(remainingMinutes * 60);

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, remainingMinutes, isAutoLogoutEnabled, onLogout]);

  // 時間フォーマット
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // プログレスバーの値計算
  const progressValue = ((remainingMinutes * 60 - countdown) / (remainingMinutes * 60)) * 100;

  const handleExtend = (minutes: number) => {
    onExtend(minutes);
    onClose();
  };

  const handleStayLoggedIn = () => {
    setIsAutoLogoutEnabled(false);
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <AlertDialogTitle className="text-lg font-semibold text-gray-900">
                セッション期限切れ間近
              </AlertDialogTitle>
            </div>
          </div>
        </AlertDialogHeader>
        
        <AlertDialogDescription asChild>
          <div className="space-y-4">
            <p className="text-gray-600">
              セキュリティのため、あなたのセッションがまもなく期限切れになります。
              続行するか、ログアウトするかを選択してください。
            </p>

            {/* カウントダウン表示 */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">
                    残り時間
                  </span>
                </div>
                <span className="text-lg font-mono font-bold text-orange-600">
                  {formatTime(countdown)}
                </span>
              </div>
              
              <Progress 
                value={progressValue} 
                className="h-2"
                // プログレスバーの色を動的に変更
                style={{
                  '--progress-background': countdown < 60 
                    ? 'rgb(239 68 68)' // red-500
                    : countdown < 180 
                    ? 'rgb(245 158 11)' // amber-500
                    : 'rgb(59 130 246)' // blue-500
                } as React.CSSProperties}
              />
            </div>

            {/* 警告メッセージ */}
            {countdown < 60 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Shield className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-red-800 font-medium">
                    まもなく自動ログアウトされます
                  </span>
                </div>
              </div>
            )}

            {/* オプション説明 */}
            <div className="text-sm text-gray-600 space-y-2">
              <div>
                <strong>セッション延長:</strong> セッションを30分または1時間延長できます
              </div>
              <div>
                <strong>ログアウト:</strong> 安全にログアウトしてセッションを終了します
              </div>
            </div>
          </div>
        </AlertDialogDescription>

        <AlertDialogFooter className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
          <div className="flex flex-col w-full space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
            <AlertDialogCancel 
              onClick={onLogout}
              className="w-full sm:w-auto"
            >
              ログアウト
            </AlertDialogCancel>
            
            <Button
              onClick={() => handleExtend(30)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              30分延長
            </Button>
            
            <AlertDialogAction
              onClick={() => handleExtend(60)}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
            >
              1時間延長
            </AlertDialogAction>
          </div>
        </AlertDialogFooter>

        {/* カウントダウン無効化オプション（デバッグ用） */}
        {process.env.NODE_ENV === 'development' && (
          <div className="pt-2 border-t">
            <Button
              onClick={handleStayLoggedIn}
              variant="ghost"
              size="sm"
              className="w-full text-xs text-gray-500 hover:text-gray-700"
            >
              自動ログアウトを無効にする (開発モード)
            </Button>
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}