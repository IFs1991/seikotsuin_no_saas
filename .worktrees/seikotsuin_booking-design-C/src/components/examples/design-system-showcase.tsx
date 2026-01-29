'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { MedicalBanner } from '@/components/ui/medical-banner';
import { MedicalIcon } from '@/components/ui/medical-icons';

// 更新されたデザインシステムの動作確認用コンポーネント
export const DesignSystemShowcase = () => {
  const [activeTab, setActiveTab] = useState('buttons');
  const [showBanner, setShowBanner] = useState(true);

  const tabs = [
    { id: 'buttons', label: 'ボタン' },
    { id: 'cards', label: 'カード' },
    { id: 'inputs', label: '入力フィールド' },
    { id: 'alerts', label: 'アラート・バナー' },
    { id: 'icons', label: 'アイコン' },
  ];

  return (
    <div className='p-6 space-y-8'>
      <PageHeader
        title='デザインシステムショーケース'
        description='Atlassian Design System準拠の医療特化UIコンポーネント'
        variant='medical'
        breadcrumb={[
          { label: 'ホーム', href: '/' },
          { label: 'デザインシステム' },
        ]}
        actions={<Button variant='medical-primary'>コンポーネント追加</Button>}
      />

      {/* 緊急バナーのデモ */}
      {showBanner && (
        <MedicalBanner
          type='emergency'
          title='デザインシステム更新完了'
          description='Atlassian Design System準拠の医療特化コンポーネントが利用可能になりました'
          actions={{
            primary: {
              label: '詳細を確認',
              onClick: () => console.log('詳細確認'),
            },
            secondary: {
              label: '後で確認',
              onClick: () => setShowBanner(false),
            },
          }}
          onDismiss={() => setShowBanner(false)}
        />
      )}

      {/* タブナビゲーション */}
      <div className='border-b border-gray-200'>
        <nav className='-mb-px flex space-x-8'>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-medical-blue-500 text-medical-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ボタンセクション */}
      {activeTab === 'buttons' && (
        <div className='space-y-6'>
          <h2 className='text-xl font-semibold'>ボタンバリアント</h2>

          <div className='space-y-4'>
            <h3 className='text-lg font-medium'>医療系バリアント</h3>
            <div className='flex flex-wrap gap-4'>
              <Button variant='medical-primary'>医療プライマリー</Button>
              <Button variant='medical-urgent' priority='urgent'>
                緊急対応
              </Button>
              <Button variant='medical-success'>成功</Button>
              <Button variant='medical-safety'>安全確認</Button>
              <Button variant='medical-caution'>注意</Button>
              <Button variant='medical-neutral'>ニュートラル</Button>
            </div>
          </div>

          <div className='space-y-4'>
            <h3 className='text-lg font-medium'>ロール別バリアント</h3>
            <div className='flex flex-wrap gap-4'>
              <Button variant='admin-primary' role='admin'>
                管理者プライマリー
              </Button>
              <Button variant='admin-secondary' role='admin'>
                管理者セカンダリー
              </Button>
              <Button variant='patient-primary' role='patient'>
                患者向けプライマリー
              </Button>
              <Button variant='patient-gentle' role='patient'>
                患者向け優しい
              </Button>
            </div>
          </div>

          <div className='space-y-4'>
            <h3 className='text-lg font-medium'>サイズ・優先度</h3>
            <div className='flex flex-wrap items-center gap-4'>
              <Button variant='medical-primary' size='sm'>
                小
              </Button>
              <Button variant='medical-primary' size='default'>
                標準
              </Button>
              <Button variant='medical-primary' size='lg'>
                大
              </Button>
              <Button variant='medical-primary' size='touch'>
                タッチ
              </Button>
              <Button variant='medical-primary' size='clinical'>
                診療用
              </Button>
              <Button
                variant='medical-urgent'
                size='emergency'
                priority='urgent'
              >
                緊急
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* カードセクション */}
      {activeTab === 'cards' && (
        <div className='space-y-6'>
          <h2 className='text-xl font-semibold'>カードバリアント</h2>

          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
            <Card variant='medical' interactive>
              <CardHeader>
                <CardTitle>医療カード</CardTitle>
                <CardDescription>標準的な医療情報カード</CardDescription>
              </CardHeader>
              <CardContent>医療関連の情報を表示</CardContent>
            </Card>

            <Card variant='emergency' priority='urgent'>
              <CardHeader>
                <CardTitle>緊急カード</CardTitle>
                <CardDescription>緊急時の情報表示</CardDescription>
              </CardHeader>
              <CardContent>緊急度の高い情報</CardContent>
            </Card>

            <Card variant='admin' elevation='high'>
              <CardHeader>
                <CardTitle>管理者カード</CardTitle>
                <CardDescription>管理者専用情報</CardDescription>
              </CardHeader>
              <CardContent>管理者向けデータ</CardContent>
            </Card>

            <Card variant='patient'>
              <CardHeader>
                <CardTitle>患者カード</CardTitle>
                <CardDescription>患者向け情報</CardDescription>
              </CardHeader>
              <CardContent>患者が見やすい表示</CardContent>
            </Card>

            <Card variant='clinical'>
              <CardHeader>
                <CardTitle>診療カード</CardTitle>
                <CardDescription>診療関連情報</CardDescription>
              </CardHeader>
              <CardContent>診療データの表示</CardContent>
            </Card>

            <Card variant='security' priority='high'>
              <CardHeader>
                <CardTitle>セキュリティカード</CardTitle>
                <CardDescription>セキュリティ関連情報</CardDescription>
              </CardHeader>
              <CardContent>セキュリティ状態</CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* 入力フィールドセクション */}
      {activeTab === 'inputs' && (
        <div className='space-y-6'>
          <h2 className='text-xl font-semibold'>入力フィールドバリアント</h2>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <div className='space-y-4'>
              <h3 className='text-lg font-medium'>医療系バリアント</h3>
              <div className='space-y-3'>
                <Input variant='medical' placeholder='医療情報入力' />
                <Input variant='patient' placeholder='患者情報入力' />
                <Input variant='admin' placeholder='管理者入力' />
                <Input variant='clinical' placeholder='診療記録入力' />
                <Input variant='emergency' placeholder='緊急時入力' medical />
                <Input variant='search' placeholder='検索...' />
              </div>
            </div>

            <div className='space-y-4'>
              <h3 className='text-lg font-medium'>状態・サイズ</h3>
              <div className='space-y-3'>
                <Input
                  variant='medical'
                  state='default'
                  placeholder='通常状態'
                />
                <Input
                  variant='medical'
                  state='success'
                  placeholder='成功状態'
                />
                <Input
                  variant='medical'
                  state='warning'
                  placeholder='警告状態'
                />
                <Input
                  variant='medical'
                  state='error'
                  placeholder='エラー状態'
                />
                <Input
                  variant='medical'
                  inputSize='sm'
                  placeholder='小サイズ'
                />
                <Input
                  variant='medical'
                  inputSize='lg'
                  placeholder='大サイズ'
                />
                <Input
                  variant='medical'
                  inputSize='touch'
                  placeholder='タッチサイズ'
                />
                <Input
                  variant='medical'
                  inputSize='clinical'
                  placeholder='診療サイズ'
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* アラート・バナーセクション */}
      {activeTab === 'alerts' && (
        <div className='space-y-6'>
          <h2 className='text-xl font-semibold'>アラート・バナー</h2>

          <div className='space-y-4'>
            <h3 className='text-lg font-medium'>医療アラート</h3>
            <div className='space-y-3'>
              <Alert variant='medical-info' dismissible>
                <AlertTitle>医療情報</AlertTitle>
                <AlertDescription>
                  医療関連の情報をお知らせします。
                </AlertDescription>
              </Alert>

              <Alert variant='medical-success'>
                <AlertTitle>処置完了</AlertTitle>
                <AlertDescription>
                  患者の処置が正常に完了しました。
                </AlertDescription>
              </Alert>

              <Alert variant='medical-warning' priority='medium'>
                <AlertTitle>注意事項</AlertTitle>
                <AlertDescription>
                  アレルギー情報を確認してください。
                </AlertDescription>
              </Alert>

              <Alert variant='medical-urgent' priority='urgent'>
                <AlertTitle>緊急アラート</AlertTitle>
                <AlertDescription>即座の対応が必要です。</AlertDescription>
              </Alert>
            </div>

            <h3 className='text-lg font-medium'>セキュリティ・システム</h3>
            <div className='space-y-3'>
              <Alert variant='security-warning' priority='high'>
                <AlertTitle>セキュリティ警告</AlertTitle>
                <AlertDescription>
                  不正なアクセス試行を検出しました。
                </AlertDescription>
              </Alert>

              <Alert variant='admin-info'>
                <AlertTitle>管理者情報</AlertTitle>
                <AlertDescription>
                  システム設定が更新されました。
                </AlertDescription>
              </Alert>

              <Alert variant='system-maintenance'>
                <AlertTitle>メンテナンス通知</AlertTitle>
                <AlertDescription>
                  定期メンテナンスを実施します。
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </div>
      )}

      {/* アイコンセクション */}
      {activeTab === 'icons' && (
        <div className='space-y-6'>
          <h2 className='text-xl font-semibold'>医療アイコンシステム</h2>

          <div className='space-y-6'>
            <div>
              <h3 className='text-lg font-medium mb-3'>医療・健康アイコン</h3>
              <div className='flex flex-wrap items-center gap-6'>
                <div className='flex items-center space-x-2'>
                  <MedicalIcon
                    name='medical-heart'
                    variant='medical'
                    size='lg'
                  />
                  <span>心拍</span>
                </div>
                <div className='flex items-center space-x-2'>
                  <MedicalIcon
                    name='medical-activity'
                    variant='medical'
                    size='lg'
                  />
                  <span>活動</span>
                </div>
                <div className='flex items-center space-x-2'>
                  <MedicalIcon
                    name='medical-temperature'
                    variant='warning'
                    size='lg'
                  />
                  <span>体温</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className='text-lg font-medium mb-3'>状態アイコン</h3>
              <div className='flex flex-wrap items-center gap-6'>
                <div className='flex items-center space-x-2'>
                  <MedicalIcon
                    name='status-emergency'
                    variant='emergency'
                    priority='urgent'
                    size='lg'
                  />
                  <span>緊急</span>
                </div>
                <div className='flex items-center space-x-2'>
                  <MedicalIcon
                    name='status-warning'
                    variant='warning'
                    size='lg'
                  />
                  <span>警告</span>
                </div>
                <div className='flex items-center space-x-2'>
                  <MedicalIcon
                    name='status-success'
                    variant='success'
                    size='lg'
                  />
                  <span>成功</span>
                </div>
                <div className='flex items-center space-x-2'>
                  <MedicalIcon name='status-info' variant='medical' size='lg' />
                  <span>情報</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className='text-lg font-medium mb-3'>セキュリティアイコン</h3>
              <div className='flex flex-wrap items-center gap-6'>
                <div className='flex items-center space-x-2'>
                  <MedicalIcon
                    name='security-shield'
                    variant='admin'
                    size='lg'
                  />
                  <span>保護</span>
                </div>
                <div className='flex items-center space-x-2'>
                  <MedicalIcon
                    name='security-locked'
                    variant='admin'
                    size='lg'
                  />
                  <span>ロック</span>
                </div>
                <div className='flex items-center space-x-2'>
                  <MedicalIcon
                    name='user-approved'
                    variant='success'
                    size='lg'
                  />
                  <span>承認</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
