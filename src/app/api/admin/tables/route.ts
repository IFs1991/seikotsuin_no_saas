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
import { getManageableTables, getTableConfig } from '@/lib/table-metadata';
import type { SupabaseServerClient } from '@/lib/supabase';

// ================================================================
// データベーステーブル管理 API - 動的スキーマ版
// ================================================================
// テーブル一覧取得エンドポイント (GET /api/admin/tables)
export async function GET(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: ['admin', 'clinic_manager'],
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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortOrder = searchParams.get('sort_order') || 'desc';

    const offset = (page - 1) * limit;

    // クエリ構築
    let query = supabase.from(tableName).select('*', { count: 'exact' });

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
export async function POST(request: NextRequest) {
  try {
    // 認証・認可・サニタイゼーション
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: ['admin', 'clinic_manager'],
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

    // データベースに挿入
    const { data: newRecord, error } = await supabase
      .from(table_name)
      .insert([validationResult.data])
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
      newRecord.id,
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
export async function PUT(request: NextRequest) {
  try {
    // 認証・認可・サニタイゼーション
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: ['admin', 'clinic_manager'],
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

    // データベースを更新
    const { data: updatedRecord, error } = await supabase
      .from(table_name)
      .update(validationResult.data)
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

// DELETE: データ削除
export async function DELETE(request: NextRequest) {
  try {
    // 認証・認可チェック
    const processResult = await processApiRequest(request, {
      allowedRoles: ['admin', 'clinic_manager'],
      requireClinicMatch: false,
    });
    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, supabase } = processResult;
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get('table');
    const id = searchParams.get('id');

    if (!tableName || !id) {
      return createErrorResponse('テーブル名とIDが必要です', 400);
    }

    // テーブル設定を取得して検証
    const tableConfig = await getTableConfig(tableName);
    if (!tableConfig) {
      return createErrorResponse('指定されたテーブルは管理対象外です', 404);
    }

    // データベースから削除
    const { error } = await supabase.from(tableName).delete().eq('id', id);

    if (error) {
      logError(error, {
        endpoint: '/api/admin/tables',
        method: 'DELETE',
        userId: auth?.id || 'unknown',
        params: { tableName, id },
      });
      return createErrorResponse('データの削除に失敗しました', 500);
    }

    // 監査ログ記録
    await AuditLogger.logDataDelete(
      auth?.id || '',
      auth?.email || '',
      tableName,
      id
    );

    return createSuccessResponse(null, 200, SUCCESS_MESSAGES.DELETED);
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/tables',
      method: 'DELETE',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
