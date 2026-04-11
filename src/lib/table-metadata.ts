// =================================================================
// テーブルメタデータ管理 - 静的スキーマ定義版
// =================================================================
// F-03: 未定義RPC依存を排除し、現行スキーマ名で明示定義

import type { TableConfig } from '@/types/admin';

// テーブル設定キャッシュ
const tableConfigCache = new Map<string, CachedTableConfig>();
const CACHE_TTL = 5 * 60 * 1000; // 5分間キャッシュ

interface CachedTableConfig {
  config: TableConfig;
  timestamp: number;
}

/**
 * 管理対象テーブル一覧（現行スキーマ準拠）
 */
const MANAGEABLE_TABLES: string[] = [
  'menus',
  'menu_categories',
  'staff',
  'patients',
  'resources',
  'clinic_settings',
];

/**
 * 書き込み可能テーブル（閉鎖MVP向け blast-radius 縮小）
 *
 * patients, staff, clinic_settings は専用エンドポイントで管理するため
 * generic CRUD からは read-only とする。
 *
 * @see docs/stabilization/plan-closed-mvp-refactoring-priority-v0.1.md (PR-08)
 */
const WRITABLE_TABLES: string[] = ['menus', 'menu_categories', 'resources'];

/**
 * テーブルが書き込み可能かどうかを判定
 */
export function isWritableTable(tableName: string): boolean {
  return WRITABLE_TABLES.includes(tableName);
}

/**
 * 管理可能なテーブル一覧を取得（静的定義）
 */
export async function getManageableTables(): Promise<string[]> {
  return MANAGEABLE_TABLES;
}

/**
 * テーブル設定を静的に生成
 */
export async function getTableConfig(
  tableName: string
): Promise<TableConfig | null> {
  // 管理対象外のテーブルは拒否
  if (!MANAGEABLE_TABLES.includes(tableName)) {
    return null;
  }

  // キャッシュチェック
  const cached = tableConfigCache.get(tableName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.config;
  }

  const config = TABLE_CONFIGS[tableName];
  if (!config) {
    return null;
  }

  // キャッシュに保存
  tableConfigCache.set(tableName, {
    config,
    timestamp: Date.now(),
  });

  return config;
}

/**
 * テーブル設定の静的定義（現行スキーマ準拠）
 */
