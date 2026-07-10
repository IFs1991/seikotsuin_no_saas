'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save, Shield, Database, Loader2 } from 'lucide-react';
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

export function SystemSettings({
  clinicId: selectedClinicId,
}: {
  clinicId?: string | null;
}) {
  const systemInfo = {
    version: process.env.NEXT_PUBLIC_APP_VERSION?.trim() || '未設定',
    lastUpdate: process.env.NEXT_PUBLIC_BUILD_DATE?.trim() || '未設定',
  };

  const { profile, loading: profileLoading } = useUserProfile();
  const clinicId = selectedClinicId ?? profile?.clinicId;

  const {
    data: security,
    updateData,
    loadingState,
    handleSave,
    isInitialized,
  } = useAdminSettings(
    initialSecurityData,
    clinicId
      ? {
          clinicId,
          category: 'system_security',
          autoLoad: true,
        }
      : undefined
  );

  if (profileLoading || !isInitialized) {
    return (
      <div className='flex items-center justify-center py-12'>
        <Loader2 className='w-8 h-8 animate-spin text-blue-500' />
        <span className='ml-2 text-gray-600'>設定を読み込み中...</span>
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

  const onSave = async () => {
    await handleSave();
  };

  return (
    <div className='space-y-6'>
      {loadingState.error && (
        <AdminMessage message={loadingState.error} type='error' />
      )}
      {loadingState.savedMessage && !loadingState.error && (
        <AdminMessage message={loadingState.savedMessage} type='success' />
      )}

      {/* システム情報 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4'>
          システム情報
        </h3>

        <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
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
        </div>
      </Card>

      {/* セキュリティ設定 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
          <Shield className='w-5 h-5 mr-2' />
          セキュリティ運用ポリシー
        </h3>

        <div className='mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950'>
          ここで保存する値は院内の運用ポリシーを記録するためのものです。
          Supabase Auth のパスワード規則、セッション、MFA
          設定を自動的に変更するものではありません。実際の認証設定と利用者ごとの
          MFA 状態は、認証基盤と専用の MFA 画面で別途確認してください。
        </div>

        <div className='space-y-6'>
          {/* パスワードポリシー */}
          <div>
            <h4 className='font-medium text-gray-900 mb-3'>
              パスワードポリシー
            </h4>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <Label
                  htmlFor='password-min-length'
                  className='block text-sm text-gray-700 mb-1'
                >
                  パスワード最小文字数
                </Label>
                <Input
                  id='password-min-length'
                  type='number'
                  value={security.passwordPolicy.minLength}
                  onChange={e =>
                    updatePasswordPolicy({
                      minLength: parseInt(e.target.value),
                    })
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
                    updatePasswordPolicy({
                      expiryDays: parseInt(e.target.value),
                    })
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
                  data-testid='session-timeout-input'
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
                    updateSecurity({
                      lockoutDuration: parseInt(e.target.value),
                    })
                  }
                  min='5'
                  max='1440'
                />
              </div>
            </div>

            <div className='mt-4 flex items-center space-x-2'>
              <Switch
                id='two-factor-toggle'
                data-testid='2fa-toggle'
                checked={security.twoFactorEnabled}
                onCheckedChange={checked =>
                  updateSecurity({ twoFactorEnabled: checked })
                }
              />
              <Label
                htmlFor='two-factor-toggle'
                className='text-sm text-gray-700'
              >
                MFA 必須化の運用方針を記録する
              </Label>
            </div>
          </div>
        </div>
      </Card>

      {/* バックアップ運用 */}
      <Card className='p-6'>
        <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
          <Database className='w-5 h-5 mr-2' />
          バックアップと復元
        </h3>

        <div className='space-y-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950'>
          <p>
            このアプリからバックアップ設定の変更、手動バックアップ、復元は実行できません。
            実処理のない設定値や操作ボタンは表示していません。
          </p>
          <p>
            バックアップの有効状態、保存期間、復元可能時点は、運用責任者が
            Supabase
            の契約プランとプロジェクト設定で確認し、復元訓練の記録を残してください。
          </p>
        </div>
      </Card>

      {/* 保存ボタン */}
      <div className='flex justify-end pt-6 border-t border-gray-200'>
        <Button
          data-testid='save-settings-button'
          onClick={onSave}
          disabled={loadingState.isLoading}
          className='flex items-center space-x-2'
        >
          {loadingState.isLoading ? (
            <Loader2 className='w-4 h-4 animate-spin' />
          ) : (
            <Save className='w-4 h-4' />
          )}
          <span>
            {loadingState.isLoading ? '保存中...' : '運用ポリシーを保存'}
          </span>
        </Button>
      </div>
    </div>
  );
}
