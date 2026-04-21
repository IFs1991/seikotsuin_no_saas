'use client';

import {
  useDeferredValue,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Settings,
  Building,
  CreditCard,
  Database,
  Calendar,
  MessageSquare,
  Stethoscope,
  Search,
  ChevronRight,
  LogOut,
} from 'lucide-react';

type SettingsCategoryId =
  | 'clinic'
  | 'services'
  | 'insurance'
  | 'booking'
  | 'communication'
  | 'system'
  | 'data';

type SettingsItemId =
  | 'clinic-basic'
  | 'clinic-hours'
  | 'clinic-facilities'
  | 'services-menu'
  | 'services-products'
  | 'services-packages'
  | 'insurance-types'
  | 'insurance-receipt'
  | 'insurance-billing'
  | 'booking-slots'
  | 'booking-online'
  | 'booking-display'
  | 'comm-email'
  | 'comm-announcement'
  | 'comm-survey'
  | 'system-general'
  | 'system-security'
  | 'system-backup'
  | 'data-import'
  | 'data-export'
  | 'data-master';

interface SettingsItemDefinition {
  id: SettingsItemId;
  title: string;
  description: string;
}

interface SettingsCategoryDefinition {
  id: SettingsCategoryId;
  title: string;
  icon: ReactNode;
  items: readonly SettingsItemDefinition[];
}

type SearchableSettingsItem = SettingsItemDefinition & {
  searchText: string;
};

type SearchableSettingsCategory = Omit<SettingsCategoryDefinition, 'items'> & {
  items: readonly SearchableSettingsItem[];
  searchText: string;
};

type SelectedSettingsItem = SearchableSettingsItem & {
  category: string;
  categoryId: SettingsCategoryId;
};

type SettingsComponent = ComponentType<Record<string, never>>;

const IMPLEMENTED_SETTINGS_ITEM_IDS = new Set<SettingsItemId>([
  'clinic-basic',
  'clinic-hours',
  'services-menu',
  'insurance-types',
  'booking-slots',
  'comm-email',
  'system-general',
  'system-security',
  'system-backup',
]);

