// API エンドポイント
export const API_ENDPOINTS = {
  ADMIN: {
    TABLES: '/api/admin/tables',
    MASTER_DATA: '/api/admin/master-data',
    MASTER_DATA_EXPORT: '/api/admin/master-data/export',
    MASTER_DATA_IMPORT: '/api/admin/master-data/import',
    MASTER_DATA_ROLLBACK: '/api/admin/master-data/rollback',
    TENANTS: '/api/admin/tenants',
    USERS: '/api/admin/users',
  },
} as const;

// ページサイズ設定
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

// エラーメッセージ
export const ERROR_MESSAGES = {
  UNAUTHORIZED: '権限がありません',
  INVALID_REQUEST: '無効なリクエストです',
  VALIDATION_ERROR: 'バリデーションエラー',
  SERVER_ERROR: 'サーバーエラーが発生しました',
  NETWORK_ERROR: 'ネットワークエラーが発生しました',
  NOT_FOUND: 'データが見つかりません',
} as const;

// 成功メッセージ
export const SUCCESS_MESSAGES = {
  CREATED: '正常に作成されました',
  UPDATED: '正常に更新されました',
  DELETED: '正常に削除されました',
} as const;

// バリデーション設定
export const VALIDATION_LIMITS = {
  STRING_MAX_LENGTH: 255,
  TEXT_MAX_LENGTH: 1000,
  NAME_MAX_LENGTH: 100,
  CODE_MAX_LENGTH: 50,
  DESCRIPTION_MAX_LENGTH: 500,
} as const;

// テーブル設定
export const TABLE_CONFIG = {
  MAX_DISPLAY_ROWS: 50,
  SEARCH_DEBOUNCE_MS: 300,
} as const;
