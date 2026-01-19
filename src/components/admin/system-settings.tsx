'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Save,
  Shield,
  Database,
  Download,
  Upload,
  Loader2,
} from 'lucide-react';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { useUserProfile } from '@/hooks/useUserProfile';
import { AdminMessage } from './AdminMessage';

interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
  expiryDays: number;
}

interface SecuritySettings {
  passwordPolicy: PasswordPolicy;
  twoFactorEnabled: boolean;
  sessionTimeout: number;
  loginAttempts: number;
  lockoutDuration: number;
}

interface BackupSettings {
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  backupTime: string;
  retentionDays: number;
  cloudStorage: boolean;
  storageProvider: 'aws' | 'gcp' | 'azure';
}

interface SystemInfo {
  version: string;
  lastUpdate: string;
  databaseSize: string;
  storageUsage: number;
}

const initialSecurityData: SecuritySettings = {
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireNumbers: true,
    requireSymbols: false,
    expiryDays: 90,
  },
  twoFactorEnabled: false,
  sessionTimeout: 480,
  loginAttempts: 5,
  lockoutDuration: 30,
};

const initialBackupData: BackupSettings = {
  autoBackup: true,
  backupFrequency: 'daily',
  backupTime: '02:00',
  retentionDays: 30,
  cloudStorage: true,
  storageProvider: 'aws',
};

