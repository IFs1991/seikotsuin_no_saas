/**
 * MFA設定ウィザード
 * Phase 3B: ユーザーフレンドリーなMFA設定UI
 */

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Shield,
  Smartphone,
  Key,
  Copy,
  CheckCircle,
  AlertTriangle,
  Download,
  QrCode,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';

interface MFASetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  userId: string;
  clinicId: string;
}

interface SetupData {
  secretKey: string;
  qrCodeUrl: string;
  backupCodes: string[];
  manualEntryKey: string;
}

type SetupStep =
  | 'introduction'
  | 'generate'
  | 'configure'
  | 'verify'
  | 'backup'
  | 'complete';

export const MFASetupWizard: React.FC<MFASetupWizardProps> = ({
  isOpen,
  onClose,
  onComplete,
  userId,
  clinicId,
}) => {
  const [currentStep, setCurrentStep] = useState<SetupStep>('introduction');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());

  // セットアップデータ生成
  const handleGenerateSetup = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/mfa/setup/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, clinicId }),
      });

      if (!response.ok) {
        throw new Error('MFAセットアップの開始に失敗しました');
      }

      const data: SetupData = await response.json();
      setSetupData(data);
      setCurrentStep('configure');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // セットアップ完了
  const handleCompleteSetup = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('6桁の認証コードを入力してください');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/mfa/setup/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          token: verificationCode,
        }),
      });

      if (!response.ok) {
        throw new Error('認証コードの検証に失敗しました');
      }

      setCurrentStep('backup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // クリップボードにコピー
  const handleCopy = async (text: string, itemId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItems(prev => new Set([...prev, itemId]));

      // 3秒後にコピー状態をリセット
      setTimeout(() => {
        setCopiedItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(itemId);
          return newSet;
        });
      }, 3000);
    } catch (err) {
      console.error('コピーに失敗しました:', err);
    }
  };

  // バックアップコードをCSVでダウンロード
  const handleDownloadBackupCodes = () => {
    if (!setupData) return;

    const csvContent = [
      'バックアップコード,生成日時',
      ...setupData.backupCodes.map(
        code => `${code},${new Date().toLocaleString()}`
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `mfa_backup_codes_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // ステップコンテンツのレンダリング
  const renderStepContent = () => {
    switch (currentStep) {
      case 'introduction':
        return (
          <div className='space-y-6 text-center'>
            <div className='mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center'>
              <Shield className='w-8 h-8 text-blue-600' />
            </div>

            <div>
              <h3 className='text-xl font-semibold mb-2'>
                多要素認証（MFA）を設定
              </h3>
              <p className='text-gray-600 mb-4'>
                アカウントのセキュリティを強化するため、多要素認証を設定します。
              </p>
            </div>

            <div className='bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-left'>
              <div className='flex'>
                <AlertTriangle className='w-5 h-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0' />
                <div>
                  <h4 className='font-medium text-yellow-800 mb-1'>
                    設定前の準備
                  </h4>
                  <ul className='text-sm text-yellow-700 space-y-1'>
                    <li>• スマートフォンに認証アプリをインストール</li>
                    <li>
                      • 推奨: Google Authenticator、Authy、Microsoft
                      Authenticator
                    </li>
                    <li>• バックアップコードを安全な場所に保存</li>
                  </ul>
                </div>
              </div>
            </div>

            <Button
              onClick={() => setCurrentStep('generate')}
              className='w-full'
            >
              セットアップを開始
            </Button>
          </div>
        );

      case 'generate':
        return (
          <div className='space-y-6 text-center'>
            <div className='mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center'>
              <Key className='w-8 h-8 text-green-600' />
            </div>

            <div>
              <h3 className='text-xl font-semibold mb-2'>
                セットアップキーを生成
              </h3>
              <p className='text-gray-600'>
                セキュアな認証キーとQRコードを生成します。
              </p>
            </div>

            <Button
              onClick={handleGenerateSetup}
              disabled={loading}
              className='w-full'
            >
              {loading ? (
                <>
                  <RefreshCw className='w-4 h-4 mr-2 animate-spin' />
                  生成中...
                </>
              ) : (
                'セットアップキーを生成'
              )}
            </Button>

            {error && (
              <div className='bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm'>
                {error}
              </div>
            )}
          </div>
        );

      case 'configure':
        return (
          <div className='space-y-6'>
            <div className='text-center mb-6'>
              <h3 className='text-xl font-semibold mb-2'>認証アプリを設定</h3>
              <p className='text-gray-600'>
                以下の方法のいずれかで認証アプリに設定を追加してください。
              </p>
            </div>

            <Tabs defaultValue='qr' className='w-full'>
              <TabsList className='grid w-full grid-cols-2'>
                <TabsTrigger value='qr'>QRコード</TabsTrigger>
                <TabsTrigger value='manual'>手動入力</TabsTrigger>
              </TabsList>

              <TabsContent value='qr' className='space-y-4'>
                <div className='text-center'>
                  <div className='bg-white p-4 border rounded-lg inline-block'>
                    {setupData?.qrCodeUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={setupData.qrCodeUrl}
                        alt='MFA Setup QR Code'
                        className='w-48 h-48'
                      />
                    ) : (
                      <div className='w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center'>
                        <QrCode className='w-16 h-16 text-gray-400' />
                      </div>
                    )}
                  </div>
                  <p className='text-sm text-gray-600 mt-2'>
                    認証アプリでこのQRコードをスキャンしてください
                  </p>
                </div>
              </TabsContent>

              <TabsContent value='manual' className='space-y-4'>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    手動入力キー
                  </label>
                  <div className='flex items-center gap-2'>
                    <Input
                      value={setupData?.manualEntryKey || ''}
                      readOnly
                      className='font-mono text-sm'
                    />
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        handleCopy(
                          setupData?.manualEntryKey || '',
                          'manual-key'
                        )
                      }
                    >
                      {copiedItems.has('manual-key') ? (
                        <CheckCircle className='w-4 h-4 text-green-600' />
                      ) : (
                        <Copy className='w-4 h-4' />
                      )}
                    </Button>
                  </div>
                  <p className='text-sm text-gray-600 mt-2'>
                    認証アプリの「手動入力」または「キーを入力」からこのキーを入力してください
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <Button onClick={() => setCurrentStep('verify')} className='w-full'>
              認証アプリの設定完了
            </Button>
          </div>
        );

      case 'verify':
        return (
          <div className='space-y-6'>
            <div className='text-center'>
              <div className='mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4'>
                <Smartphone className='w-8 h-8 text-blue-600' />
              </div>

              <h3 className='text-xl font-semibold mb-2'>認証コードを入力</h3>
              <p className='text-gray-600'>
                認証アプリに表示される6桁のコードを入力してください。
              </p>
            </div>

            <div>
              <label className='block text-sm font-medium text-gray-700 mb-2'>
                認証コード
              </label>
              <Input
                type='text'
                value={verificationCode}
                onChange={e => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setVerificationCode(value);
                }}
                placeholder='000000'
                className='text-center text-2xl tracking-widest font-mono'
                maxLength={6}
              />
              <p className='text-sm text-gray-600 mt-1'>
                コードは30秒ごとに更新されます
              </p>
            </div>

            {error && (
              <div className='bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm'>
                {error}
              </div>
            )}

            <div className='flex gap-2'>
              <Button
                variant='outline'
                onClick={() => setCurrentStep('configure')}
                className='flex-1'
              >
                戻る
              </Button>
              <Button
                onClick={handleCompleteSetup}
                disabled={loading || verificationCode.length !== 6}
                className='flex-1'
              >
                {loading ? '検証中...' : '設定完了'}
              </Button>
            </div>
          </div>
        );

      case 'backup':
        return (
          <div className='space-y-6'>
            <div className='text-center'>
              <div className='mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4'>
                <Key className='w-8 h-8 text-orange-600' />
              </div>

              <h3 className='text-xl font-semibold mb-2'>
                バックアップコードを保存
              </h3>
              <p className='text-gray-600 mb-4'>
                認証アプリが使えない場合の緊急アクセス用コードです。
                安全な場所に保存してください。
              </p>
            </div>

            <div className='bg-yellow-50 border border-yellow-200 rounded-lg p-4'>
              <div className='flex items-start'>
                <AlertTriangle className='w-5 h-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0' />
                <div>
                  <h4 className='font-medium text-yellow-800 mb-1'>
                    重要な注意事項
                  </h4>
                  <ul className='text-sm text-yellow-700 space-y-1'>
                    <li>• 各コードは1回のみ使用可能です</li>
                    <li>
                      •
                      安全な場所（パスワードマネージャーなど）に保存してください
                    </li>
                    <li>
                      • コードを紛失した場合は管理者にお問い合わせください
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div>
              <div className='flex justify-between items-center mb-3'>
                <h4 className='font-medium'>バックアップコード</h4>
                <div className='flex gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setShowBackupCodes(!showBackupCodes)}
                  >
                    {showBackupCodes ? (
                      <>
                        <EyeOff className='w-4 h-4 mr-1' />
                        非表示
                      </>
                    ) : (
                      <>
                        <Eye className='w-4 h-4 mr-1' />
                        表示
                      </>
                    )}
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={handleDownloadBackupCodes}
                  >
                    <Download className='w-4 h-4 mr-1' />
                    ダウンロード
                  </Button>
                </div>
              </div>

              {showBackupCodes && (
                <div className='grid grid-cols-2 gap-2'>
                  {setupData?.backupCodes.map((code, index) => (
                    <div
                      key={index}
                      className='bg-gray-50 border rounded-lg p-3 flex justify-between items-center'
                    >
                      <span className='font-mono text-sm'>{code}</span>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => handleCopy(code, `backup-${index}`)}
                      >
                        {copiedItems.has(`backup-${index}`) ? (
                          <CheckCircle className='w-4 h-4 text-green-600' />
                        ) : (
                          <Copy className='w-4 h-4' />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              onClick={() => setCurrentStep('complete')}
              className='w-full'
            >
              バックアップコードを保存済み
            </Button>
          </div>
        );

      case 'complete':
        return (
          <div className='space-y-6 text-center'>
            <div className='mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center'>
              <CheckCircle className='w-8 h-8 text-green-600' />
            </div>

            <div>
              <h3 className='text-xl font-semibold mb-2'>
                MFAの設定が完了しました
              </h3>
              <p className='text-gray-600 mb-4'>
                アカウントのセキュリティが大幅に向上しました。
              </p>
            </div>

            <div className='bg-green-50 border border-green-200 rounded-lg p-4 text-left'>
              <h4 className='font-medium text-green-800 mb-2'>
                次回ログインより
              </h4>
              <ul className='text-sm text-green-700 space-y-1'>
                <li>• パスワード入力後、認証コードの入力が必要になります</li>
                <li>• 認証アプリまたはバックアップコードが利用できます</li>
                <li>• 設定は管理画面からいつでも変更できます</li>
              </ul>
            </div>

            <Button
              onClick={() => {
                onComplete();
                onClose();
              }}
              className='w-full'
            >
              完了
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  // プログレスインジケーター
  const getProgress = () => {
    const steps: SetupStep[] = [
      'introduction',
      'generate',
      'configure',
      'verify',
      'backup',
      'complete',
    ];
    const currentIndex = steps.indexOf(currentStep);
    return ((currentIndex + 1) / steps.length) * 100;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>多要素認証の設定</DialogTitle>

          {/* プログレスバー */}
          <div className='w-full bg-gray-200 rounded-full h-2'>
            <div
              className='bg-blue-600 h-2 rounded-full transition-all duration-300'
              style={{ width: `${getProgress()}%` }}
            />
          </div>
        </DialogHeader>

        <div className='py-4'>{renderStepContent()}</div>
      </DialogContent>
    </Dialog>
  );
};
