import { NextRequest } from 'next/server';
import { supabase } from '@/api/database/supabase-client';
import { z } from 'zod';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '@/lib/constants';
import {
  processApiRequest,
  createErrorResponse,
  createSuccessResponse,
  logError,
} from '@/lib/api-helpers';
import { AuditLogger } from '@/lib/audit-logger';

// ================================================================
// マスターデータ管理 API - リファクタリング版
// ================================================================

// マスターデータ バリデーションスキーマ
const masterDataSchema = z.object({
  id: z.string().uuid().optional(),
  clinic_id: z.string().uuid().nullable().optional(),
  name: z
    .string()
    .min(1, '名前は必須です')
    .max(255, '名前は255文字以内で入力してください'),
  category: z
    .string()
    .min(1, 'カテゴリは必須です')
    .max(100, 'カテゴリは100文字以内で入力してください'),
  value: z.unknown(),
  data_type: z
    .enum(['string', 'number', 'boolean', 'json', 'array'], {
      errorMap: () => ({ message: '正しいデータ型を選択してください' }),
    })
    .default('string'),
  description: z
    .string()
    .max(500, '説明は500文字以内で入力してください')
    .optional(),
  is_editable: z.boolean().default(true),
  is_public: z.boolean().default(false),
  display_order: z.number().int().default(0),
  updated_by: z.string().uuid().optional(),
});

// Zodスキーマからの型推論（現在未使用だが将来的に使用予定）
// type MasterDataItem = z.infer<typeof masterDataSchema>;

// GET: マスターデータ一覧取得
export async function GET(request: NextRequest) {
  try {
    // 共通前処理（認証・認可チェック）
    const processResult = await processApiRequest(request, false);
    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth } = processResult;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const clinicId = searchParams.get('clinic_id');
    const isPublic = searchParams.get('is_public');

    let query = supabase
      .from('system_settings')
      .select('*')
      .order('category', { ascending: true })
      .order('display_order', { ascending: true });

    // フィルター条件を追加
    if (category) {
      query = query.ilike('key', `${category}%`);
    }

    if (clinicId === 'null' || clinicId === 'global') {
      query = query.is('clinic_id', null);
    } else if (clinicId) {
      query = query.eq('clinic_id', clinicId);
    }

    if (isPublic) {
      query = query.eq('is_public', isPublic === 'true');
    }

    const { data, error } = await query;

    if (error) {
      logError(error, {
        endpoint: '/api/admin/master-data',
        method: 'GET',
        userId: auth?.id || 'unknown',
        params: { category, clinicId, isPublic },
      });
      return createErrorResponse('データの取得に失敗しました', 500);
    }

    // データを整形してフロントエンド用の形式に変換
    const formattedData =
      data?.map(item => ({
        id: item.id,
        clinic_id: item.clinic_id,
        name: item.key,
        category: item.key.split('_')[0], // キーの最初の部分をカテゴリとして使用
        value: item.value,
        data_type: item.data_type || 'string',
        description: item.description,
        is_editable: item.is_editable,
        is_public: item.is_public,
        display_order: 0,
        updated_at: item.updated_at,
        updated_by: item.updated_by,
      })) || [];

    return createSuccessResponse({
      items: formattedData,
      total: formattedData.length,
    });
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/master-data',
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

// POST: マスターデータ新規作成
export async function POST(request: NextRequest) {
  try {
    // 共通前処理（認証・サニタイゼーション）
    const processResult = await processApiRequest(request, true);
    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, body } = processResult;

    // Zodバリデーション
    const validationResult = masterDataSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse(
        ERROR_MESSAGES.VALIDATION_ERROR,
        400,
        validationResult.error.errors
      );
    }

    const {
      clinic_id,
      name,
      value,
      data_type,
      description,
      is_editable,
      is_public,
    } = validationResult.data;

    // system_settingsテーブルに挿入
    const { data, error } = await supabase
      .from('system_settings')
      .insert([
        {
          clinic_id: clinic_id || null,
          key: name,
          value: JSON.stringify(value),
          data_type: data_type || 'string',
          description,
          is_editable: is_editable !== false,
          is_public: is_public === true,
          updated_by: auth?.id,
        },
      ])
      .select()
      .single();

    if (error) {
      logError(error, {
        endpoint: '/api/admin/master-data',
        method: 'POST',
        userId: auth?.id || 'unknown',
        params: { name },
      });
      return createErrorResponse('データの作成に失敗しました', 500);
    }

    // レスポンス用にデータを整形
    const formattedData = {
      id: data.id,
      clinic_id: data.clinic_id,
      name: data.key,
      category: data.key.split('_')[0],
      value: JSON.parse(data.value),
      data_type: data.data_type,
      description: data.description,
      is_editable: data.is_editable,
      is_public: data.is_public,
      updated_at: data.updated_at,
      updated_by: data.updated_by,
    };

    // 監査ログ記録
    await AuditLogger.logDataAccess(
      auth?.id || '',
      auth?.email || '',
      'system_settings',
      data.id,
      data.clinic_id || undefined
    );

    return createSuccessResponse(formattedData, 201, SUCCESS_MESSAGES.CREATED);
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/master-data',
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

// PUT: マスターデータ更新
export async function PUT(request: NextRequest) {
  try {
    // 共通前処理（認証・サニタイゼーション）
    const processResult = await processApiRequest(request, true);
    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth, body } = processResult;

    if (!body || typeof body !== 'object' || !('id' in body) || !body.id) {
      return createErrorResponse('IDが指定されていません', 400);
    }

    // Zodバリデーション（部分更新対応）
    const validationResult = masterDataSchema.partial().safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse(
        ERROR_MESSAGES.VALIDATION_ERROR,
        400,
        validationResult.error.errors
      );
    }

    const {
      id,
      clinic_id,
      name,
      category,
      value,
      data_type,
      description,
      is_editable,
      is_public,
    } = validationResult.data;

    // 更新データを準備
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: auth?.id,
    };

    if (name !== undefined) updateData.key = name;
    if (value !== undefined) updateData.value = JSON.stringify(value);
    if (data_type !== undefined) updateData.data_type = data_type;
    if (description !== undefined) updateData.description = description;
    if (is_editable !== undefined) updateData.is_editable = is_editable;
    if (is_public !== undefined) updateData.is_public = is_public;
    if (clinic_id !== undefined) updateData.clinic_id = clinic_id;

    const { data, error } = await supabase
      .from('system_settings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logError(error, {
        endpoint: '/api/admin/master-data',
        method: 'PUT',
        userId: auth?.id || 'unknown',
        params: { id, name },
      });
      return createErrorResponse('データの更新に失敗しました', 500);
    }

    // レスポンス用にデータを整形
    const formattedData = {
      id: data.id,
      clinic_id: data.clinic_id,
      name: data.key,
      category: data.key.split('_')[0],
      value: JSON.parse(data.value),
      data_type: data.data_type,
      description: data.description,
      is_editable: data.is_editable,
      is_public: data.is_public,
      updated_at: data.updated_at,
      updated_by: data.updated_by,
    };

    // 監査ログ記録
    await AuditLogger.logDataModify(
      auth?.id || '',
      auth?.email || '',
      'system_settings',
      data.id,
      updateData,
      data.clinic_id || undefined
    );

    return createSuccessResponse(formattedData, 200, SUCCESS_MESSAGES.UPDATED);
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/master-data',
      method: 'PUT',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}

