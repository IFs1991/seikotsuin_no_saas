import { NextRequest } from 'next/server';
import {
  safeValidateTableData,
  SupportedTableName,
} from '@/lib/validation/table-schemas';
import { SUCCESS_MESSAGES } from '@/lib/constants';
import {
  processApiRequest,
  createErrorResponse,
  createSuccessResponse,
  logError,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';
import {
  getManageableTables,
  getTableConfig,
  isWritableTable,
} from '@/lib/table-metadata';
import type { SupabaseServerClient } from '@/lib/supabase';
import { HQ_ROLES } from '@/lib/constants/roles';
import type { TableConfig } from '@/types/admin';

// ================================================================
// データベーステーブル管理 API - 動的スキーマ版
// ================================================================
const DEFAULT_TABLE_PAGE_SIZE = 20;
const MAX_TABLE_PAGE_SIZE = 100;

type AdminTableRecord = Record<string, unknown> & { id?: string };

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveSortColumn(
  tableConfig: TableConfig,
  requestedSortBy: string | null
): string {
  if (
    requestedSortBy &&
    Object.prototype.hasOwnProperty.call(tableConfig.columns, requestedSortBy)
  ) {
    return requestedSortBy;
  }

  if (Object.prototype.hasOwnProperty.call(tableConfig.columns, 'created_at')) {
    return 'created_at';
  }

  return Object.keys(tableConfig.columns)[0] ?? 'id';
}

function getRecordId(record: unknown): string {
  if (record && typeof record === 'object' && 'id' in record) {
    const id = (record as AdminTableRecord).id;
    if (typeof id === 'string') {
      return id;
    }
  }

  return '';
}

// テーブル一覧取得エンドポイント (GET /api/admin/tables)
// @spec docs/stabilization/spec-auth-role-alignment-v0.1.md - HQ専用（Q1決定）
export async function GET(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: Array.from(HQ_ROLES),
      requireClinicMatch: false,
    });
    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, supabase } = processResult;
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get('table');

    // 特定テーブルのデータ取得
    if (tableName) {
      return await getTableData(tableName, searchParams, supabase, auth?.id);
    }

    // テーブル一覧取得
    return await getTablesConfig(auth?.id);
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/tables',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

// テーブル設定一覧を取得
async function getTablesConfig(userId?: string) {
  try {
    const tableNames = await getManageableTables();

    const tablesConfig = await Promise.all(
      tableNames.map(async tableName => {
        const config = await getTableConfig(tableName);
        return config
          ? {
              name: tableName,
              displayName: config.displayName || tableName,
              columns: Object.keys(config.columns).length,
            }
          : null;
      })
    );

    // nullを除外
    const validTables = tablesConfig.filter(Boolean);

    return createSuccessResponse({
      tables: validTables,
      total: validTables.length,
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/tables',
      method: 'GET',
      userId: userId || 'unknown',
    });
    return createErrorResponse('テーブル設定の取得に失敗しました', 500);
  }
}

// 特定テーブルのデータを取得
async function getTableData(
  tableName: string,
  searchParams: URLSearchParams,
  supabase: SupabaseServerClient,
  userId?: string
) {
  try {
    // テーブル設定を取得
    const tableConfig = await getTableConfig(tableName);
    if (!tableConfig) {
      return createErrorResponse('指定されたテーブルは管理対象外です', 404);
    }

    // クエリパラメータ
    const page = parsePositiveInt(searchParams.get('page'), 1);
    const requestedLimit = parsePositiveInt(
      searchParams.get('limit'),
      DEFAULT_TABLE_PAGE_SIZE
    );
    const limit = Math.min(requestedLimit, MAX_TABLE_PAGE_SIZE);
    const search = searchParams.get('search') || '';
    const sortBy = resolveSortColumn(tableConfig, searchParams.get('sort_by'));
    const sortOrder = searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc';

    const offset = (page - 1) * limit;

    // クエリ構築
    const supportedTableName = tableName as SupportedTableName;
    let query = supabase
      .from(supportedTableName)
      .select('*', { count: 'exact' });

    // 検索条件
    if (search) {
      // 名前フィールドがある場合は検索対象とする
      if (tableConfig.columns.name) {
        query = query.ilike('name', `%${search}%`);
      }
    }

    // ソート
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // ページネーション
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      logError(error, {
        endpoint: '/api/admin/tables',
        method: 'GET',
        userId: userId || 'unknown',
        params: { tableName, page, limit, search },
      });
      return createErrorResponse('データの取得に失敗しました', 500);
    }

    // 監査ログ記録
    await AuditLogger.logDataAccess(
      userId || '',
      '', // email は認証情報から取得済み
      tableName,
      '', // 一覧取得なので特定IDなし
      undefined // clinic_id
    );

    return createSuccessResponse({
      data: data || [],
      config: tableConfig,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/tables',
      method: 'GET',
      userId: userId || 'unknown',
      params: { tableName },
    });
    return createErrorResponse('データの取得に失敗しました', 500);
  }
}