const TABLE_CONFIGS: Record<string, TableConfig> = {
  menus: {
    name: 'menus',
    displayName: '施術メニュー',
    columns: {
      id: { type: 'uuid', label: 'ID', required: true, readonly: true },
      clinic_id: {
        type: 'uuid',
        label: 'クリニックID',
        required: true,
        readonly: false,
      },
      category_id: {
        type: 'uuid',
        label: 'カテゴリID',
        required: false,
        readonly: false,
      },
      code: {
        type: 'string',
        label: 'コード',
        required: false,
        readonly: false,
        maxLength: 50,
      },
      name: {
        type: 'string',
        label: '名前',
        required: true,
        readonly: false,
        maxLength: 255,
      },
      description: {
        type: 'text',
        label: '説明',
        required: false,
        readonly: false,
      },
      price: {
        type: 'decimal',
        label: '料金',
        required: true,
        readonly: false,
      },
      duration_minutes: {
        type: 'integer',
        label: '所要時間（分）',
        required: true,
        readonly: false,
      },
      is_insurance_applicable: {
        type: 'boolean',
        label: '保険適用',
        required: false,
        readonly: false,
      },
      insurance_points: {
        type: 'integer',
        label: '保険点数',
        required: false,
        readonly: false,
      },
      display_order: {
        type: 'integer',
        label: '表示順',
        required: false,
        readonly: false,
      },
      is_active: {
        type: 'boolean',
        label: '有効',
        required: false,
        readonly: false,
      },
      created_at: {
        type: 'timestamp',
        label: '作成日時',
        required: false,
        readonly: true,
      },
      updated_at: {
        type: 'timestamp',
        label: '更新日時',
        required: false,
        readonly: true,
      },
    },
  },
  menu_categories: {
    name: 'menu_categories',
    displayName: 'メニューカテゴリ',
    columns: {
      id: { type: 'uuid', label: 'ID', required: true, readonly: true },
      name: {
        type: 'string',
        label: '名前',
        required: true,
        readonly: false,
        maxLength: 255,
      },
      description: {
        type: 'text',
        label: '説明',
        required: false,
        readonly: false,
      },
      color_code: {
        type: 'string',
        label: 'カラーコード',
        required: false,
        readonly: false,
        maxLength: 7,
      },
      icon_name: {
        type: 'string',
        label: 'アイコン名',
        required: false,
        readonly: false,
        maxLength: 50,
      },
      display_order: {
        type: 'integer',
        label: '表示順',
        required: false,
        readonly: false,
      },
      is_active: {
        type: 'boolean',
        label: '有効',
        required: false,
        readonly: false,
      },
      created_at: {
        type: 'timestamp',
        label: '作成日時',
        required: false,
        readonly: true,
      },
      updated_at: {
        type: 'timestamp',
        label: '更新日時',
        required: false,
        readonly: true,
      },
    },
  },
  staff: {
    name: 'staff',
    displayName: 'スタッフ',
    columns: {
      id: { type: 'uuid', label: 'ID', required: true, readonly: true },
      clinic_id: {
        type: 'uuid',
        label: 'クリニックID',
        required: true,
        readonly: false,
      },
      name: {
        type: 'string',
        label: '氏名',
        required: true,
        readonly: false,
        maxLength: 255,
      },
      email: {
        type: 'string',
        label: 'メールアドレス',
        required: true,
        readonly: false,
        maxLength: 255,
      },
      role: {
        type: 'string',
        label: '役割',
        required: true,
        readonly: false,
        maxLength: 50,
      },
      is_therapist: {
        type: 'boolean',
        label: '施術者フラグ',
        required: false,
        readonly: false,
      },
      hire_date: {
        type: 'timestamp',
        label: '入社日',
        required: false,
        readonly: false,
      },
      created_at: {
        type: 'timestamp',
        label: '作成日時',
        required: false,
        readonly: true,
      },
      updated_at: {
        type: 'timestamp',
        label: '更新日時',
        required: false,
        readonly: true,
      },
    },
  },
  patients: {
    name: 'patients',
    displayName: '患者情報',
    columns: {
      id: { type: 'uuid', label: 'ID', required: true, readonly: true },
      clinic_id: {
        type: 'uuid',
        label: 'クリニックID',
        required: true,
        readonly: false,
      },
      name: {
        type: 'string',
        label: '氏名',
        required: true,
        readonly: false,
        maxLength: 255,
      },
      phone_number: {
        type: 'string',
        label: '電話番号',
        required: false,
        readonly: false,
        maxLength: 20,
      },
      date_of_birth: {
        type: 'timestamp',
        label: '生年月日',
        required: false,
        readonly: false,
      },
      gender: {
        type: 'string',
        label: '性別',
        required: false,
        readonly: false,
        maxLength: 10,
      },
      address: {
        type: 'text',
        label: '住所',
        required: false,
        readonly: false,
      },
      registration_date: {
        type: 'string',
        label: '登録日',
        required: false,
        readonly: false,
      },
      last_visit_date: {
        type: 'string',
        label: '最終来院日',
        required: false,
        readonly: false,
      },
      created_at: {
        type: 'timestamp',
        label: '作成日時',
        required: false,
        readonly: true,
      },
      updated_at: {
        type: 'timestamp',
        label: '更新日時',
        required: false,
        readonly: true,
      },
    },
  },
  resources: {
    name: 'resources',
    displayName: 'リソース',
    columns: {
      id: { type: 'uuid', label: 'ID', required: true, readonly: true },
      clinic_id: {
        type: 'uuid',
        label: 'クリニックID',
        required: true,
        readonly: false,
      },
      name: {
        type: 'string',
        label: '名前',
        required: true,
        readonly: false,
        maxLength: 255,
      },
      type: {
        type: 'string',
        label: '種別',
        required: true,
        readonly: false,
        maxLength: 50,
      },
      working_hours: {
        type: 'json',
        label: '営業時間',
        required: false,
        readonly: false,
      },
      supported_menus: {
        type: 'json',
        label: '対応メニュー',
        required: false,
        readonly: false,
      },
      max_concurrent: {
        type: 'integer',
        label: '同時対応数',
        required: false,
        readonly: false,
      },
      is_bookable: {
        type: 'boolean',
        label: '予約可能',
        required: false,
        readonly: false,
      },
      is_active: {
        type: 'boolean',
        label: '有効',
        required: false,
        readonly: false,
      },
      created_at: {
        type: 'timestamp',
        label: '作成日時',
        required: false,
        readonly: true,
      },
      updated_at: {
        type: 'timestamp',
        label: '更新日時',
        required: false,
        readonly: true,
      },
    },
  },
  clinic_settings: {
    name: 'clinic_settings',
    displayName: 'クリニック設定',
    columns: {
      id: { type: 'uuid', label: 'ID', required: true, readonly: true },
      clinic_id: {
        type: 'uuid',
        label: 'クリニックID',
        required: true,
        readonly: false,
      },
      category: {
        type: 'string',
        label: 'カテゴリ',
        required: true,
        readonly: false,
        maxLength: 100,
      },
      settings: {
        type: 'json',
        label: '設定内容',
        required: false,
        readonly: false,
      },
      updated_by: {
        type: 'uuid',
        label: '更新者',
        required: false,
        readonly: true,
      },
      created_at: {
        type: 'timestamp',
        label: '作成日時',
        required: false,
        readonly: true,
      },
      updated_at: {
        type: 'timestamp',
        label: '更新日時',
        required: false,
        readonly: true,
      },
    },
  },
};

/**
 * キャッシュをクリア
 */
export function clearTableConfigCache(tableName?: string): void {
  if (tableName) {
    tableConfigCache.delete(tableName);
  } else {
    tableConfigCache.clear();
  }
}
