'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Settings,
  Users,
  Building,
  CreditCard,
  Database,
  Calendar,
  MessageSquare,
  Stethoscope,
  Banknote,
  Search,
  ChevronRight,
  LogOut,
} from 'lucide-react';

interface SettingsItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: string;
}

const settingsCategories = [
  {
    id: 'clinic',
    title: '店舗管理',
    icon: <Building className='w-5 h-5' />,
    items: [
      {
        id: 'clinic-basic',
        title: '基本情報',
        description: '院名、住所、電話番号、ロゴ画像の設定',
      },
      {
        id: 'clinic-hours',
        title: '診療時間・休診日',
        description: '曜日ごとの診療時間、祝日や臨時休診日の設定',
      },
      {
        id: 'clinic-facilities',
        title: '設備・ベッド管理',
        description: '施術ベッドの数や種類の設定',
      },
    ],
  },
  {
    id: 'staff',
    title: 'スタッフ管理',
    icon: <Users className='w-5 h-5' />,
    items: [
      {
        id: 'staff-list',
        title: 'スタッフ一覧・招待',
        description: 'スタッフの追加、編集、削除、招待',
      },
      {
        id: 'staff-roles',
        title: 'ロール・権限',
        description: '院長、施術スタッフ、受付などの役割と権限設定',
      },
      {
        id: 'staff-schedule',
        title: 'シフト管理',
        description: 'スタッフの勤務スケジュールと休暇管理',
      },
    ],
  },
  {
    id: 'services',
    title: 'サービス・料金',
    icon: <Stethoscope className='w-5 h-5' />,
    items: [
      {
        id: 'services-menu',
        title: '施術メニュー',
        description: '自費・保険適用の施術メニュー、所要時間、料金の設定',
      },
      {
        id: 'services-products',
        title: '物販商品',
        description: 'サポーターや健康食品などの在庫・料金管理',
      },
      {
        id: 'services-packages',
        title: '回数券・プリペイド',
        description: '回数券やプリペイドカードの作成・管理',
      },
    ],
  },
  {
    id: 'insurance',
    title: '保険・請求',
    icon: <CreditCard className='w-5 h-5' />,
    items: [
      {
        id: 'insurance-types',
        title: '取扱保険',
        description: '対応している保険種別（社保、国保、労災など）の有効化',
      },
      {
        id: 'insurance-receipt',
        title: 'レセプト設定',
        description: 'レセプト発行に関する院の情報設定',
      },
      {
        id: 'insurance-billing',
        title: '請求・入金管理',
        description: '請求処理と入金確認の設定',
      },
    ],
  },
  {
    id: 'booking',
    title: '予約・カレンダー',
    icon: <Calendar className='w-5 h-5' />,
    items: [
      {
        id: 'booking-slots',
        title: '予約枠設定',
        description: '予約可能な時間単位、同時予約数の上限設定',
      },
      {
        id: 'booking-online',
        title: 'オンライン予約',
        description: '患者向け予約ページの公開・非公開、設定',
      },
      {
        id: 'booking-display',
        title: '表示設定',
        description: 'カレンダーの週の開始曜日、デフォルト表示の設定',
      },
    ],
  },
  {
    id: 'communication',
    title: '患者コミュニケーション',
    icon: <MessageSquare className='w-5 h-5' />,
    items: [
      {
        id: 'comm-email',
        title: '自動通知メール',
        description:
          '予約完了時、予約前日のリマインダーメールの文面テンプレート設定',
      },
      {
        id: 'comm-announcement',
        title: 'お知らせ',
        description: '患者向けのお知らせ（LINE連携など）の設定',
      },
      {
        id: 'comm-survey',
        title: '満足度調査',
        description: '治療後の満足度調査の設定と管理',
      },
    ],
  },
  {
    id: 'system',
    title: 'システム設定',
    icon: <Settings className='w-5 h-5' />,
    items: [
      {
        id: 'system-general',
        title: '基本設定',
        description: 'システム全体の基本的な設定項目',
      },
      {
        id: 'system-security',
        title: 'セキュリティ',
        description: 'パスワードポリシー、二要素認証の設定',
      },
      {
        id: 'system-backup',
        title: 'バックアップ',
        description: 'データのバックアップとリストア設定',
      },
    ],
  },
  {
    id: 'data',
    title: 'データ管理',
    icon: <Database className='w-5 h-5' />,
    items: [
      {
        id: 'data-import',
        title: 'データインポート',
        description: '外部システムからのデータ取り込み',
      },
      {
        id: 'data-export',
        title: 'データエクスポート',
        description: 'レポート出力とデータのエクスポート',
      },
      {
        id: 'data-master',
        title: 'マスターデータ',
        description: '共通の傷病名、保険種別などのマスターデータ管理',
      },
    ],
  },
];