// POST: 新規データ作成
// @spec docs/stabilization/spec-auth-role-alignment-v0.1.md - HQ専用（Q1決定）
export async function POST(request: NextRequest) {
  try {
    // 認証・認可・サニタイゼーション
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: Array.from(HQ_ROLES),
      requireClinicMatch: false,
    });
    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, body, supabase } = processResult;

    if (
      !body ||
      typeof body !== 'object' ||
      !('table_name' in body) ||
      !('data' in body)
    ) {
      return createErrorResponse('テーブル名とデータが必要です', 400);
    }

    const { table_name, data } = body as {
      table_name: string;
      data: Record<string, unknown>;
    };

    // テーブル設定を取得して検証
    const tableConfig = await getTableConfig(table_name);
    if (!tableConfig) {
      return createErrorResponse('指定されたテーブルは管理対象外です', 404);
    }

    // 書き込み可能テーブルかチェック (PR-08)
    if (!isWritableTable(table_name)) {
      return createErrorResponse(
        'このテーブルは読み取り専用です。専用のエンドポイントを使用してください',
        403
      );
    }

    // バリデーション
    const validationResult = safeValidateTableData(
      table_name as SupportedTableName,
      data
    );
    if (!validationResult.success) {
      return createErrorResponse(
        'バリデーションエラー',
        400,
        validationResult.error
      );
    }

    const supportedTableName = table_name as SupportedTableName;
    const insertRecord = validationResult.data as never;

    // データベースに挿入
    const { data: newRecord, error } = await supabase
      .from(supportedTableName)
      .insert([insertRecord])
      .select()
      .single();

    if (error) {
      logError(error, {
        endpoint: '/api/admin/tables',
        method: 'POST',
        userId: auth?.id || 'unknown',
        params: { table_name, data },
      });
      return createErrorResponse('データの作成に失敗しました', 500);
    }

    // 監査ログ記録
    await AuditLogger.logDataModify(
      auth?.id || '',
      auth?.email || '',
      table_name,
      getRecordId(newRecord),
      validationResult.data
    );

    return createSuccessResponse(newRecord, 201, SUCCESS_MESSAGES.CREATED);
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/tables',
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

// PUT: データ更新
// @spec docs/stabilization/spec-auth-role-alignment-v0.1.md - HQ専用（Q1決定）
export async function PUT(request: NextRequest) {
  try {
    // 認証・認可・サニタイゼーション
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: Array.from(HQ_ROLES),
      requireClinicMatch: false,
    });
    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, body, supabase } = processResult;

    if (
      !body ||
      typeof body !== 'object' ||
      !('table_name' in body) ||
      !('id' in body) ||
      !('data' in body)
    ) {
      return createErrorResponse('テーブル名、ID、データが必要です', 400);
    }

    const { table_name, id, data } = body as {
      table_name: string;
      id: string;
      data: Record<string, unknown>;
    };

    // テーブル設定を取得して検証
    const tableConfig = await getTableConfig(table_name);
    if (!tableConfig) {
      return createErrorResponse('指定されたテーブルは管理対象外です', 404);
    }

    // 書き込み可能テーブルかチェック (PR-08)
    if (!isWritableTable(table_name)) {
      return createErrorResponse(
        'このテーブルは読み取り専用です。専用のエンドポイントを使用してください',
        403
      );
    }

    // バリデーション（部分更新対応）
    const validationResult = safeValidateTableData(
      table_name as SupportedTableName,
      data
    );
    if (!validationResult.success) {
      return createErrorResponse(
        'バリデーションエラー',
        400,
        validationResult.error
      );
    }

    const supportedTableName = table_name as SupportedTableName;
    const updateRecord = validationResult.data as never;

    // データベースを更新
    const { data: updatedRecord, error } = await supabase
      .from(supportedTableName)
      .update(updateRecord)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logError(error, {
        endpoint: '/api/admin/tables',
        method: 'PUT',
        userId: auth?.id || 'unknown',
        params: { table_name, id, data },
      });
      return createErrorResponse('データの更新に失敗しました', 500);
    }

    // 監査ログ記録
    await AuditLogger.logDataModify(
      auth?.id || '',
      auth?.email || '',
      table_name,
      id,
      validationResult.data
    );

    return createSuccessResponse(updatedRecord, 200, SUCCESS_MESSAGES.UPDATED);
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/tables',
      method: 'PUT',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

// DELETE: 閉鎖MVPでは無効化 (PR-08)
// generic DELETE は blast radius が大きいため、個別エンドポイントで対応する
// @see docs/stabilization/plan-closed-mvp-refactoring-priority-v0.1.md (PR-08)
