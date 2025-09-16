// =================================================================
// Error Handling Utilities - エラーハンドリングユーティリティ
// =================================================================

import { ApiError, ValidationError } from '../types/api';

/**
 * エラーコード定数
 */
export const ERROR_CODES = {
  // 共通エラー
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  
  // バリデーションエラー
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',
  INVALID_FORMAT: 'INVALID_FORMAT',
  INVALID_VALUE: 'INVALID_VALUE',
  
  // 認証・認可エラー
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  
  // リソースエラー
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  RESOURCE_EXPIRED: 'RESOURCE_EXPIRED',
  
  // データベースエラー
  DATABASE_CONNECTION_ERROR: 'DATABASE_CONNECTION_ERROR',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  UNIQUE_CONSTRAINT_VIOLATION: 'UNIQUE_CONSTRAINT_VIOLATION',
  
  // 外部サービスエラー
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  AI_SERVICE_ERROR: 'AI_SERVICE_ERROR',
  
  // ビジネスロジックエラー
  CLINIC_NOT_FOUND: 'CLINIC_NOT_FOUND',
  PATIENT_NOT_FOUND: 'PATIENT_NOT_FOUND',
  STAFF_NOT_FOUND: 'STAFF_NOT_FOUND',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  DUPLICATE_DAILY_REPORT: 'DUPLICATE_DAILY_REPORT',
} as const;

/**
 * エラーメッセージのマッピング
 */
const ERROR_MESSAGES: Record<string, string> = {
  [ERROR_CODES.UNKNOWN_ERROR]: '不明なエラーが発生しました',
  [ERROR_CODES.NETWORK_ERROR]: 'ネットワークエラーが発生しました',
  [ERROR_CODES.INTERNAL_SERVER_ERROR]: 'サーバー内部エラーが発生しました',
  
  [ERROR_CODES.VALIDATION_ERROR]: '入力値にエラーがあります',
  [ERROR_CODES.REQUIRED_FIELD_MISSING]: '必須フィールドが不足しています',
  [ERROR_CODES.INVALID_FORMAT]: '入力形式が正しくありません',
  [ERROR_CODES.INVALID_VALUE]: '無効な値です',
  
  [ERROR_CODES.UNAUTHORIZED]: '認証が必要です',
  [ERROR_CODES.FORBIDDEN]: 'アクセス権限がありません',
  [ERROR_CODES.INVALID_CREDENTIALS]: '認証情報が正しくありません',
  [ERROR_CODES.TOKEN_EXPIRED]: 'セッションが期限切れです',
  
  [ERROR_CODES.RESOURCE_NOT_FOUND]: 'リソースが見つかりません',
  [ERROR_CODES.RESOURCE_CONFLICT]: 'リソースの競合が発生しました',
  [ERROR_CODES.RESOURCE_EXPIRED]: 'リソースの有効期限が切れています',
  
  [ERROR_CODES.DATABASE_CONNECTION_ERROR]: 'データベース接続エラー',
  [ERROR_CODES.CONSTRAINT_VIOLATION]: 'データ制約違反',
  [ERROR_CODES.UNIQUE_CONSTRAINT_VIOLATION]: '重複するデータがあります',
  
  [ERROR_CODES.EXTERNAL_SERVICE_ERROR]: '外部サービスエラー',
  [ERROR_CODES.AI_SERVICE_ERROR]: 'AIサービスエラー',
  
  [ERROR_CODES.CLINIC_NOT_FOUND]: '店舗が見つかりません',
  [ERROR_CODES.PATIENT_NOT_FOUND]: '患者が見つかりません',
  [ERROR_CODES.STAFF_NOT_FOUND]: 'スタッフが見つかりません',
  [ERROR_CODES.INVALID_DATE_RANGE]: '日付範囲が無効です',
  [ERROR_CODES.DUPLICATE_DAILY_REPORT]: 'その日の日報は既に存在します',
};

/**
 * APIエラーを作成する
 */
