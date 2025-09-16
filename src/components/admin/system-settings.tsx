"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Save, Shield, Database, Key, AlertTriangle, Download, Upload } from 'lucide-react';

interface SecuritySettings {
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireNumbers: boolean;
    requireSymbols: boolean;
    expiryDays: number;
  };
  twoFactorEnabled: boolean;
  sessionTimeout: number; // 分
  loginAttempts: number;
  lockoutDuration: number; // 分
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
  storageUsage: number; // %
}

export function SystemSettings() {
  const [security, setSecurity] = useState<SecuritySettings>({
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireNumbers: true,
      requireSymbols: false,
      expiryDays: 90
    },
    twoFactorEnabled: false,
    sessionTimeout: 480, // 8時間
    loginAttempts: 5,
    lockoutDuration: 30
  });

  const [backup, setBackup] = useState<BackupSettings>({
    autoBackup: true,
    backupFrequency: 'daily',
    backupTime: '02:00',
    retentionDays: 30,
    cloudStorage: true,
    storageProvider: 'aws'
  });

  const [systemInfo] = useState<SystemInfo>({
    version: '2.1.0',
    lastUpdate: '2024-08-10',
    databaseSize: '2.3 GB',
    storageUsage: 65
  });

  const [isLoading, setIsLoading] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  const handleSave = async () => {
    setIsLoading(true);
    setSavedMessage('');

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSavedMessage('システム設定を保存しました');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (error) {
      setSavedMessage('保存に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackupNow = async () => {
    setIsLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      setSavedMessage('バックアップを完了しました');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (error) {
      setSavedMessage('バックアップに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {savedMessage && (
        <div className={`p-4 rounded-md ${
          savedMessage.includes('失敗') 
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-green-50 border border-green-200 text-green-700'
        }`}>
          {savedMessage}
        </div>
      )}

      {/* システム情報 */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">システム情報</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label className="block text-sm text-gray-700 mb-1">システムバージョン</Label>
            <div className="text-lg font-medium text-gray-900">{systemInfo.version}</div>
          </div>

          <div>
            <Label className="block text-sm text-gray-700 mb-1">最終更新日</Label>
            <div className="text-lg font-medium text-gray-900">{systemInfo.lastUpdate}</div>
          </div>

          <div>
            <Label className="block text-sm text-gray-700 mb-1">データベースサイズ</Label>
            <div className="text-lg font-medium text-gray-900">{systemInfo.databaseSize}</div>
          </div>

          <div>
            <Label className="block text-sm text-gray-700 mb-1">ストレージ使用率</Label>
            <div className="flex items-center space-x-2">
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${systemInfo.storageUsage > 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${systemInfo.storageUsage}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-900">{systemInfo.storageUsage}%</span>
            </div>
          </div>
        </div>
      </Card>

      {/* セキュリティ設定 */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Shield className="w-5 h-5 mr-2" />
          セキュリティ設定
        </h3>

        <div className="space-y-6">
          {/* パスワードポリシー */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">パスワードポリシー</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="block text-sm text-gray-700 mb-1">最小文字数</Label>
                <Input
                  type="number"
                  value={security.passwordPolicy.minLength}
                  onChange={(e) => setSecurity(prev => ({
                    ...prev,
                    passwordPolicy: { ...prev.passwordPolicy, minLength: parseInt(e.target.value) }
                  }))}
                  min="4"
                  max="32"
                />
              </div>

              <div>
                <Label className="block text-sm text-gray-700 mb-1">パスワード有効期限（日）</Label>
                <Input
                  type="number"
                  value={security.passwordPolicy.expiryDays}
                  onChange={(e) => setSecurity(prev => ({
                    ...prev,
                    passwordPolicy: { ...prev.passwordPolicy, expiryDays: parseInt(e.target.value) }
                  }))}
                  min="0"
                  max="365"
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={security.passwordPolicy.requireUppercase}
                  onChange={(e) => setSecurity(prev => ({
                    ...prev,
                    passwordPolicy: { ...prev.passwordPolicy, requireUppercase: e.target.checked }
                  }))}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">大文字を必須にする</span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={security.passwordPolicy.requireNumbers}
                  onChange={(e) => setSecurity(prev => ({
                    ...prev,
                    passwordPolicy: { ...prev.passwordPolicy, requireNumbers: e.target.checked }
                  }))}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">数字を必須にする</span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={security.passwordPolicy.requireSymbols}
                  onChange={(e) => setSecurity(prev => ({
                    ...prev,
                    passwordPolicy: { ...prev.passwordPolicy, requireSymbols: e.target.checked }
                  }))}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">記号を必須にする</span>
              </label>
            </div>
          </div>

          {/* ログイン設定 */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">ログイン設定</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="block text-sm text-gray-700 mb-1">セッションタイムアウト（分）</Label>
                <Input
                  type="number"
                  value={security.sessionTimeout}
                  onChange={(e) => setSecurity(prev => ({...prev, sessionTimeout: parseInt(e.target.value)}))}
                  min="5"
                  max="1440"
                />
              </div>

              <div>
                <Label className="block text-sm text-gray-700 mb-1">ログイン試行回数上限</Label>
                <Input
                  type="number"
                  value={security.loginAttempts}
                  onChange={(e) => setSecurity(prev => ({...prev, loginAttempts: parseInt(e.target.value)}))}
                  min="3"
                  max="10"
                />
              </div>

              <div>
                <Label className="block text-sm text-gray-700 mb-1">ロックアウト時間（分）</Label>
                <Input
                  type="number"
                  value={security.lockoutDuration}
                  onChange={(e) => setSecurity(prev => ({...prev, lockoutDuration: parseInt(e.target.value)}))}
                  min="5"
                  max="1440"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={security.twoFactorEnabled}
                  onChange={(e) => setSecurity(prev => ({...prev, twoFactorEnabled: e.target.checked}))}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">二要素認証を有効にする</span>
              </label>
            </div>
          </div>
        </div>
      </Card>

      {/* バックアップ設定 */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Database className="w-5 h-5 mr-2" />
          バックアップ設定
        </h3>

        <div className="space-y-6">
          <div>
            <label className="flex items-center space-x-2 mb-4">
              <input
                type="checkbox"
                checked={backup.autoBackup}
                onChange={(e) => setBackup(prev => ({...prev, autoBackup: e.target.checked}))}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">自動バックアップを有効にする</span>
            </label>

            {backup.autoBackup && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="block text-sm text-gray-700 mb-1">バックアップ頻度</Label>
                  <select
                    value={backup.backupFrequency}
                    onChange={(e) => setBackup(prev => ({...prev, backupFrequency: e.target.value as 'daily' | 'weekly' | 'monthly'}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="daily">毎日</option>
                    <option value="weekly">毎週</option>
                    <option value="monthly">毎月</option>
                  </select>
                </div>

                <div>
                  <Label className="block text-sm text-gray-700 mb-1">バックアップ時刻</Label>
                  <Input
                    type="time"
                    value={backup.backupTime}
                    onChange={(e) => setBackup(prev => ({...prev, backupTime: e.target.value}))}
                  />
                </div>

                <div>
                  <Label className="block text-sm text-gray-700 mb-1">保存期間（日）</Label>
                  <Input
                    type="number"
                    value={backup.retentionDays}
                    onChange={(e) => setBackup(prev => ({...prev, retentionDays: parseInt(e.target.value)}))}
                    min="1"
                    max="365"
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center space-x-2 mb-4">
              <input
                type="checkbox"
                checked={backup.cloudStorage}
                onChange={(e) => setBackup(prev => ({...prev, cloudStorage: e.target.checked}))}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">クラウドストレージにバックアップ</span>
            </label>

            {backup.cloudStorage && (
              <div>
                <Label className="block text-sm text-gray-700 mb-1">ストレージプロバイダー</Label>
                <select
                  value={backup.storageProvider}
                  onChange={(e) => setBackup(prev => ({...prev, storageProvider: e.target.value as 'aws' | 'gcp' | 'azure'}))}
                  className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="aws">Amazon S3</option>
                  <option value="gcp">Google Cloud Storage</option>
                  <option value="azure">Azure Blob Storage</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex space-x-4">
            <Button 
              onClick={handleBackupNow}
              disabled={isLoading}
              className="flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>{isLoading ? 'バックアップ中...' : '今すぐバックアップ'}</span>
            </Button>

            <Button 
              variant="outline"
              className="flex items-center space-x-2"
            >
              <Upload className="w-4 h-4" />
              <span>バックアップから復元</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* 保存ボタン */}
      <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
        <Button variant="outline">
          キャンセル
        </Button>
        <Button 
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center space-x-2"
        >
          <Save className="w-4 h-4" />
          <span>{isLoading ? '保存中...' : '設定を保存'}</span>
        </Button>
      </div>
    </div>
  );
}