export function SystemSettings() {
  const { profile, loading: profileLoading } = useUserProfile();
  const clinicId = profile?.clinicId;

  const {
    data: security,
    updateData,
    loadingState,
    handleSave,
    isInitialized,
  } = useAdminSettings(initialSecurityData, clinicId ? {
    clinicId,
    category: 'system_security',
    autoLoad: true,
  } : undefined);

  const [systemInfo] = useState<SystemInfo>({
    version: '2.1.0',
    lastUpdate: '2024-08-10',
    databaseSize: '2.3 GB',
    storageUsage: 65,
  });

  // Backup settings remain local until system_backup persistence is wired.
  const [backup, setBackup] = useState<BackupSettings>(initialBackupData);

  if (profileLoading || !isInitialized) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">設定を読み込み中...</span>
      </div>
    );
  }

  const updateSecurity = (updates: Partial<SecuritySettings>) => {
    updateData(updates);
  };

  const updatePasswordPolicy = (updates: Partial<PasswordPolicy>) => {
    updateData({
      passwordPolicy: { ...security.passwordPolicy, ...updates },
    });
  };

  const updateBackup = (updates: Partial<BackupSettings>) => {
    setBackup(prev => ({ ...prev, ...updates }));
  };

  const onSave = async () => {
    await handleSave();
  };

  const handleBackupNow = async () => {
    // バックアップは別途API呼び出しが必要
    await new Promise(resolve => setTimeout(resolve, 2000));
  };

  return (
    <div className='space-y-6'>
      {loadingState.error && (
        <AdminMessage message={loadingState.error} type="error" />
      )}
      {loadingState.savedMessage && !loadingState.error && (
        <AdminMessage message={loadingState.savedMessage} type="success" />
      )}

      {/* システム情報 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4'>
          システム情報
        </h3>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <div>
            <Label className='block text-sm text-gray-700 mb-1'>
              システムバージョン
            </Label>
            <div className='text-lg font-medium text-gray-900'>
              {systemInfo.version}
            </div>
          </div>

          <div>
            <Label className='block text-sm text-gray-700 mb-1'>
              最終更新日
            </Label>
            <div className='text-lg font-medium text-gray-900'>
              {systemInfo.lastUpdate}
            </div>
          </div>

          <div>
            <Label className='block text-sm text-gray-700 mb-1'>
              データベースサイズ
            </Label>
            <div className='text-lg font-medium text-gray-900'>
              {systemInfo.databaseSize}
            </div>
          </div>

          <div>
            <Label className='block text-sm text-gray-700 mb-1'>
              ストレージ使用率
            </Label>
            <div className='flex items-center space-x-2'>
              <div className='flex-1 bg-gray-200 rounded-full h-2'>
                <div
                  className={`h-2 rounded-full ${systemInfo.storageUsage > 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${systemInfo.storageUsage}%` }}
                />
              </div>
              <span className='text-sm font-medium text-gray-900'>
                {systemInfo.storageUsage}%
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* セキュリティ設定 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
          <Shield className='w-5 h-5 mr-2' />
          セキュリティ設定
        </h3>

        <div className='space-y-6'>
          {/* パスワードポリシー */}
          <div>
            <h4 className='font-medium text-gray-900 mb-3'>
              パスワードポリシー
            </h4>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <Label htmlFor='password-min-length' className='block text-sm text-gray-700 mb-1'>
                  パスワード最小文字数
                </Label>
                <Input
                  id='password-min-length'
                  type='number'
                  value={security.passwordPolicy.minLength}
                  onChange={e =>
                    updatePasswordPolicy({ minLength: parseInt(e.target.value) })
                  }
                  min='4'
                  max='32'
                />
              </div>

              <div>
                <Label className='block text-sm text-gray-700 mb-1'>
                  パスワード有効期限（日）
                </Label>
                <Input
                  type='number'
                  value={security.passwordPolicy.expiryDays}
                  onChange={e =>
                    updatePasswordPolicy({ expiryDays: parseInt(e.target.value) })
                  }
                  min='0'
                  max='365'
                />
              </div>
            </div>

            <div className='mt-4 space-y-2'>
              <label className='flex items-center space-x-2'>
                <input
                  type='checkbox'
                  checked={security.passwordPolicy.requireUppercase}
                  onChange={e =>
                    updatePasswordPolicy({ requireUppercase: e.target.checked })
                  }
                  className='rounded border-gray-300'
                />
                <span className='text-sm text-gray-700'>
                  大文字を必須にする
                </span>
              </label>

              <label className='flex items-center space-x-2'>
                <input
                  type='checkbox'
                  checked={security.passwordPolicy.requireNumbers}
                  onChange={e =>
                    updatePasswordPolicy({ requireNumbers: e.target.checked })
                  }
                  className='rounded border-gray-300'
                />
                <span className='text-sm text-gray-700'>数字を必須にする</span>
              </label>

              <label className='flex items-center space-x-2'>
                <input
                  type='checkbox'
                  checked={security.passwordPolicy.requireSymbols}
                  onChange={e =>
                    updatePasswordPolicy({ requireSymbols: e.target.checked })
                  }
                  className='rounded border-gray-300'
                />
                <span className='text-sm text-gray-700'>記号を必須にする</span>
              </label>
            </div>
          </div>

          {/* ログイン設定 */}
          <div>
            <h4 className='font-medium text-gray-900 mb-3'>ログイン設定</h4>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              <div>
                <Label className='block text-sm text-gray-700 mb-1'>
                  セッションタイムアウト（分）
                </Label>
                <Input
                  data-testid="session-timeout-input"
                  type='number'
                  value={security.sessionTimeout}
                  onChange={e =>
                    updateSecurity({ sessionTimeout: parseInt(e.target.value) })
                  }
                  min='5'
                  max='1440'
                />
              </div>

              <div>
                <Label className='block text-sm text-gray-700 mb-1'>
                  ログイン試行回数上限
                </Label>
                <Input
                  type='number'
                  value={security.loginAttempts}
                  onChange={e =>
                    updateSecurity({ loginAttempts: parseInt(e.target.value) })
                  }
                  min='3'
                  max='10'
                />
              </div>

              <div>
                <Label className='block text-sm text-gray-700 mb-1'>
                  ロックアウト時間（分）
                </Label>
                <Input
                  type='number'
                  value={security.lockoutDuration}
                  onChange={e =>
                    updateSecurity({ lockoutDuration: parseInt(e.target.value) })
                  }
                  min='5'
                  max='1440'
                />
              </div>
            </div>

            <div className='mt-4 flex items-center space-x-2'>
              <Switch
                id='two-factor-toggle'
                data-testid="2fa-toggle"
                checked={security.twoFactorEnabled}
                onCheckedChange={checked =>
                  updateSecurity({ twoFactorEnabled: checked })
                }
              />
              <Label
                htmlFor='two-factor-toggle'
                className='text-sm text-gray-700'
              >
                二要素認証を有効にする
              </Label>
            </div>
          </div>
        </div>
      </Card>

      {/* バックアップ設定 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
          <Database className='w-5 h-5 mr-2' />
          バックアップ設定
        </h3>

        <div className='space-y-6'>
          <div>
            <label className='flex items-center space-x-2 mb-4'>
              <input
                type='checkbox'
                checked={backup.autoBackup}
                onChange={e =>
                  updateBackup({ autoBackup: e.target.checked })
                }
                className='rounded border-gray-300'
              />
              <span className='text-sm font-medium text-gray-700'>
                自動バックアップを有効にする
              </span>
            </label>

            {backup.autoBackup && (
              <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                <div>
                  <Label className='block text-sm text-gray-700 mb-1'>
                    バックアップ頻度
                  </Label>
                  <select
                    value={backup.backupFrequency}
                    onChange={e =>
                      updateBackup({
                        backupFrequency: e.target.value as
                          | 'daily'
                          | 'weekly'
                          | 'monthly',
                      })
                    }
                    className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                  >
                    <option value='daily'>毎日</option>
                    <option value='weekly'>毎週</option>
                    <option value='monthly'>毎月</option>
                  </select>
                </div>

                <div>
                  <Label className='block text-sm text-gray-700 mb-1'>
                    バックアップ時刻
                  </Label>
                  <Input
                    type='time'
                    value={backup.backupTime}
                    onChange={e =>
                      updateBackup({ backupTime: e.target.value })
                    }
                  />
                </div>

                <div>
                  <Label className='block text-sm text-gray-700 mb-1'>
                    保存期間（日）
                  </Label>
                  <Input
                    type='number'
                    value={backup.retentionDays}
                    onChange={e =>
                      updateBackup({ retentionDays: parseInt(e.target.value) })
                    }
                    min='1'
                    max='365'
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className='flex items-center space-x-2 mb-4'>
              <input
                type='checkbox'
                checked={backup.cloudStorage}
                onChange={e =>
                  updateBackup({ cloudStorage: e.target.checked })
                }
                className='rounded border-gray-300'
              />
              <span className='text-sm font-medium text-gray-700'>
                クラウドストレージにバックアップ
              </span>
            </label>

            {backup.cloudStorage && (
              <div>
                <Label className='block text-sm text-gray-700 mb-1'>
                  ストレージプロバイダー
                </Label>
                <select
                  value={backup.storageProvider}
                  onChange={e =>
                    updateBackup({
                      storageProvider: e.target.value as
                        | 'aws'
                        | 'gcp'
                        | 'azure',
                    })
                  }
                  className='w-full md:w-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                >
                  <option value='aws'>Amazon S3</option>
                  <option value='gcp'>Google Cloud Storage</option>
                  <option value='azure'>Azure Blob Storage</option>
                </select>
              </div>
            )}
          </div>

          <div className='flex space-x-4'>
            <Button
              onClick={handleBackupNow}
              disabled={loadingState.isLoading}
              className='flex items-center space-x-2'
            >
              <Download className='w-4 h-4' />
              <span>
                {loadingState.isLoading ? 'バックアップ中...' : '今すぐバックアップ'}
              </span>
            </Button>

            <Button variant='outline' className='flex items-center space-x-2'>
              <Upload className='w-4 h-4' />
              <span>バックアップから復元</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* 保存ボタン */}
      <div className='flex justify-end space-x-4 pt-6 border-t border-gray-200'>
        <Button variant='outline'>キャンセル</Button>
        <Button
          data-testid="save-settings-button"
          onClick={onSave}
          disabled={loadingState.isLoading}
          className='flex items-center space-x-2'
        >
          {loadingState.isLoading ? (
            <Loader2 className='w-4 h-4 animate-spin' />
          ) : (
            <Save className='w-4 h-4' />
          )}
          <span>{loadingState.isLoading ? '保存中...' : '設定を保存'}</span>
        </Button>
      </div>
    </div>
  );
}