export function createApiError(
  code: string,
  message?: string,
  details?: Record<string, unknown>,
  path?: string
): ApiError {
  const apiError: ApiError = {
    code,
    message: message || ERROR_MESSAGES[code] || ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
    timestamp: new Date().toISOString()
  };
  
  if (details !== undefined) apiError.details = details;
  if (path !== undefined) apiError.path = path;
  
  return apiError;
}

/**
 * バリデーションエラーを作成する
 */
export function createValidationError(
  field: string,
  message: string,
  value?: unknown
): ValidationError {
  return {
    field,
    message,
    code: ERROR_CODES.VALIDATION_ERROR,
    value,
  };
}

/**
 * HTTPステータスコードからエラーコードを取得する
 */
export function getErrorCodeFromStatus(status: number): string {
  switch (status) {
    case 400:
      return ERROR_CODES.VALIDATION_ERROR;
    case 401:
      return ERROR_CODES.UNAUTHORIZED;
    case 403:
      return ERROR_CODES.FORBIDDEN;
    case 404:
      return ERROR_CODES.RESOURCE_NOT_FOUND;
    case 409:
      return ERROR_CODES.RESOURCE_CONFLICT;
    case 500:
      return ERROR_CODES.INTERNAL_SERVER_ERROR;
    default:
      return ERROR_CODES.UNKNOWN_ERROR;
  }
}

/**
 * エラーオブジェクトからApiErrorを作成する
 */
export function normalizeError(error: unknown, path?: string): ApiError {
  if (error && typeof error === 'object') {
    // 既にApiErrorの場合
    if ('code' in error && 'message' in error) {
      return error as ApiError;
    }
    
    // Fetchエラーの場合
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return createApiError(ERROR_CODES.NETWORK_ERROR, error.message, { originalError: error.message }, path);
    }
    
    // 一般的なErrorオブジェクトの場合
    if (error instanceof Error) {
      return createApiError(ERROR_CODES.UNKNOWN_ERROR, error.message, { originalError: error.message }, path);
    }
    
    // オブジェクトに message プロパティがある場合
    if ('message' in error) {
      return createApiError(ERROR_CODES.UNKNOWN_ERROR, String(error.message), { originalError: error }, path);
    }
  }
  
  // その他の場合
  return createApiError(ERROR_CODES.UNKNOWN_ERROR, 'An unknown error occurred', { originalError: error }, path);
}

/**
 * Supabaseエラーを正規化する
 */
export function normalizeSupabaseError(error: any, path?: string): ApiError {
  if (!error) {
    return createApiError(ERROR_CODES.UNKNOWN_ERROR, 'Unknown database error', undefined, path);
  }
  
  // PostgreSQLエラーコードベースの処理
  if (error.code) {
    switch (error.code) {
      case '23505': // unique constraint violation
        return createApiError(
          ERROR_CODES.UNIQUE_CONSTRAINT_VIOLATION,
          'このデータは既に存在します',
          { postgresError: error },
          path
        );
      case '23503': // foreign key constraint violation
        return createApiError(
          ERROR_CODES.CONSTRAINT_VIOLATION,
          '関連するデータが見つかりません',
          { postgresError: error },
          path
        );
      case '23514': // check constraint violation
        return createApiError(
          ERROR_CODES.CONSTRAINT_VIOLATION,
          '入力値が制約に違反しています',
          { postgresError: error },
          path
        );
      case 'PGRST116': // No rows found
        return createApiError(
          ERROR_CODES.RESOURCE_NOT_FOUND,
          'データが見つかりません',
          { supabaseError: error },
          path
        );
    }
  }
  
  // メッセージベースの処理
  if (error.message) {
    if (error.message.includes('connection')) {
      return createApiError(
        ERROR_CODES.DATABASE_CONNECTION_ERROR,
        'データベースに接続できません',
        { supabaseError: error },
        path
      );
    }
    if (error.message.includes('permission')) {
      return createApiError(
        ERROR_CODES.FORBIDDEN,
        'データベースへのアクセス権限がありません',
        { supabaseError: error },
        path
      );
    }
  }
  
  return createApiError(
    ERROR_CODES.UNKNOWN_ERROR,
    error.message || 'データベースエラーが発生しました',
    { supabaseError: error },
    path
  );
}

