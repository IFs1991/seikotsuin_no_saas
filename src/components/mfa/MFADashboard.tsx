/**
 * MFA管理ダッシュボード
 * Phase 3B: MFA設定・管理UI
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Key,
  Smartphone,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Settings,
  BarChart3,
} from 'lucide-react';
import { MFASetupWizard } from './MFASetupWizard';

interface MFAStatus {
  isEnabled: boolean;
  hasBackupCodes: boolean;
  lastUsed?: Date;
  setupCompletedAt?: Date;
}

interface BackupCodeUsage {
  totalGenerated: number;
  totalUsed: number;
  remainingCount: number;
  lastUsed?: Date;
  generatedAt: Date;
  warningLevel: 'none' | 'low' | 'critical';
}

interface MFADashboardProps {
  userId: string;
  clinicId: string;
  isAdmin?: boolean;
}

export const MFADashboard: React.FC<MFADashboardProps> = ({
  userId,
  clinicId,
  isAdmin = false,
}) => {
  const [mfaStatus, setMFAStatus] = useState<MFAStatus>({
    isEnabled: false,
    hasBackupCodes: false,
  });
  const [backupCodeUsage, setBackupCodeUsage] = useState<BackupCodeUsage | null>(null);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // MFA状態を取得
  const fetchMFAStatus = async () => {
    try {
      const response = await fetch(`/api/mfa/status?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setMFAStatus(data);
      }
    } catch (err) {
      console.error('MFA状態取得エラー:', err);
    }
  };

  // バックアップコード使用状況を取得
  const fetchBackupCodeUsage = async () => {
    if (!mfaStatus.isEnabled) return;

    try {
      const response = await fetch(`/api/mfa/backup-codes/usage?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setBackupCodeUsage(data);
      }
    } catch (err) {
      console.error('バックアップコード使用状況取得エラー:', err);
    }
  };

  // MFA無効化
  const handleDisableMFA = async () => {
    if (!confirm('MFAを無効化すると、セキュリティが低下します。続行しますか？')) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/mfa/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error('MFA無効化に失敗しました');
      }

      await fetchMFAStatus();
      setBackupCodeUsage(null);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // バックアップコード再生成
  const handleRegenerateBackupCodes = async () => {
    if (!confirm('新しいバックアップコードを生成します。既存のコードは無効になります。続行しますか？')) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/mfa/backup-codes/regenerate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error('バックアップコード再生成に失敗しました');
      }

      const data = await response.json();
      
      // CSVダウンロード
      const csvContent = [
        'バックアップコード,生成日時',
        ...data.backupCodes.map((code: string) => `${code},${new Date().toLocaleString()}`),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `mfa_backup_codes_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();

      await fetchBackupCodeUsage();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMFAStatus();
  }, [userId]);

  useEffect(() => {
    if (mfaStatus.isEnabled) {
      fetchBackupCodeUsage();
    }
  }, [mfaStatus.isEnabled]);

  const getSecurityLevel = () => {
    if (!mfaStatus.isEnabled) {
      return {
        level: 'basic',
        icon: ShieldAlert,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        description: 'パスワードのみ',
      };
    }

    if (!mfaStatus.hasBackupCodes || (backupCodeUsage?.warningLevel === 'critical')) {
      return {
        level: 'medium',
        icon: Shield,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        description: 'MFA有効（要注意）',
      };
    }

    return {
      level: 'high',
      icon: ShieldCheck,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      description: 'MFA有効（推奨レベル）',
    };
  };

  const securityLevel = getSecurityLevel();
  const SecurityIcon = securityLevel.icon;

  return (
    <div className="space-y-6">
      {/* セキュリティ状態カード */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className={`w-12 h-12 rounded-full ${securityLevel.bgColor} flex items-center justify-center`}>
              <SecurityIcon className={`w-6 h-6 ${securityLevel.color}`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold">アカウントセキュリティ</h3>
              <p className="text-gray-600">{securityLevel.description}</p>
              
              {mfaStatus.isEnabled && mfaStatus.lastUsed && (
                <div className="flex items-center mt-2 text-sm text-gray-500">
                  <Clock className="w-4 h-4 mr-1" />
                  最終認証: {new Date(mfaStatus.lastUsed).toLocaleString()}
                </div>
              )}
            </div>
          </div>

          <div className="text-right">
            {!mfaStatus.isEnabled ? (
              <Button 
                onClick={() => setShowSetupWizard(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Shield className="w-4 h-4 mr-2" />
                MFA設定
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleDisableMFA}
                disabled={loading}
              >
                <Settings className="w-4 h-4 mr-2" />
                設定変更
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* MFA詳細情報 */}
      {mfaStatus.isEnabled && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* TOTP認証 */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h4 className="font-medium">認証アプリ</h4>
                  <p className="text-sm text-gray-600">有効</p>
                </div>
              </div>
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>

            {mfaStatus.setupCompletedAt && (
              <div className="text-sm text-gray-600">
                設定完了: {new Date(mfaStatus.setupCompletedAt).toLocaleString()}
              </div>
            )}
          </Card>

          {/* バックアップコード */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                  <Key className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h4 className="font-medium">バックアップコード</h4>
                  <p className="text-sm text-gray-600">
                    {backupCodeUsage ? `残り ${backupCodeUsage.remainingCount}/${backupCodeUsage.totalGenerated}` : 'ロード中...'}
                  </p>
                </div>
              </div>
              
              {backupCodeUsage?.warningLevel === 'critical' && (
                <AlertTriangle className="w-5 h-5 text-red-600" />
              )}
              {backupCodeUsage?.warningLevel === 'low' && (
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
              )}
              {backupCodeUsage?.warningLevel === 'none' && (
                <CheckCircle className="w-5 h-5 text-green-600" />
              )}
            </div>

            {backupCodeUsage && (
              <div className="space-y-2">
                {backupCodeUsage.warningLevel !== 'none' && (
                  <div className={`text-sm p-2 rounded ${
                    backupCodeUsage.warningLevel === 'critical' 
                      ? 'bg-red-50 text-red-700'
                      : 'bg-yellow-50 text-yellow-700'
                  }`}>
                    {backupCodeUsage.warningLevel === 'critical' 
                      ? 'バックアップコードがありません' 
                      : 'バックアップコードが不足しています'}
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateBackupCodes}
                  disabled={loading}
                  className="w-full"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  新しいコードを生成
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 管理者用統計 */}
      {isAdmin && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center">
              <BarChart3 className="w-5 h-5 mr-2" />
              MFA利用統計
            </h3>
            <Button variant="outline" size="sm">
              詳細を見る
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">85%</div>
              <div className="text-sm text-gray-600">MFA有効率</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">142</div>
              <div className="text-sm text-gray-600">今月の認証</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">8</div>
              <div className="text-sm text-gray-600">バックアップ使用</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">99.8%</div>
              <div className="text-sm text-gray-600">成功率</div>
            </div>
          </div>
        </Card>
      )}

      {/* セキュリティ推奨事項 */}
      {!mfaStatus.isEnabled && (
        <Card className="p-6 border-yellow-200 bg-yellow-50">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-yellow-800">セキュリティ推奨事項</h4>
              <p className="text-yellow-700 mt-1 mb-3">
                多要素認証（MFA）を有効にすることで、不正アクセスのリスクを99.9%削減できます。
              </p>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• フィッシング攻撃からの保護</li>
                <li>• パスワード漏洩時の二次防御</li>
                <li>• 医療データへの不正アクセス防止</li>
              </ul>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* MFA設定ウィザード */}
      <MFASetupWizard
        isOpen={showSetupWizard}
        onClose={() => setShowSetupWizard(false)}
        onComplete={fetchMFAStatus}
        userId={userId}
        clinicId={clinicId}
      />
    </div>
  );
};