// DELETE: マスターデータ削除
export async function DELETE(request: NextRequest) {
  try {
    // 共通前処理（認証・認可チェック）
    const processResult = await processApiRequest(request, false);
    if (!processResult.success) {
      return processResult.error!;
    }

    const { auth } = processResult;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return createErrorResponse('IDが指定されていません', 400);
    }

    // 削除前に対象データを取得（編集可能チェック）
    const { data: existingData, error: fetchError } = await supabase
      .from('system_settings')
      .select('is_editable')
      .eq('id', id)
      .single();

    if (fetchError) {
      return createErrorResponse('データが見つかりません', 404);
    }

    if (!existingData.is_editable) {
      return createErrorResponse('編集不可のデータは削除できません', 403);
    }

    const { error } = await supabase
      .from('system_settings')
      .delete()
      .eq('id', id);

    if (error) {
      logError(error, {
        endpoint: '/api/admin/master-data',
        method: 'DELETE',
        userId: auth?.id || 'unknown',
        params: { id },
      });
      return createErrorResponse('データの削除に失敗しました', 500);
    }

    // 監査ログ記録
    await AuditLogger.logDataDelete(
      auth?.id || '',
      auth?.email || '',
      'system_settings',
      id
    );

    return createSuccessResponse(null, 200, SUCCESS_MESSAGES.DELETED);
  } catch (error) {
    logError(error, {
      endpoint: '/api/admin/master-data',
      method: 'DELETE',
      userId: 'unknown',
    });
    return createErrorResponse('サーバーエラーが発生しました', 500);
  }
}