/**
 * バリデーションエラーのコレクション
 */
export class ValidationErrorCollector {
  private errors: ValidationError[] = [];
  
  add(field: string, message: string, value?: unknown): this {
    this.errors.push(createValidationError(field, message, value));
    return this;
  }
  
  addIf(condition: boolean, field: string, message: string, value?: unknown): this {
    if (condition) {
      this.add(field, message, value);
    }
    return this;
  }
  
  hasErrors(): boolean {
    return this.errors.length > 0;
  }
  
  getErrors(): ValidationError[] {
    return this.errors;
  }
  
  getApiError(): ApiError {
    return createApiError(
      ERROR_CODES.VALIDATION_ERROR,
      'バリデーションエラーが発生しました',
      { validationErrors: this.errors }
    );
  }
  
  clear(): void {
    this.errors = [];
  }
}

/**
 * 共通バリデーション関数
 */
export const validation = {
  required: (value: unknown, field: string): ValidationError | null => {
    if (value === null || value === undefined || value === '') {
      return createValidationError(field, `${field}は必須です`);
    }
    return null;
  },
  
  email: (value: string, field: string): ValidationError | null => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (value && !emailRegex.test(value)) {
      return createValidationError(field, `${field}の形式が正しくありません`, value);
    }
    return null;
  },
  
  minLength: (value: string, minLength: number, field: string): ValidationError | null => {
    if (value && value.length < minLength) {
      return createValidationError(field, `${field}は${minLength}文字以上で入力してください`, value);
    }
    return null;
  },
  
  maxLength: (value: string, maxLength: number, field: string): ValidationError | null => {
    if (value && value.length > maxLength) {
      return createValidationError(field, `${field}は${maxLength}文字以下で入力してください`, value);
    }
    return null;
  },
  
  numeric: (value: unknown, field: string): ValidationError | null => {
    if (value !== null && value !== undefined && isNaN(Number(value))) {
      return createValidationError(field, `${field}は数値で入力してください`, value);
    }
    return null;
  },
  
  positiveNumber: (value: number, field: string): ValidationError | null => {
    if (value !== null && value !== undefined && value < 0) {
      return createValidationError(field, `${field}は0以上で入力してください`, value);
    }
    return null;
  },
  
  dateFormat: (value: string, field: string): ValidationError | null => {
    if (value && isNaN(Date.parse(value))) {
      return createValidationError(field, `${field}の日付形式が正しくありません`, value);
    }
    return null;
  },
  
  uuid: (value: string, field: string): ValidationError | null => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (value && !uuidRegex.test(value)) {
      return createValidationError(field, `${field}のUUID形式が正しくありません`, value);
    }
    return null;
  },
};

/**
 * カスタムエラークラス
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  public readonly statusCode: number;
  
  constructor(code: string, message?: string, statusCode = 500, details?: Record<string, unknown>) {
    super(message || ERROR_MESSAGES[code] || ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR]);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    
    // detailsは値がある場合のみ設定
    if (details !== undefined) {
      this.details = details;
    }
    
    // TypeScriptでのError継承の問題を解決
    Object.setPrototypeOf(this, AppError.prototype);
  }
  
  toApiError(path?: string): ApiError {
    return createApiError(this.code, this.message, this.details, path);
  }
}

/**
 * エラーのログ出力
 */
export function logError(error: ApiError | AppError | Error, context?: Record<string, unknown>): void {
  const logData: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    error: {
      message: error.message,
      ...(error instanceof AppError ? { code: error.code, details: error.details } : {}),
      ...('code' in error && 'details' in error ? { code: error.code, details: error.details } : {}),
    },
    context,
  };
  
  // name プロパティが存在する場合のみ追加
  if ('name' in error && error.name) {
    (logData.error as Record<string, unknown>).name = error.name;
  }
  
  // stack プロパティが存在する場合のみ追加
  if ('stack' in error && error.stack) {
    (logData.error as Record<string, unknown>).stack = error.stack;
  }
  
  console.error('Application Error:', JSON.stringify(logData, null, 2));
}