// =================================================================
// テーブルメタデータ管理 - 動的スキーマ取得
// =================================================================

import { createAdminClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { TableConfig, TableColumn } from '@/types/admin';

// テーブル設定キャッシュ
const tableConfigCache = new Map<string, CachedTableConfig>();
const CACHE_TTL = 5 * 60 * 1000; // 5分間キャッシュ

interface CachedTableConfig {
  config: TableConfig;
  timestamp: number;
}

/**
 * 管理可能なテーブル一覧を動的に取得
 * information_schemaから実際のDBスキーマを参照
 */
export async function getManageableTables(): Promise<string[]> {
  const supabase = createAdminClient();

  // public スキーマの中で管理対象となるテーブルを取得
  const { data, error } = await supabase.rpc('get_manageable_tables');

  if (error) {
    logger.error('管理可能テーブルの取得エラー:', error);
    // フォールバック: 基本的なテーブル一覧
    return [
      'treatment_menus',
      'menu_categories',
      'staff_members',
      'patient_profiles',
      'clinic_settings',
    ];
  }

  return data?.map((row: any) => row.table_name) || [];
}

/**
 * テーブル設定を動的に生成
 * PostgreSQLのinformation_schemaを参照してカラム情報を取得
 */
export async function getTableConfig(
  tableName: string
): Promise<TableConfig | null> {
  // キャッシュチェック
  const cached = tableConfigCache.get(tableName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.config;
  }

  const supabase = createAdminClient();

  try {
    // カラム情報を取得
    const { data: columns, error } = await supabase.rpc('get_table_columns', {
      table_name_param: tableName,
    });

    if (error) {
      logger.error(`テーブル設定取得エラー (${tableName}):`, error);
      return null;
    }

    if (!columns || columns.length === 0) {
      logger.warn(`テーブル ${tableName} のカラム情報が見つかりません`);
      return null;
    }

    // TableConfigを構築
    const config: TableConfig = {
      name: tableName,
      displayName: generateDisplayName(tableName),
      columns: {},
    };

    columns.forEach((col: any) => {
      const columnConfig: TableColumn = {
        type: mapPostgreSQLTypeToTableColumnType(col.data_type),
        label: generateColumnLabel(col.column_name),
        required: !col.is_nullable,
        readonly: isReadOnlyColumn(col.column_name),
      };

      // 型に応じた追加設定
      if (col.character_maximum_length) {
        columnConfig.maxLength = col.character_maximum_length;
      }

      if (col.numeric_precision) {
        columnConfig.precision = col.numeric_precision;
      }

      // 外部キー情報があれば設定
      if (col.foreign_table) {
        columnConfig.foreign_key = col.foreign_table;
      }

      config.columns[col.column_name] = columnConfig;
    });

    // キャッシュに保存
    tableConfigCache.set(tableName, {
      config,
      timestamp: Date.now(),
    });

    return config;
  } catch (error) {
    logger.error(`テーブル設定取得中のエラー (${tableName}):`, error);
    return null;
  }
}

/**
 * PostgreSQLのデータ型をTableColumnTypeにマッピング
 */
function mapPostgreSQLTypeToTableColumnType(
  pgType: string
): TableColumn['type'] {
  const typeMapping: Record<string, TableColumn['type']> = {
    'character varying': 'string',
    varchar: 'string',
    text: 'text',
    char: 'string',
    integer: 'integer',
    bigint: 'integer',
    smallint: 'integer',
    decimal: 'decimal',
    numeric: 'decimal',
    real: 'decimal',
    'double precision': 'decimal',
    boolean: 'boolean',
    'timestamp with time zone': 'timestamp',
    'timestamp without time zone': 'timestamp',
    date: 'timestamp',
    uuid: 'uuid',
    json: 'json',
    jsonb: 'json',
  };

  return typeMapping[pgType.toLowerCase()] || 'string';
}

/**
 * テーブル名から表示名を生成
 */
function generateDisplayName(tableName: string): string {
  const displayNames: Record<string, string> = {
    treatment_menus: '施術メニュー',
    menu_categories: 'メニューカテゴリ',
    staff_members: 'スタッフ',
    patient_profiles: '患者情報',
    clinic_settings: 'クリニック設定',
    appointment_slots: '予約枠',
    medical_records: '診療記録',
    payment_records: '支払い記録',
    insurance_claims: '保険請求',
  };

  return displayNames[tableName] || tableName;
}

/**
 * カラム名から表示ラベルを生成
 */
function generateColumnLabel(columnName: string): string {
  const labelMapping: Record<string, string> = {
    id: 'ID',
    name: '名前',
    email: 'メールアドレス',
    phone: '電話番号',
    address: '住所',
    description: '説明',
    price: '料金',
    duration_minutes: '所要時間（分）',
    is_active: '有効',
    created_at: '作成日時',
    updated_at: '更新日時',
    clinic_id: 'クリニックID',
    category_id: 'カテゴリID',
    display_order: '表示順',
    is_insurance_applicable: '保険適用',
    insurance_points: '保険点数',
  };

  return labelMapping[columnName] || columnName.replace(/_/g, ' ');
}

/**
 * 読み取り専用カラムかどうかを判定
 */
function isReadOnlyColumn(columnName: string): boolean {
  const readOnlyColumns = [
    'id',
    'created_at',
    'updated_at',
    'created_by',
    'updated_by',
  ];

  return readOnlyColumns.includes(columnName);
}

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