export default function AdminSettings() {
  const [selectedCategory, setSelectedCategory] = useState('clinic');
  const [selectedItem, setSelectedItem] = useState('clinic-basic');
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  useEffect(() => {
    // 認証チェック
    const isAuthenticated = localStorage.getItem('adminAuth') === 'true';
    if (!isAuthenticated) {
      router.push('/admin/login');
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('adminAuth');
    localStorage.removeItem('adminUser');
    router.push('/admin/login');
  };

  const filteredCategories = settingsCategories.filter(
    category =>
      category.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      category.items.some(
        item =>
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  const currentItem = settingsCategories
    .flatMap(cat => cat.items.map(item => ({ ...item, category: cat.title })))
    .find(item => item.id === selectedItem);

  // ローディング表示
  const LoadingCard = () => (
    <Card className='p-6'>
      <div className='text-center py-12 text-gray-500'>読み込み中...</div>
    </Card>
  );

  // 動的インポート用のコンポーネントマップ（Next.js dynamicで統一）
  const componentMap: { [key: string]: React.ComponentType | null } = {
    'clinic-basic': dynamic(
      () =>
        import('@/components/admin/clinic-basic-settings').then(
          m => m.ClinicBasicSettings
        ),
      { loading: () => <LoadingCard /> }
    ),
    'clinic-hours': dynamic(
      () =>
        import('@/components/admin/clinic-hours-settings').then(
          m => m.ClinicHoursSettings
        ),
      { loading: () => <LoadingCard /> }
    ),
    'staff-list': dynamic(
      () =>
        import('@/components/admin/staff-management-settings').then(
          m => m.StaffManagementSettings
        ),
      { loading: () => <LoadingCard /> }
    ),
    'services-menu': dynamic(
      () =>
        import('@/components/admin/services-pricing-settings').then(
          m => m.ServicesPricingSettings
        ),
      { loading: () => <LoadingCard /> }
    ),
    'insurance-types': dynamic(
      () =>
        import('@/components/admin/insurance-billing-settings').then(
          m => m.InsuranceBillingSettings
        ),
      { loading: () => <LoadingCard /> }
    ),
    'booking-slots': dynamic(
      () =>
        import('@/components/admin/booking-calendar-settings').then(
          m => m.BookingCalendarSettings
        ),
      { loading: () => <LoadingCard /> }
    ),
    'comm-email': dynamic(
      () =>
        import('@/components/admin/communication-settings').then(
          m => m.CommunicationSettings
        ),
      { loading: () => <LoadingCard /> }
    ),
    'system-general': dynamic(
      () =>
        import('@/components/admin/system-settings').then(
          m => m.SystemSettings
        ),
      { loading: () => <LoadingCard /> }
    ),
    'data-import': dynamic(
      () =>
        import('@/components/admin/data-management-settings').then(
          m => m.DataManagementSettings
        ),
      { loading: () => <LoadingCard /> }
    ),
  };

  const SelectedComponent = componentMap[selectedItem] || null;

  return (
    <div className='min-h-screen bg-gray-50 flex'>
      {/* 左サイドバー */}
      <div className='w-80 bg-white border-r border-gray-200 flex flex-col'>
        {/* ヘッダー */}
        <div className='p-6 border-b border-gray-200'>
          <div className='flex items-center space-x-3 mb-4'>
            <div className='w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center'>
              <span className='text-white font-bold'>骨</span>
            </div>
            <div>
              <h1 className='text-lg font-semibold text-gray-900'>
                システム設定
              </h1>
              <p className='text-sm text-gray-500'>管理者: admin</p>
            </div>
          </div>

          {/* 検索バー */}
          <div className='relative'>
            <Search className='w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400' />
            <Input
              type='text'
              placeholder='設定項目を検索...'
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className='pl-10'
            />
          </div>
        </div>

        {/* ナビゲーション */}
        <div className='flex-1 overflow-y-auto p-4'>
          <nav className='space-y-1'>
            {filteredCategories.map(category => (
              <div key={category.id}>
                <button
                  onClick={() => setSelectedCategory(category.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                    selectedCategory === category.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className='flex items-center space-x-3'>
                    {category.icon}
                    <span className='font-medium'>{category.title}</span>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${
                      selectedCategory === category.id ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {selectedCategory === category.id && (
                  <div className='ml-8 mt-1 space-y-1'>
                    {category.items.map(item => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedItem(item.id)}
                        className={`w-full text-left p-2 rounded text-sm transition-colors ${
                          selectedItem === item.id
                            ? 'bg-blue-100 text-blue-800'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* ログアウトボタン */}
        <div className='p-4 border-t border-gray-200'>
          <Button
            onClick={handleLogout}
            variant='outline'
            className='w-full flex items-center space-x-2'
          >
            <LogOut className='w-4 h-4' />
            <span>ログアウト</span>
          </Button>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className='flex-1 overflow-y-auto'>
        <div className='p-8'>
          {currentItem ? (
            <div>
              <div className='mb-8'>
                <div className='flex items-center text-sm text-gray-500 mb-2'>
                  <span>{currentItem.category}</span>
                  <ChevronRight className='w-4 h-4 mx-2' />
                  <span>{currentItem.title}</span>
                </div>
                <h1 className='text-3xl font-bold text-gray-900 mb-2'>
                  {currentItem.title}
                </h1>
                <p className='text-gray-600'>{currentItem.description}</p>
              </div>

              {SelectedComponent ? (
                <SelectedComponent />
              ) : (
                <Card className='p-6'>
                  <div className='text-center py-12'>
                    <div className='w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4'>
                      <Settings className='w-8 h-8 text-gray-400' />
                    </div>
                    <h3 className='text-lg font-medium text-gray-900 mb-2'>
                      設定画面を準備中
                    </h3>
                    <p className='text-gray-500 mb-4'>
                      「{currentItem.title}」の詳細設定画面を実装予定です。
                    </p>
                    <div className='space-y-2 text-sm text-gray-400 max-w-md mx-auto'>
                      <p>この画面では以下の機能を提供予定：</p>
                      <p>• {currentItem.description}</p>
                      <p>• フォームベースの設定変更</p>
                      <p>• リアルタイムの保存とバリデーション</p>
                      <p>• 変更履歴の管理</p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          ) : (
            <div className='text-center py-12'>
              <p className='text-gray-500'>設定項目を選択してください</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