const SETTINGS_CATEGORIES: readonly SettingsCategoryDefinition[] = [
  {
    id: 'clinic',
    title: '設定テンプレート',
    icon: <Building className='w-5 h-5' />,
    items: [
      {
        id: 'clinic-basic',
        title: '基本情報テンプレート',
        description: '子テナント作成時に使う院名・住所・連絡先などの初期値',
      },
      {
        id: 'clinic-hours',
        title: '診療時間・休診日テンプレート',
        description: '子テナント作成時に使う診療時間・休診日・受付時間の初期値',
      },
      {
        id: 'clinic-facilities',
        title: '設備・ベッドテンプレート',
        description: '子テナント作成時に使う施術ベッド数や設備構成の初期値',
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

const buildSearchText = (...values: readonly string[]) =>
  values.join(' ').toLowerCase();

const VISIBLE_SETTINGS_CATEGORIES: readonly SearchableSettingsCategory[] =
  SETTINGS_CATEGORIES.map(category => {
    const items = category.items
      .filter(item => IMPLEMENTED_SETTINGS_ITEM_IDS.has(item.id))
      .map(item => ({
        ...item,
        searchText: buildSearchText(item.title, item.description),
      }));

    return {
      ...category,
      items,
      searchText: buildSearchText(
        category.title,
        ...items.flatMap(item => [item.title, item.description])
      ),
    };
  }).filter(category => category.items.length > 0);

const SETTINGS_ITEMS_BY_ID = new Map<SettingsItemId, SelectedSettingsItem>(
  VISIBLE_SETTINGS_CATEGORIES.flatMap(category =>
    category.items.map(item => [
      item.id,
      {
        ...item,
        category: category.title,
        categoryId: category.id,
      },
    ])
  )
);

function getSearchableCategories(
  searchQuery: string
): readonly SearchableSettingsCategory[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  if (!normalizedQuery) {
    return VISIBLE_SETTINGS_CATEGORIES;
  }

  return VISIBLE_SETTINGS_CATEGORIES.map(category => ({
    ...category,
    items: category.items.filter(item =>
      item.searchText.includes(normalizedQuery)
    ),
  })).filter(
    category =>
      category.searchText.includes(normalizedQuery) || category.items.length > 0
  );
}

function SettingsLoadingCard() {
  return (
    <Card className='p-6'>
      <div className='text-center py-12 text-gray-500'>設定を読み込み中...</div>
    </Card>
  );
}

const SystemSettingsComponent = dynamic(
  () =>
    import('@/components/admin/system-settings').then(m => m.SystemSettings),
  { loading: SettingsLoadingCard }
);

const SETTINGS_COMPONENTS: Partial<Record<SettingsItemId, SettingsComponent>> =
  {
    'clinic-basic': dynamic(
      () =>
        import('@/components/admin/clinic-basic-settings').then(
          m => m.ClinicBasicSettings
        ),
      { loading: SettingsLoadingCard }
    ),
    'clinic-hours': dynamic(
      () =>
        import('@/components/admin/clinic-hours-settings').then(
          m => m.ClinicHoursSettings
        ),
      { loading: SettingsLoadingCard }
    ),
    'services-menu': dynamic(
      () =>
        import('@/components/admin/services-pricing-settings').then(
          m => m.ServicesPricingSettings
        ),
      { loading: SettingsLoadingCard }
    ),
    'insurance-types': dynamic(
      () =>
        import('@/components/admin/insurance-billing-settings').then(
          m => m.InsuranceBillingSettings
        ),
      { loading: SettingsLoadingCard }
    ),
    'booking-slots': dynamic(
      () =>
        import('@/components/admin/booking-calendar-settings').then(
          m => m.BookingCalendarSettings
        ),
      { loading: SettingsLoadingCard }
    ),
    'comm-email': dynamic(
      () =>
        import('@/components/admin/communication-settings').then(
          m => m.CommunicationSettings
        ),
      { loading: SettingsLoadingCard }
    ),
    'system-general': SystemSettingsComponent,
    'system-security': SystemSettingsComponent,
    'system-backup': SystemSettingsComponent,
  };

export default function AdminSettings() {
  const [selectedCategory, setSelectedCategory] =
    useState<SettingsCategoryId>('clinic');
  const [selectedItem, setSelectedItem] =
    useState<SettingsItemId>('clinic-basic');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('adminAuth');
    localStorage.removeItem('adminUser');
    router.push('/admin/logout');
  };

  const searchableCategories = useMemo(
    () => getSearchableCategories(deferredSearchQuery),
    [deferredSearchQuery]
  );
  const currentItem = SETTINGS_ITEMS_BY_ID.get(selectedItem);
  const isTemplateItem = currentItem?.categoryId === 'clinic';
  const SelectedComponent = SETTINGS_COMPONENTS[selectedItem] ?? null;

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
          <nav className='space-y-1' data-testid='admin-settings-nav'>
            {searchableCategories.map(category => (
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
        <div className='p-8' data-testid='admin-settings-content'>
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
                {isTemplateItem && (
                  <Card className='mt-4 border-blue-200 bg-blue-50 p-4'>
                    <p className='text-sm font-semibold text-blue-950'>
                      店舗作成時の初期設定テンプレートです
                    </p>
                    <p className='mt-1 text-sm text-blue-900'>
                      子テナント作成時に初期設定として適用されます。作成後の店舗ごとの診療時間・連絡先・予約設定は、各店舗の院長または店舗管理者が調整できます。
                    </p>
                    <p className='mt-1 text-sm text-blue-900'>
                      この画面の変更は、既存店舗の設定を自動的に上書きしません。
                    </p>
                    <p className='mt-1 text-sm text-blue-900'>
                      スタッフ招待・勤務管理・店舗ごとの運用設定は、店舗単位の管理画面で扱います。
                    </p>
                  </Card>
                )}
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
                      パイロット版では提供しておりません
                    </h3>
                    <p className='text-gray-500 mb-4'>
                      今後のアップデートで追加予定です。
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
